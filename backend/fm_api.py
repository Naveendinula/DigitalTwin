"""
FastAPI router exposing HVAC/FM analysis endpoints.
"""

from pathlib import Path
import json
import logging

from fastapi import APIRouter, HTTPException, Depends

import ifcopenshell

from auth_deps import get_current_user
from config import UPLOAD_DIR, OUTPUT_DIR
from fm_hvac_core import analyze_hvac_fm
from job_security import ensure_job_access
from utils import find_ifc_for_job

router = APIRouter()
logger = logging.getLogger(__name__)


def _find_ifc_for_job(job_id: str) -> Path:
    try:
        return find_ifc_for_job(job_id, UPLOAD_DIR)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )


def _get_output_path(job_id: str) -> Path:
    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)
    return job_output_dir / "hvac_fm.json"


@router.post("/api/fm/hvac/analyze/{job_id}")
async def analyze_hvac(job_id: str, current_user: dict = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
    ifc_path = _find_ifc_for_job(job_id)
    output_path = _get_output_path(job_id)

    try:
        model = ifcopenshell.open(str(ifc_path))
        result = analyze_hvac_fm(model)
    except Exception as e:
        logger.exception("Error running HVAC/FM analysis for job %s: %s", job_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"HVAC/FM analysis failed: {type(e).__name__}: {e}",
        )

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save HVAC/FM output: {type(e).__name__}: {e}",
        )

    return {
        "status": "ok",
        "output_url": f"/files/{job_id}/hvac_fm.json",
        "summary": result.get("summary", {}),
    }


@router.get("/api/fm/hvac/{job_id}")
async def get_hvac_results(job_id: str, current_user: dict = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
    output_path = OUTPUT_DIR / job_id / "hvac_fm.json"
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="HVAC/FM result not found")

    try:
        with open(output_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read HVAC/FM output: {type(e).__name__}: {e}",
        )
