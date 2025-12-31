"""
FastAPI router exposing HVAC/FM analysis endpoints.
"""

from pathlib import Path
import glob
import json
import traceback
from typing import Any

from fastapi import APIRouter, HTTPException

import ifcopenshell
from ifcopenshell.util import element as ifc_element

from config import UPLOAD_DIR, OUTPUT_DIR
from fm_hvac_core import analyze_hvac_fm
from occupancy_sim import (
    generate_occupancy_snapshot,
    load_current_occupancy,
    save_occupancy_snapshot,
    generate_demo_loop,
)

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


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _extract_space_identifiers(space, psets: dict[str, Any]) -> tuple[str, str]:
    number = ""
    for _, props in psets.items():
        if not isinstance(props, dict):
            continue
        for key, value in props.items():
            if key.lower() in ("number", "roomnumber", "space_number", "space number"):
                number = _clean_text(value)
                break
        if number:
            break

    base_name = _clean_text(getattr(space, "Name", None))
    long_name = _clean_text(getattr(space, "LongName", None))

    room_no = number
    room_name = ""

    if not room_no and base_name and long_name:
        room_no = base_name

    if not room_no and base_name:
        tokens = base_name.split()
        if len(tokens) > 1 and any(char.isdigit() for char in tokens[0]):
            room_no = tokens[0]
            room_name = " ".join(tokens[1:]).strip()

    if not room_name:
        if long_name:
            room_name = long_name
        elif base_name and base_name != room_no:
            room_name = base_name

    return room_no, room_name


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

            psets = ifc_element.get_psets(space) or {}
            room_no, room_name = _extract_space_identifiers(space, psets)

            spaces.append(
                {
                    "globalId": space.GlobalId,
                    "name": _space_label(space),
                    "room_name": room_name,
                    "room_no": room_no,
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


# ============================================================================
# Occupancy Simulation Endpoints
# ============================================================================


def _load_spaces_for_job(job_id: str) -> list[dict]:
    """Load space bboxes for a job, computing if needed."""
    bbox_path = _get_space_bbox_path(job_id)
    if bbox_path.exists():
        with open(bbox_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("spaces", [])

    # Compute space bboxes if not cached
    ifc_path = _find_ifc_for_job(job_id)
    model = ifcopenshell.open(str(ifc_path))
    result = _compute_space_bboxes(model)
    with open(bbox_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    return result.get("spaces", [])


@router.get("/api/occupancy/{job_id}")
async def get_occupancy(job_id: str):
    """
    Get the current occupancy snapshot for a job.
    Returns per-space occupancy counts and totals.
    """
    # Load existing snapshot
    snapshot = load_current_occupancy(job_id)

    if snapshot:
        return snapshot

    # No snapshot exists - generate initial one
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
async def tick_occupancy(job_id: str):
    """
    Advance the occupancy simulation by one tick.
    Uses random walk with time-based patterns.
    """
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
async def reset_occupancy(job_id: str):
    """
    Reset occupancy simulation to fresh initial state.
    """
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

    # Generate fresh snapshot without previous state
    snapshot = generate_occupancy_snapshot(spaces, None)
    save_occupancy_snapshot(job_id, snapshot)
    return snapshot


@router.post("/api/occupancy/demo/{job_id}")
async def generate_demo(job_id: str, frames: int = 30):
    """
    Generate a demo loop of occupancy frames for playback.
    """
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

    # Save demo to disk
    demo_path = OUTPUT_DIR / job_id / "occupancy_demo.json"
    with open(demo_path, "w", encoding="utf-8") as f:
        json.dump({"frames": frames_data}, f, indent=2, ensure_ascii=False)

    return {"frames": frames_data, "count": len(frames_data)}


@router.get("/api/occupancy/demo/{job_id}")
async def get_demo(job_id: str):
    """
    Get the pre-generated demo loop for playback.
    """
    demo_path = OUTPUT_DIR / job_id / "occupancy_demo.json"
    if not demo_path.exists():
        raise HTTPException(status_code=404, detail="Demo not generated yet")

    with open(demo_path, "r", encoding="utf-8") as f:
        return json.load(f)
