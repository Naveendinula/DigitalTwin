# api.py
"""
FastAPI router exposing an endpoint to compute embodied carbon
from an uploaded IFC model (identified by job_id).
"""

from typing import Dict, Optional
import logging
import json

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth_deps import get_current_user
from ec_core import compute_ec_from_ifc
from config import UPLOAD_DIR, OUTPUT_DIR, EC_DB_PATH
from job_security import ensure_job_access
from utils import find_ifc_for_job

router = APIRouter()
logger = logging.getLogger(__name__)

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

    try:
        ifc_path = find_ifc_for_job(job_id, UPLOAD_DIR)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Extract overrides if present
    overrides_dict = request.overrides.dict() if request and request.overrides else None
    use_cache = overrides_dict is None
    cache_path = OUTPUT_DIR / job_id / "ec_results.json"

    if use_cache and cache_path.exists():
        try:
            with cache_path.open("r", encoding="utf-8") as cache_file:
                return json.load(cache_file)
        except Exception as cache_err:
            logger.warning("Failed to read EC cache for job %s: %s", job_id, cache_err)

    # Compute EC
    try:
        result = compute_ec_from_ifc(
            ifc_path=ifc_path,
            ec_db_path=EC_DB_PATH,
            overrides=overrides_dict
        )
    except Exception as e:
        logger.exception("Error calculating EC for job %s: %s", job_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"EC calculation failed: {type(e).__name__}: {e}",
        )

    if use_cache:
        try:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with cache_path.open("w", encoding="utf-8") as cache_file:
                json.dump(result, cache_file, ensure_ascii=False)
        except Exception as cache_err:
            logger.warning("Failed to write EC cache for job %s: %s", job_id, cache_err)

    return result
