"""
Digital Twin API Server

FastAPI server that handles IFC file uploads and triggers
geometry conversion (GLB) and metadata extraction (JSON).
"""

import os
import uuid
import json
import shutil
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import asyncio
from enum import Enum

# Import our conversion modules
from ifc_converter import convert_ifc_to_glb
from ifc_metadata_extractor import extract_metadata, save_metadata, METADATA_SCHEMA_VERSION
from ifc_spatial_hierarchy import extract_spatial_hierarchy, save_hierarchy
from ec_api import router as ec_router
from fm_api import router as fm_router
from config import UPLOAD_DIR, OUTPUT_DIR, ALLOWED_EXTENSIONS, MAX_FILE_SIZE


# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Create FastAPI app
app = FastAPI(
    title="Digital Twin API",
    description="API for converting IFC files to GLB and extracting BIM metadata",
    version="1.0.0"
)

# Include EC router
app.include_router(ec_router)
app.include_router(fm_router)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve output files statically
app.mount("/files", StaticFiles(directory=str(OUTPUT_DIR)), name="files")


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


# In-memory job storage (use Redis/DB in production)
jobs: dict[str, ConversionJob] = {}


def validate_file(file: UploadFile) -> None:
    """Validate uploaded file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )


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


async def process_ifc_file(job_id: str, ifc_path: Path) -> None:
    """
    Background task to process IFC file.
    Converts to GLB and extracts metadata.
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
        
        # 1. Convert IFC to GLB
        print(f"[{job_id}] Converting IFC to GLB...")
        await loop.run_in_executor(
            None, 
            convert_ifc_to_glb, 
            str(ifc_path), 
            str(glb_path)
        )
        
        # 2. Extract metadata (always uses latest schema)
        job.stage = JobStage.EXTRACTING_METADATA
        print(f"[{job_id}] Extracting metadata (schema v{METADATA_SCHEMA_VERSION})...")
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
        
        # 3. Extract spatial hierarchy
        job.stage = JobStage.EXTRACTING_HIERARCHY
        print(f"[{job_id}] Extracting spatial hierarchy...")
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
        
        # Update job with URLs
        job.stage = JobStage.FINALIZING
        job.status = JobStatus.COMPLETED
        job.stage = JobStage.COMPLETED
        job.glb_url = f"/files/{job_id}/model.glb"
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
    file: UploadFile = File(..., description="IFC file to process")
):
    """
    Upload an IFC file for processing.
    
    Returns a job object with ID to track progress.
    The processing happens in the background.
    """
    # Validate file
    validate_file(file)
    
    # Generate unique job ID
    job_id = str(uuid.uuid4())[:8]
    
    # Save uploaded file
    ifc_filename = f"{job_id}_{file.filename}"
    ifc_path = UPLOAD_DIR / ifc_filename
    
    try:
        with open(ifc_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")
    finally:
        file.file.close()
    
    # Create job record
    job = ConversionJob(
        job_id=job_id,
        status=JobStatus.PENDING,
        stage=JobStage.QUEUED,
        ifc_filename=file.filename
    )
    jobs[job_id] = job
    
    # Start background processing
    background_tasks.add_task(process_ifc_file, job_id, ifc_path)
    
    return job


@app.get("/job/{job_id}", response_model=ConversionJob)
async def get_job_status(job_id: str):
    """
    Get the status of a conversion job.
    
    Poll this endpoint to check when processing is complete.
    """
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/jobs", response_model=list[ConversionJob])
async def list_jobs():
    """List all conversion jobs."""
    return list(jobs.values())


@app.delete("/job/{job_id}")
async def delete_job(job_id: str):
    """
    Delete a job and its output files.
    """
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Delete output directory
    job_output_dir = OUTPUT_DIR / job_id
    if job_output_dir.exists():
        shutil.rmtree(job_output_dir)
    
    # Remove from jobs dict
    del jobs[job_id]
    
    return {"message": f"Job {job_id} deleted"}


@app.get("/job/{job_id}/metadata/schema")
async def get_metadata_schema_info(job_id: str):
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
async def upgrade_metadata_schema(job_id: str):
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


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "digital-twin-api"}


# Development server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
