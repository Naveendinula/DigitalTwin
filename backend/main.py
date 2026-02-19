"""
Digital Twin API Server

FastAPI server that handles IFC file uploads and triggers
geometry conversion (GLB) and metadata extraction (JSON).
"""

import uuid
import json
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import asyncio
from enum import Enum

# Import our conversion modules
from ifc_converter import convert_ifc_to_glb
from ifc_metadata_extractor import extract_metadata, save_metadata, METADATA_SCHEMA_VERSION
from ifc_spatial_hierarchy import extract_spatial_hierarchy, save_hierarchy
from ec_api import router as ec_router
from fm_api import router as fm_router
from validation_api import router as validation_router
from maintenance_api import router as maintenance_router
from work_order_api import router as work_order_router
from cmms_sync_api import router as cmms_sync_router
from auth_api import router as auth_router
from auth_deps import get_current_user, get_current_user_optional
from config import (
    FRONTEND_ORIGINS,
    MAX_FM_SIDECAR_UPLOAD_BYTES,
    MAX_IFC_UPLOAD_BYTES,
    UPLOAD_DIR,
    OUTPUT_DIR,
)
from job_security import (
    create_file_access_token,
    create_job_record,
    delete_job_record,
    ensure_job_access,
    is_valid_job_file_token,
    list_user_job_ids,
    require_job_access_user,
    user_can_access_job,
)
from fm_sidecar_merger import find_fm_sidecar, merge_fm_sidecar
from db import init_db


# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield


# Create FastAPI app
app = FastAPI(
    title="Digital Twin API",
    description="API for converting IFC files to GLB and extracting BIM metadata",
    version="1.0.0",
    lifespan=lifespan,
)

# Include EC router
app.include_router(ec_router)
app.include_router(fm_router)
app.include_router(validation_router)
app.include_router(maintenance_router)
app.include_router(work_order_router)
app.include_router(cmms_sync_router)
app.include_router(auth_router)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    )
    return response


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class JobStage(str, Enum):
    QUEUED = "queued"
    CONVERTING_GLB = "converting_glb"
    EXTRACTING_METADATA = "extracting_metadata"
    EXTRACTING_HIERARCHY = "extracting_hierarchy"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    FAILED = "failed"

class ConversionJob(BaseModel):
    job_id: str
    status: JobStatus
    ifc_filename: str
    ifc_schema: Optional[str] = None
    stage: Optional[JobStage] = None
    glb_url: Optional[str] = None
    metadata_url: Optional[str] = None
    hierarchy_url: Optional[str] = None
    error: Optional[str] = None
    fm_params_filename: Optional[str] = None  # FM sidecar filename if provided


# In-memory job storage (use Redis/DB in production)
jobs: dict[str, ConversionJob] = {}


def _sanitize_filename(filename: str) -> str:
    cleaned = Path(filename).name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Filename is required")
    if cleaned in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return cleaned


def _build_protected_file_url(job_id: str, filename: str, file_access_token: str) -> str:
    return f"/files/{job_id}/{filename}?t={file_access_token}"


async def _save_upload_stream(upload: UploadFile, destination: Path, max_bytes: int) -> None:
    """
    Save an uploaded file to disk with a maximum size limit.
    """
    def _copy() -> None:
        total_size = 0
        with open(destination, "wb") as buffer:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise ValueError("File exceeds upload size limit")
                buffer.write(chunk)

    try:
        await asyncio.to_thread(_copy)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def check_metadata_schema(metadata_path: Path) -> int:
    """
    Check the schema version of an existing metadata.json file.
    
    Returns:
        Schema version (1 for legacy flat format, 2+ for wrapped format)
    """
    if not metadata_path.exists():
        return 0
    
    try:
        with open(metadata_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('schemaVersion', 1)  # Default to 1 for legacy format
    except Exception:
        return 0


async def process_ifc_file(
    job_id: str,
    ifc_path: Path,
    sidecar_path: Optional[Path] = None,
    file_access_token: Optional[str] = None,
) -> None:
    """
    Background task to process IFC file.
    Converts to GLB and extracts metadata.
    
    Args:
        job_id: The job ID
        ifc_path: Path to the uploaded IFC file
        sidecar_path: Optional path to FM sidecar JSON file
    """
    job = jobs.get(job_id)
    if not job:
        return
    
    try:
        job.status = JobStatus.PROCESSING
        job.stage = JobStage.CONVERTING_GLB
        
        # Create output directory for this job
        job_output_dir = OUTPUT_DIR / job_id
        job_output_dir.mkdir(parents=True, exist_ok=True)
        
        # Define output paths
        glb_path = job_output_dir / "model.glb"
        metadata_path = job_output_dir / "metadata.json"
        hierarchy_path = job_output_dir / "hierarchy.json"
        
        # Run conversions (these are CPU-bound, run in thread pool)
        loop = asyncio.get_event_loop()
        
        # 1. Convert IFC to GLB (optional - may fail for geometry-less test files)
        print(f"[{job_id}] Converting IFC to GLB...")
        glb_conversion_success = False
        try:
            await loop.run_in_executor(
                None, 
                convert_ifc_to_glb, 
                str(ifc_path), 
                str(glb_path)
            )
            glb_conversion_success = True
            print(f"[{job_id}] GLB conversion successful")
        except Exception as glb_err:
            print(f"[{job_id}] GLB conversion failed (non-fatal for data-only files): {glb_err}")
            # Continue processing - file may still contain metadata and hierarchy
        
        # 2. Extract metadata (always uses latest schema)
        job.stage = JobStage.EXTRACTING_METADATA
        print(f"[{job_id}] Extracting metadata (schema v{METADATA_SCHEMA_VERSION})...")
        try:
            metadata = await loop.run_in_executor(
                None,
                extract_metadata,
                str(ifc_path),
                job.ifc_filename
            )
            
            if "ifcSchema" in metadata:
                job.ifc_schema = metadata["ifcSchema"]

            await loop.run_in_executor(
                None,
                save_metadata,
                metadata,
                str(metadata_path)
            )
            
            # 2b. Merge FM sidecar if present (explicit path or auto-discovered)
            fm_sidecar = sidecar_path  # Use explicit path if provided
            if not fm_sidecar:
                # Fallback: auto-discover sidecar in upload directory
                fm_sidecar = find_fm_sidecar(job.ifc_filename, ifc_path.parent)
            
            if fm_sidecar and fm_sidecar.exists():
                print(f"[{job_id}] Found FM sidecar: {fm_sidecar.name}")
                try:
                    merge_result = await loop.run_in_executor(
                        None,
                        merge_fm_sidecar,
                        metadata_path,
                        fm_sidecar
                    )
                    print(f"[{job_id}] FM sidecar merged: {merge_result['elements_merged']} elements")
                    print(f"[{job_id}]   - Elements in sidecar: {merge_result['elements_in_sidecar']}")
                    print(f"[{job_id}]   - Elements not found in IFC: {merge_result['elements_not_found']}")
                    
                    # Save merge report for debugging
                    merge_report_path = job_output_dir / "fm_merge_report.json"
                    with open(merge_report_path, 'w', encoding='utf-8') as f:
                        json.dump(merge_result, f, indent=2)
                except Exception as fm_err:
                    print(f"[{job_id}] FM sidecar merge failed (non-fatal): {fm_err}")
                    # Continue processing - sidecar errors should not fail the job
        except Exception as meta_err:
            print(f"[{job_id}] Metadata extraction failed (non-fatal): {meta_err}")
            # Save minimal fallback metadata
            fallback_metadata = {
                "schemaVersion": METADATA_SCHEMA_VERSION,
                "ifcSchema": "UNKNOWN",
                "fileName": job.ifc_filename,
                "orientation": {"modelYawDeg": 0, "trueNorthDeg": 0, "orientationSource": "default"},
                "elements": {}
            }
            await loop.run_in_executor(
                None,
                save_metadata,
                fallback_metadata,
                str(metadata_path)
            )

        
        # 3. Extract spatial hierarchy
        job.stage = JobStage.EXTRACTING_HIERARCHY
        print(f"[{job_id}] Extracting spatial hierarchy...")
        try:
            hierarchy = await loop.run_in_executor(
                None,
                extract_spatial_hierarchy,
                str(ifc_path)
            )
            await loop.run_in_executor(
                None,
                save_hierarchy,
                hierarchy,
                str(hierarchy_path)
            )
        except Exception as hier_err:
             print(f"[{job_id}] Hierarchy extraction failed (non-fatal): {hier_err}")
             # Create a minimal fallback hierarchy so frontend doesn't break
             fallback_hierarchy = {
                 "type": "IfcProject",
                 "name": "Hierarchy Extraction Failed",
                 "globalId": "0000000000000000000000",
                 "children": [],
                 "properties": {}
             }
             await loop.run_in_executor(
                None,
                save_hierarchy,
                fallback_hierarchy, 
                str(hierarchy_path)
            )

        # Update job with URLs
        job.stage = JobStage.FINALIZING
        job.status = JobStatus.COMPLETED
        job.stage = JobStage.COMPLETED
        # Only include GLB URL if conversion succeeded
        if glb_conversion_success:
            if file_access_token:
                job.glb_url = _build_protected_file_url(job_id, "model.glb", file_access_token)
            else:
                job.glb_url = f"/files/{job_id}/model.glb"
        else:
            job.glb_url = None  # No geometry available
        if file_access_token:
            job.metadata_url = _build_protected_file_url(job_id, "metadata.json", file_access_token)
            job.hierarchy_url = _build_protected_file_url(job_id, "hierarchy.json", file_access_token)
        else:
            job.metadata_url = f"/files/{job_id}/metadata.json"
            job.hierarchy_url = f"/files/{job_id}/hierarchy.json"
        
        print(f"[{job_id}] Processing completed successfully")
        
    except Exception as e:
        print(f"[{job_id}] Processing failed: {e}")
        job.status = JobStatus.FAILED
        job.stage = JobStage.FAILED
        job.error = str(e)
    
    finally:
        # Clean up uploaded IFC file (optional - keep for debugging)
        # ifc_path.unlink(missing_ok=True)
        pass


@app.post("/upload", response_model=ConversionJob)
async def upload_ifc(
    background_tasks: BackgroundTasks,
    current_user: dict[str, Any] = Depends(get_current_user),
    file: UploadFile = File(..., description="IFC file to process"),
    fm_params: Optional[UploadFile] = File(None, description="Optional FM sidecar JSON file"),
):
    """
    Upload an IFC file for processing.
    
    Optionally include an FM sidecar JSON file (*.fm_params.json) to merge
    FM Readiness parameters into the metadata. The sidecar should be keyed
    by IFC GlobalId with FMReadiness and FMReadinessType property sets.
    
    Returns a job object with ID to track progress.
    The processing happens in the background.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="IFC filename is required")
    ifc_original_filename = _sanitize_filename(file.filename)
    if not ifc_original_filename.lower().endswith(".ifc"):
        raise HTTPException(status_code=400, detail="Only .ifc files are supported")

    job_id = str(uuid.uuid4())[:8]
    file_access_token = create_file_access_token()
    ifc_stored_filename = f"{job_id}_{ifc_original_filename}"
    ifc_path = UPLOAD_DIR / ifc_stored_filename

    try:
        await _save_upload_stream(file, ifc_path, max_bytes=MAX_IFC_UPLOAD_BYTES)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save IFC file: {e}")
    finally:
        file.file.close()

    sidecar_path = None
    fm_params_filename = None
    if fm_params and fm_params.filename:
        try:
            fm_params_filename = _sanitize_filename(fm_params.filename)
            if not (
                fm_params_filename.lower().endswith(".json")
                or fm_params_filename.lower().endswith(".fm_params.json")
            ):
                raise HTTPException(status_code=400, detail="FM sidecar must be a .json file")

            sidecar_filename = f"{job_id}_{fm_params_filename}"
            sidecar_path = UPLOAD_DIR / sidecar_filename

            await _save_upload_stream(
                fm_params,
                sidecar_path,
                max_bytes=MAX_FM_SIDECAR_UPLOAD_BYTES,
            )
            print(f"[{job_id}] FM sidecar saved: {fm_params.filename}")
        except ValueError as exc:
            sidecar_path = None
            fm_params_filename = None
            raise HTTPException(status_code=413, detail=str(exc))
        except HTTPException:
            raise
        except Exception as e:
            print(f"[{job_id}] Warning: Failed to save FM sidecar: {e}")
            sidecar_path = None
            fm_params_filename = None
        finally:
            fm_params.file.close()
    
    owner_user_id = int(current_user["id"])
    try:
        await create_job_record(
            job_id=job_id,
            owner_user_id=owner_user_id,
            original_filename=ifc_original_filename,
            stored_ifc_name=ifc_stored_filename,
            file_access_token=file_access_token,
        )
    except Exception as exc:
        ifc_path.unlink(missing_ok=True)
        if sidecar_path:
            sidecar_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to create job record: {exc}")

    job = ConversionJob(
        job_id=job_id,
        status=JobStatus.PENDING,
        stage=JobStage.QUEUED,
        ifc_filename=ifc_original_filename,
        fm_params_filename=fm_params_filename,
    )
    jobs[job_id] = job

    background_tasks.add_task(
        process_ifc_file,
        job_id,
        ifc_path,
        sidecar_path,
        file_access_token,
    )

    return job


@app.get("/job/{job_id}", response_model=ConversionJob)
async def get_job_status(
    job_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    """
    Get the status of a conversion job.
    
    Poll this endpoint to check when processing is complete.
    """
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/jobs", response_model=list[ConversionJob])
async def list_jobs(current_user: dict[str, Any] = Depends(get_current_user)):
    """List conversion jobs owned by the authenticated user."""
    visible_job_ids = await list_user_job_ids(int(current_user["id"]))
    return [job for job_id, job in jobs.items() if job_id in visible_job_ids]


@app.delete("/job/{job_id}")
async def delete_job(job_id: str, current_user: dict[str, Any] = Depends(get_current_user)):
    """
    Delete a job and its output files.
    """
    user_id = int(current_user["id"])
    await ensure_job_access(job_id, user_id)

    # Delete output directory
    job_output_dir = OUTPUT_DIR / job_id
    if job_output_dir.exists():
        shutil.rmtree(job_output_dir)
    
    # Remove from jobs dict
    if job_id in jobs:
        del jobs[job_id]

    await delete_job_record(job_id, user_id)
    
    return {"message": f"Job {job_id} deleted"}


@app.get("/job/{job_id}/metadata/schema")
async def get_metadata_schema_info(
    job_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    """
    Get schema version info for a job's metadata.
    
    Returns current schema version and whether upgrade is available.
    """
    metadata_path = OUTPUT_DIR / job_id / "metadata.json"
    
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Metadata not found for this job")
    
    current_version = check_metadata_schema(metadata_path)
    
    return {
        "job_id": job_id,
        "currentSchemaVersion": current_version,
        "latestSchemaVersion": METADATA_SCHEMA_VERSION,
        "needsUpgrade": current_version < METADATA_SCHEMA_VERSION
    }


@app.post("/job/{job_id}/metadata/upgrade")
async def upgrade_metadata_schema(
    job_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    """
    Upgrade metadata to latest schema version.
    
    Requires the original IFC file to still be in uploads directory.
    Re-extracts metadata with orientation info.
    """
    metadata_path = OUTPUT_DIR / job_id / "metadata.json"
    
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Metadata not found for this job")
    
    current_version = check_metadata_schema(metadata_path)
    if current_version >= METADATA_SCHEMA_VERSION:
        return {
            "job_id": job_id,
            "message": "Metadata already at latest schema version",
            "schemaVersion": current_version
        }
    
    # Find the original IFC file
    ifc_files = list(UPLOAD_DIR.glob(f"{job_id}_*.ifc"))
    if not ifc_files:
        raise HTTPException(
            status_code=404, 
            detail="Original IFC file not found. Cannot upgrade metadata without source file."
        )
    
    ifc_path = ifc_files[0]
    
    # Re-extract metadata with latest schema
    try:
        print(f"[{job_id}] Upgrading metadata to schema v{METADATA_SCHEMA_VERSION}...")
        metadata = extract_metadata(str(ifc_path))
        save_metadata(metadata, str(metadata_path))
        
        return {
            "job_id": job_id,
            "message": f"Metadata upgraded to schema v{METADATA_SCHEMA_VERSION}",
            "schemaVersion": METADATA_SCHEMA_VERSION,
            "orientation": metadata.get("orientation", {})
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upgrade metadata: {e}")


@app.get("/files/{job_id}/{filename}")
async def get_job_file(
    job_id: str,
    filename: str,
    t: str | None = Query(default=None),
    current_user: dict[str, Any] | None = Depends(get_current_user_optional),
):
    safe_filename = Path(filename).name
    if safe_filename != filename:
        raise HTTPException(status_code=404, detail="File not found")

    is_authorized = False
    if current_user:
        is_authorized = await user_can_access_job(job_id, int(current_user["id"]))
    if not is_authorized and t:
        is_authorized = await is_valid_job_file_token(job_id, t)
    if not is_authorized:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = OUTPUT_DIR / job_id / safe_filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=str(file_path))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "digital-twin-api"}


# Development server
@app.post("/job/{job_id}/fm-sidecar")
async def upload_fm_sidecar(
    job_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
    file: UploadFile = File(...),
):
    """
    Upload an FM sidecar file to merge with existing metadata.

    The sidecar file should be a .fm_params.json file exported from
    the Revit FM Readiness plugin.

    This will merge FM parameters into the metadata.json for the specified job,
    making them visible in the Property Panel.
    """
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Job must be completed before uploading sidecar")

    metadata_path = OUTPUT_DIR / job_id / "metadata.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="Metadata not found for this job")

    if not file.filename:
        raise HTTPException(status_code=400, detail="FM sidecar filename is required")

    safe_name = _sanitize_filename(file.filename)
    if not (safe_name.lower().endswith(".json") or safe_name.lower().endswith(".fm_params.json")):
        raise HTTPException(status_code=400, detail="FM sidecar must be a .json file")

    sidecar_path = OUTPUT_DIR / job_id / safe_name
    try:
        await _save_upload_stream(
            file,
            sidecar_path,
            max_bytes=MAX_FM_SIDECAR_UPLOAD_BYTES,
        )
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc))
    finally:
        file.file.close()

    # Merge sidecar into metadata
    try:
        result = merge_fm_sidecar(metadata_path, sidecar_path)
        return {
            "job_id": job_id,
            "message": "FM sidecar merged successfully",
            "elements_merged": result["elements_merged"],
            "elements_not_found": result["elements_not_found"],
            "errors": result.get("errors", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to merge sidecar: {e}")
    finally:
        # Keep sidecar file for reference
        pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
