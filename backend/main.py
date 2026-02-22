"""
Digital Twin API Server

FastAPI server that handles IFC file uploads and triggers
geometry conversion (GLB) and metadata extraction (JSON).
"""

import uuid
import json
import shutil
import hashlib
import logging
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
import asyncio

# Import our conversion modules
from ifc_metadata_extractor import extract_metadata, save_metadata, METADATA_SCHEMA_VERSION
from ec_api import router as ec_router
from fm_api import router as fm_router
from occupancy_api import router as occupancy_router
from graph_api import router as graph_router, invalidate_graph_cache
from validation_api import router as validation_router
from maintenance_api import router as maintenance_router
from work_order_api import router as work_order_router
from cmms_sync_api import router as cmms_sync_router
from auth_api import router as auth_router
from llm_api import router as llm_router
from auth_deps import get_current_user, get_current_user_optional
from config import (
    APP_ENV,
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
    find_user_job_by_file_hash,
    get_user_job_record,
    is_valid_job_file_token,
    list_user_job_ids,
    list_user_job_records,
    rotate_job_file_access_token,
    require_job_access_user,
    touch_job_opened,
    update_job_record_status,
    user_can_access_job,
)
from fm_sidecar_merger import merge_fm_sidecar
from db import close_db_pool, init_db
from models import ConversionJob, JobStage, JobStatus, UserModelSummary
from tasks import process_ifc_file
from utils import find_ifc_for_job
from url_helpers import build_authenticated_file_url, build_protected_file_url


# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _configure_logging() -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers.clear()

    handler = logging.StreamHandler()
    if APP_ENV == "production":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
        )

    root_logger.addHandler(handler)


logger = logging.getLogger(__name__)
RATE_LIMIT_WINDOW_SECONDS = max(1, int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")))
RATE_LIMIT_MAX_REQUESTS = max(1, int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "180")))
RATE_LIMIT_EXEMPT_PATHS = {"/health"}
_rate_limit_buckets: dict[str, deque[float]] = {}
_rate_limit_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _configure_logging()
    await init_db()
    try:
        yield
    finally:
        await close_db_pool()


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
app.include_router(occupancy_router)
app.include_router(graph_router)
app.include_router(validation_router)
app.include_router(maintenance_router)
app.include_router(work_order_router)
app.include_router(cmms_sync_router)
app.include_router(auth_router)
app.include_router(llm_router)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "Authorization"],
)


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@app.middleware("http")
async def rate_limit_requests(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in RATE_LIMIT_EXEMPT_PATHS:
        return await call_next(request)

    key = f"{_get_client_ip(request)}:{request.url.path}"
    now = time.time()
    retry_after = None

    async with _rate_limit_lock:
        bucket = _rate_limit_buckets.get(key)
        if bucket is None:
            bucket = deque()
            _rate_limit_buckets[key] = bucket

        cutoff = now - RATE_LIMIT_WINDOW_SECONDS
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()

        if len(bucket) >= RATE_LIMIT_MAX_REQUESTS:
            retry_after = max(1, int(bucket[0] + RATE_LIMIT_WINDOW_SECONDS - now))
        else:
            bucket.append(now)

        if not bucket:
            _rate_limit_buckets.pop(key, None)

    if retry_after is not None:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests"},
            headers={"Retry-After": str(retry_after)},
        )

    return await call_next(request)


@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(request: Request, exc: StarletteHTTPException):
    if exc.status_code >= 500:
        logger.error(
            "Sanitizing HTTP %s response for %s %s",
            exc.status_code,
            request.method,
            request.url.path,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": "Internal server error"},
            headers=exc.headers or {},
        )

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers or {},
    )


@app.exception_handler(Exception)
async def handle_unexpected_exception(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
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


# In-memory job storage (use Redis/DB in production)
jobs: dict[str, ConversionJob] = {}


def _sanitize_filename(filename: str) -> str:
    cleaned = Path(filename).name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Filename is required")
    if cleaned in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return cleaned


def _coerce_job_status(value: str | None) -> JobStatus:
    try:
        return JobStatus(str(value or JobStatus.PENDING.value))
    except ValueError:
        return JobStatus.PENDING


def _coerce_job_stage(value: str | None, status: JobStatus) -> JobStage:
    if status == JobStatus.COMPLETED:
        return JobStage.COMPLETED
    if status == JobStatus.FAILED:
        return JobStage.FAILED
    if status == JobStatus.PROCESSING:
        try:
            return JobStage(str(value or JobStage.QUEUED.value))
        except ValueError:
            return JobStage.QUEUED
    return JobStage.QUEUED


def _build_persisted_job(
    job_id: str,
    record: dict[str, Any],
    file_access_token: str | None = None,
) -> ConversionJob:
    output_dir = OUTPUT_DIR / job_id
    glb_path = output_dir / "model.glb"
    metadata_path = output_dir / "metadata.json"
    hierarchy_path = output_dir / "hierarchy.json"

    metadata_exists = metadata_path.exists()
    hierarchy_exists = hierarchy_path.exists()
    glb_exists = glb_path.exists()

    if metadata_exists and hierarchy_exists:
        status = JobStatus.COMPLETED
        stage = JobStage.COMPLETED
        error = None
        if file_access_token:
            glb_url = build_protected_file_url(job_id, "model.glb", file_access_token) if glb_exists else None
            metadata_url = build_protected_file_url(job_id, "metadata.json", file_access_token)
            hierarchy_url = build_protected_file_url(job_id, "hierarchy.json", file_access_token)
        else:
            glb_url = build_authenticated_file_url(job_id, "model.glb") if glb_exists else None
            metadata_url = build_authenticated_file_url(job_id, "metadata.json")
            hierarchy_url = build_authenticated_file_url(job_id, "hierarchy.json")
    else:
        status = _coerce_job_status(record.get("status"))
        stage = _coerce_job_stage(None, status)
        error = "Model outputs missing. Re-upload required." if status == JobStatus.COMPLETED else None
        glb_url = None
        metadata_url = None
        hierarchy_url = None

    return ConversionJob(
        job_id=job_id,
        status=status,
        stage=stage,
        ifc_filename=str(record.get("original_filename") or ""),
        ifc_schema=record.get("ifc_schema"),
        glb_url=glb_url,
        metadata_url=metadata_url,
        hierarchy_url=hierarchy_url,
        error=error,
    )


async def _save_upload_stream(upload: UploadFile, destination: Path, max_bytes: int) -> str:
    """
    Save an uploaded file to disk with a maximum size limit.
    Returns SHA-256 hash of the written bytes.
    """
    def _copy() -> str:
        total_size = 0
        hasher = hashlib.sha256()
        with open(destination, "wb") as buffer:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise ValueError("File exceeds upload size limit")
                buffer.write(chunk)
                hasher.update(chunk)
        return hasher.hexdigest()

    try:
        return await asyncio.to_thread(_copy)
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
        ifc_file_hash = await _save_upload_stream(file, ifc_path, max_bytes=MAX_IFC_UPLOAD_BYTES)
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

            _ = await _save_upload_stream(
                fm_params,
                sidecar_path,
                max_bytes=MAX_FM_SIDECAR_UPLOAD_BYTES,
            )
            logger.info("[%s] FM sidecar saved: %s", job_id, fm_params.filename)
        except ValueError as exc:
            sidecar_path = None
            fm_params_filename = None
            raise HTTPException(status_code=413, detail=str(exc))
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("[%s] Failed to save FM sidecar: %s", job_id, e)
            sidecar_path = None
            fm_params_filename = None
        finally:
            fm_params.file.close()
    
    owner_user_id = int(current_user["id"])

    # Reuse existing model for identical IFC bytes when no sidecar override is provided.
    if not fm_params_filename:
        existing_record = await find_user_job_by_file_hash(owner_user_id, ifc_file_hash)
        if existing_record:
            existing_job_id = str(existing_record["job_id"])
            existing_job = _build_persisted_job(existing_job_id, existing_record)

            if existing_job.status == JobStatus.COMPLETED:
                existing_file_access_token = await rotate_job_file_access_token(existing_job_id, owner_user_id)
                existing_job = _build_persisted_job(
                    existing_job_id,
                    existing_record,
                    file_access_token=existing_file_access_token,
                )
                ifc_path.unlink(missing_ok=True)
                await touch_job_opened(existing_job_id, owner_user_id)
                await update_job_record_status(
                    existing_job_id,
                    status=JobStatus.COMPLETED.value,
                    ifc_schema=existing_job.ifc_schema,
                )
                jobs[existing_job_id] = existing_job
                return existing_job

    try:
        await create_job_record(
            job_id=job_id,
            owner_user_id=owner_user_id,
            original_filename=ifc_original_filename,
            stored_ifc_name=ifc_stored_filename,
            file_access_token=file_access_token,
            file_hash=ifc_file_hash,
            status=JobStatus.PENDING.value,
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
        jobs,
        job_id,
        ifc_path,
        sidecar_path,
        file_access_token,
    )

    return job


@app.get("/job/{job_id}", response_model=ConversionJob)
async def get_job_status(
    job_id: str,
    current_user: dict[str, Any] = Depends(require_job_access_user),
):
    """
    Get the status of a conversion job.
    
    Poll this endpoint to check when processing is complete.
    """
    job = jobs.get(job_id)
    if not job:
        record = await get_user_job_record(job_id, int(current_user["id"]))
        if not record:
            raise HTTPException(status_code=404, detail="Job not found")
        job = _build_persisted_job(job_id, record)
        if job.status == JobStatus.COMPLETED:
            file_access_token = await rotate_job_file_access_token(job_id, int(current_user["id"]))
            job = _build_persisted_job(job_id, record, file_access_token=file_access_token)
        jobs[job_id] = job
    return job


@app.get("/jobs", response_model=list[ConversionJob])
async def list_jobs(current_user: dict[str, Any] = Depends(get_current_user)):
    """List conversion jobs owned by the authenticated user."""
    user_id = int(current_user["id"])
    visible_job_ids = await list_user_job_ids(user_id)
    visible_jobs: dict[str, ConversionJob] = {
        job_id: job for job_id, job in jobs.items() if job_id in visible_job_ids
    }

    missing_job_ids = [job_id for job_id in visible_job_ids if job_id not in visible_jobs]
    for job_id in missing_job_ids:
        record = await get_user_job_record(job_id, user_id)
        if not record:
            continue
        visible_jobs[job_id] = _build_persisted_job(job_id, record)

    return list(visible_jobs.values())


@app.get("/models", response_model=list[UserModelSummary])
async def list_models(current_user: dict[str, Any] = Depends(get_current_user)):
    """List persisted models owned by the authenticated user."""
    user_id = int(current_user["id"])
    records = await list_user_job_records(user_id)
    summaries: list[UserModelSummary] = []

    for record in records:
        job_id = str(record["job_id"])
        job = _build_persisted_job(job_id, record)
        summaries.append(
            UserModelSummary(
                job_id=job_id,
                ifc_filename=str(record.get("original_filename") or ""),
                ifc_schema=record.get("ifc_schema"),
                status=job.status,
                created_at=str(record.get("created_at") or ""),
                updated_at=record.get("updated_at"),
                last_opened_at=record.get("last_opened_at"),
                has_geometry=bool(job.glb_url),
            )
        )

    return summaries


@app.post("/models/{job_id}/open", response_model=ConversionJob)
async def open_model(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Re-open an existing model without re-uploading the IFC."""
    user_id = int(current_user["id"])
    await ensure_job_access(job_id, user_id)

    record = await get_user_job_record(job_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="Job not found")

    job = _build_persisted_job(job_id, record)
    if job.status == JobStatus.COMPLETED:
        file_access_token = await rotate_job_file_access_token(job_id, user_id)
        job = _build_persisted_job(job_id, record, file_access_token=file_access_token)

    await touch_job_opened(job_id, user_id)

    jobs[job_id] = job
    if job.status == JobStatus.COMPLETED:
        await update_job_record_status(
            job_id,
            status=JobStatus.COMPLETED.value,
            ifc_schema=job.ifc_schema,
        )

    return job


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
    invalidate_graph_cache(job_id)
    
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
    try:
        ifc_path = find_ifc_for_job(job_id, UPLOAD_DIR)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, 
            detail="Original IFC file not found. Cannot upgrade metadata without source file."
        )
    
    # Re-extract metadata with latest schema
    try:
        logger.info("[%s] Upgrading metadata to schema v%s...", job_id, METADATA_SCHEMA_VERSION)
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
