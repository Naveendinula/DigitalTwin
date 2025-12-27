"""
FastAPI router exposing HVAC/FM analysis endpoints.
"""

from pathlib import Path
import glob
import json
import traceback

from fastapi import APIRouter, HTTPException

import ifcopenshell
from ifcopenshell.util import element as ifc_element

from config import UPLOAD_DIR, OUTPUT_DIR
from fm_hvac_core import analyze_hvac_fm

router = APIRouter()


def _find_ifc_for_job(job_id: str) -> Path:
    search_pattern = str(UPLOAD_DIR / f"{job_id}_*.ifc")
    matching_files = glob.glob(search_pattern)
    if not matching_files:
        raise HTTPException(
            status_code=404,
            detail=f"No IFC file found for job ID {job_id}",
        )
    return Path(matching_files[0])


def _get_output_path(job_id: str) -> Path:
    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)
    return job_output_dir / "hvac_fm.json"


def _get_space_bbox_path(job_id: str) -> Path:
    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)
    return job_output_dir / "space_bboxes.json"


def _space_label(space) -> str:
    name = (space.Name or "").strip() if hasattr(space, "Name") else ""
    if name:
        return name

    long_name = (space.LongName or "").strip() if hasattr(space, "LongName") else ""
    if long_name:
        return long_name

    psets = ifc_element.get_psets(space) or {}
    for _, props in psets.items():
        if not isinstance(props, dict):
            continue
        for key, value in props.items():
            if key.lower() in ("number", "roomnumber", "space_number", "space number"):
                return str(value).strip()

    return ""


def _space_storey_name(space) -> str:
    try:
        storey = ifc_element.get_container(space, ifc_class="IfcBuildingStorey")
    except Exception:
        storey = None
    if storey:
        return (storey.Name or "").strip()
    return ""


def _compute_space_bboxes(model) -> dict:
    try:
        import ifcopenshell.geom
    except Exception as e:
        raise RuntimeError(f"IfcOpenShell geometry module not available: {e}")

    settings = ifcopenshell.geom.settings()
    # Compute in local coords, then apply translation only (skip rotation).
    settings.set(settings.USE_WORLD_COORDS, False)

    spaces = []
    failures = 0

    for space in model.by_type("IfcSpace"):
        try:
            shape = ifcopenshell.geom.create_shape(settings, space)
            verts = getattr(shape.geometry, "verts", None)
            if not verts:
                failures += 1
                continue

            min_x = min_y = min_z = float("inf")
            max_x = max_y = max_z = float("-inf")
            for i in range(0, len(verts), 3):
                x = float(verts[i])
                y = float(verts[i + 1])
                z = float(verts[i + 2])
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if z < min_z:
                    min_z = z
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y
                if z > max_z:
                    max_z = z

            if min_x == float("inf"):
                failures += 1
                continue

            trans = getattr(shape, "transformation", None)
            matrix = None
            if trans and hasattr(trans, "matrix"):
                matrix = [float(v) for v in trans.matrix]

            spaces.append(
                {
                    "globalId": space.GlobalId,
                    "name": _space_label(space),
                    "storey": _space_storey_name(space),
                    "bbox": {
                        "min": [min_x, min_y, min_z],
                        "max": [max_x, max_y, max_z],
                    },
                    "transform": matrix,
                }
            )
        except Exception:
            failures += 1

    return {"spaces": spaces, "failures": failures}


@router.post("/api/fm/hvac/analyze/{job_id}")
async def analyze_hvac(job_id: str):
    ifc_path = _find_ifc_for_job(job_id)
    output_path = _get_output_path(job_id)

    try:
        model = ifcopenshell.open(str(ifc_path))
        result = analyze_hvac_fm(model)
    except Exception as e:
        print(f"Error running HVAC/FM analysis: {e}")
        traceback.print_exc()
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
async def get_hvac_results(job_id: str):
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


@router.get("/api/spaces/bboxes/{job_id}")
async def get_space_bboxes(job_id: str):
    output_path = _get_space_bbox_path(job_id)
    if output_path.exists():
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to read space bboxes: {type(e).__name__}: {e}",
            )

    ifc_path = _find_ifc_for_job(job_id)

    try:
        model = ifcopenshell.open(str(ifc_path))
        result = _compute_space_bboxes(model)
    except Exception as e:
        print(f"Error computing space bboxes: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Space bbox computation failed: {type(e).__name__}: {e}",
        )

    if result.get("failures"):
        print(f"Space bbox computation skipped {result['failures']} spaces due to errors.")

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save space bboxes: {type(e).__name__}: {e}",
        )

    return result
