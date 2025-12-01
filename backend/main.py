"""
Digital Twin API Server

FastAPI server that handles IFC file uploads and triggers
geometry conversion (GLB) and metadata extraction (JSON).
"""

import os
import uuid
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
from ifc_metadata_extractor import extract_metadata, save_metadata
from ifc_spatial_hierarchy import extract_spatial_hierarchy, save_hierarchy


# Configuration
UPLOAD_DIR = Path("./uploads")
OUTPUT_DIR = Path("./output")
ALLOWED_EXTENSIONS = {".ifc"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Create FastAPI app
app = FastAPI(
    title="Digital Twin API",
    description="API for converting IFC files to GLB and extracting BIM metadata",
    version="1.0.0"
)

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


class ConversionJob(BaseModel):
    job_id: str
    status: JobStatus
    ifc_filename: str
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
        
        # 2. Extract metadata
        print(f"[{job_id}] Extracting metadata...")
        metadata = await loop.run_in_executor(
            None,
            extract_metadata,
            str(ifc_path)
        )
        await loop.run_in_executor(
            None,
            save_metadata,
            metadata,
            str(metadata_path)
        )
        
        # 3. Extract spatial hierarchy
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
        job.status = JobStatus.COMPLETED
        job.glb_url = f"/files/{job_id}/model.glb"
        job.metadata_url = f"/files/{job_id}/metadata.json"
        job.hierarchy_url = f"/files/{job_id}/hierarchy.json"
        
        print(f"[{job_id}] Processing completed successfully")
        
    except Exception as e:
        print(f"[{job_id}] Processing failed: {e}")
        job.status = JobStatus.FAILED
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


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "digital-twin-api"}


# Development server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
