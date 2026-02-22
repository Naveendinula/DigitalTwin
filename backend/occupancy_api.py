"""
FastAPI router exposing space bbox and occupancy simulation endpoints.
"""

from pathlib import Path
import json
import logging

from fastapi import APIRouter, HTTPException, Depends

import ifcopenshell
from ifcopenshell.util import element as ifc_element

from auth_deps import get_current_user
from config import UPLOAD_DIR, OUTPUT_DIR
from domain.geometry import extract_floor_footprint
from job_security import ensure_job_access
from occupancy_sim import (
    generate_occupancy_snapshot,
    load_current_occupancy,
    save_occupancy_snapshot,
    generate_demo_loop,
)
from utils import extract_space_identifiers as _extract_space_identifiers, find_ifc_for_job

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
    settings.set(settings.USE_WORLD_COORDS, True)

    spaces = []
    failures = 0

    for space in model.by_type("IfcSpace"):
        try:
            shape = ifcopenshell.geom.create_shape(settings, space)
            verts = getattr(shape.geometry, "verts", None)
            faces = getattr(shape.geometry, "faces", None)

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

            psets = ifc_element.get_psets(space) or {}
            room_no, room_name = _extract_space_identifiers(space, psets)

            footprint = None
            footprint_z_min = min_z
            footprint_z_max = max_z

            if faces:
                result = extract_floor_footprint(list(verts), list(faces))
                if result:
                    footprint, footprint_z_min, footprint_z_max = result

            space_data = {
                "globalId": space.GlobalId,
                "name": _space_label(space),
                "room_name": room_name,
                "room_no": room_no,
                "storey": _space_storey_name(space),
                "bbox": {
                    "min": [min_x, min_y, min_z],
                    "max": [max_x, max_y, max_z],
                },
                "transform": None,
            }

            if footprint and len(footprint) >= 3:
                space_data["footprint"] = footprint
                space_data["footprint_z"] = [footprint_z_min, footprint_z_max]

            spaces.append(space_data)
        except Exception as e:
            logger.warning(
                "Error processing space %s: %s",
                getattr(space, "GlobalId", "unknown"),
                e,
            )
            failures += 1

    return {"spaces": spaces, "failures": failures}


@router.get("/api/spaces/bboxes/{job_id}")
async def get_space_bboxes(job_id: str, current_user: dict = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
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
        logger.exception("Error computing space bboxes for job %s: %s", job_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Space bbox computation failed: {type(e).__name__}: {e}",
        )

    if result.get("failures"):
        logger.warning(
            "Space bbox computation skipped %s spaces due to errors for job %s.",
            result["failures"],
            job_id,
        )

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save space bboxes: {type(e).__name__}: {e}",
        )

    return result


def _load_spaces_for_job(job_id: str) -> list[dict]:
    """Load space bboxes for a job, computing if needed."""
    bbox_path = _get_space_bbox_path(job_id)
    if bbox_path.exists():
        with open(bbox_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("spaces", [])

    ifc_path = _find_ifc_for_job(job_id)
    model = ifcopenshell.open(str(ifc_path))
    result = _compute_space_bboxes(model)
    with open(bbox_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    return result.get("spaces", [])


@router.get("/api/occupancy/{job_id}")
async def get_occupancy(job_id: str, current_user: dict = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
    snapshot = load_current_occupancy(job_id)

    if snapshot:
        return snapshot

    try:
        spaces = _load_spaces_for_job(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load spaces: {type(e).__name__}: {e}",
        )

    if not spaces:
        return {
            "spaces": [],
            "totals": {"totalOccupancy": 0, "totalCapacity": 0},
            "timestamp": None,
        }

    snapshot = generate_occupancy_snapshot(spaces)
    save_occupancy_snapshot(job_id, snapshot)
    return snapshot


@router.post("/api/occupancy/tick/{job_id}")
async def tick_occupancy(job_id: str, current_user: dict = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
    try:
        spaces = _load_spaces_for_job(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load spaces: {type(e).__name__}: {e}",
        )

    if not spaces:
        return {
            "spaces": [],
            "totals": {"totalOccupancy": 0, "totalCapacity": 0},
            "timestamp": None,
        }

    prev_snapshot = load_current_occupancy(job_id)
    snapshot = generate_occupancy_snapshot(spaces, prev_snapshot)
    save_occupancy_snapshot(job_id, snapshot)
    return snapshot


@router.post("/api/occupancy/reset/{job_id}")
async def reset_occupancy(job_id: str, current_user: dict = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
    try:
        spaces = _load_spaces_for_job(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load spaces: {type(e).__name__}: {e}",
        )

    if not spaces:
        return {
            "spaces": [],
            "totals": {"totalOccupancy": 0, "totalCapacity": 0},
            "timestamp": None,
        }

    snapshot = generate_occupancy_snapshot(spaces, None)
    save_occupancy_snapshot(job_id, snapshot)
    return snapshot


@router.post("/api/occupancy/demo/{job_id}")
async def generate_demo(
    job_id: str,
    frames: int = 30,
    current_user: dict = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    try:
        spaces = _load_spaces_for_job(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load spaces: {type(e).__name__}: {e}",
        )

    if not spaces:
        return {"frames": [], "count": 0}

    frames_data = generate_demo_loop(spaces, frames=frames)

    demo_path = OUTPUT_DIR / job_id / "occupancy_demo.json"
    with open(demo_path, "w", encoding="utf-8") as f:
        json.dump({"frames": frames_data}, f, indent=2, ensure_ascii=False)

    return {"frames": frames_data, "count": len(frames_data)}


@router.get("/api/occupancy/demo/{job_id}")
async def get_demo(job_id: str, current_user: dict = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
    demo_path = OUTPUT_DIR / job_id / "occupancy_demo.json"
    if not demo_path.exists():
        raise HTTPException(status_code=404, detail="Demo not generated yet")

    with open(demo_path, "r", encoding="utf-8") as f:
        return json.load(f)
