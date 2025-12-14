# api.py
"""
FastAPI router exposing an endpoint to compute embodied carbon
from an uploaded IFC model (identified by job_id).
"""

from pathlib import Path
import glob

from fastapi import APIRouter, HTTPException
import traceback

from ec_core import compute_ec_from_ifc
from config import UPLOAD_DIR, EC_DB_PATH

router = APIRouter()

@router.post("/api/ec/calculate/{job_id}")
async def calculate_ec(job_id: str):
    if not EC_DB_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"EC database not found at {EC_DB_PATH}",
        )

    # Find the file in uploads directory starting with job_id
    # The pattern is {job_id}_*.ifc
    search_pattern = str(UPLOAD_DIR / f"{job_id}_*.ifc")
    matching_files = glob.glob(search_pattern)
    
    if not matching_files:
        raise HTTPException(
            status_code=404,
            detail=f"No IFC file found for job ID {job_id}",
        )
        
    # Use the first matching file
    ifc_path = Path(matching_files[0])

    # Compute EC
    try:
        result = compute_ec_from_ifc(
            ifc_path=ifc_path,
            ec_db_path=EC_DB_PATH,
            max_detail_rows=200,
        )
    except Exception as e:
        print(f"Error calculating EC: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"EC calculation failed: {type(e).__name__}: {e}",
        )

    return result
