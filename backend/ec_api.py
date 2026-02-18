# api.py
"""
FastAPI router exposing an endpoint to compute embodied carbon
from an uploaded IFC model (identified by job_id).
"""

from pathlib import Path
import glob
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import traceback

from auth_deps import get_current_user
from ec_core import compute_ec_from_ifc
from config import UPLOAD_DIR, EC_DB_PATH
from job_security import ensure_job_access

router = APIRouter()

# --- Request Models for Overrides ---

class MaterialClassOverride(BaseModel):
    density_kg_m3: Optional[float] = None
    EC_avg_kgCO2e_per_kg: Optional[float] = None
    EC_total_kgCO2e: Optional[float] = None

class IfcTypeOverride(BaseModel):
    EC_avg_kgCO2e_per_kg: Optional[float] = None
    EC_total_kgCO2e: Optional[float] = None

class ElementOverride(BaseModel):
    EC_total_kgCO2e: Optional[float] = None

class EcOverrides(BaseModel):
    material_classes: Dict[str, MaterialClassOverride] = {}
    ifc_types: Dict[str, IfcTypeOverride] = {}
    elements: Dict[str, ElementOverride] = {}

class CalculateEcRequest(BaseModel):
    overrides: Optional[EcOverrides] = None

@router.post("/api/ec/calculate/{job_id}")
async def calculate_ec(
    job_id: str,
    request: Optional[CalculateEcRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
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

    # Extract overrides if present
    overrides_dict = request.overrides.dict() if request and request.overrides else None

    # Compute EC
    try:
        result = compute_ec_from_ifc(
            ifc_path=ifc_path,
            ec_db_path=EC_DB_PATH,
            overrides=overrides_dict
        )
    except Exception as e:
        print(f"Error calculating EC: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"EC calculation failed: {type(e).__name__}: {e}",
        )

    return result
