"""
FastAPI router exposing HVAC/FM analysis endpoints.
"""

from pathlib import Path
import glob
import json
import traceback
from typing import Any

from fastapi import APIRouter, HTTPException, Depends

import ifcopenshell
from ifcopenshell.util import element as ifc_element

from auth_deps import get_current_user
from config import UPLOAD_DIR, OUTPUT_DIR
from fm_hvac_core import analyze_hvac_fm
from job_security import ensure_job_access
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


def _extract_floor_footprint(verts: list, faces: list) -> tuple[list, float, float] | None:
    """
    Extract the floor footprint polygon from a 3D mesh.
    
    Returns a tuple of (footprint_points, min_z, max_z) where footprint_points
    is a list of [x, y] coordinates forming the floor boundary polygon,
    or None if extraction fails.
    """
    import numpy as np
    from collections import Counter, defaultdict
    
    if not verts or not faces:
        return None
    
    # Group vertices into triangles
    num_triangles = len(faces) // 3
    if num_triangles == 0:
        return None
    
    floor_triangles = []
    all_z = []
    
    for i in range(num_triangles):
        idx0 = faces[i * 3]
        idx1 = faces[i * 3 + 1]
        idx2 = faces[i * 3 + 2]
        
        p0 = np.array([verts[idx0 * 3], verts[idx0 * 3 + 1], verts[idx0 * 3 + 2]])
        p1 = np.array([verts[idx1 * 3], verts[idx1 * 3 + 1], verts[idx1 * 3 + 2]])
        p2 = np.array([verts[idx2 * 3], verts[idx2 * 3 + 1], verts[idx2 * 3 + 2]])
        
        all_z.extend([p0[2], p1[2], p2[2]])
        
        # Calculate face normal
        v1 = p1 - p0
        v2 = p2 - p0
        normal = np.cross(v1, v2)
        norm_len = np.linalg.norm(normal)
        if norm_len < 1e-10:
            continue
        normal = normal / norm_len
        
        # Check if face is pointing down (floor face) - normal.z < -0.9
        if normal[2] < -0.9:
            floor_triangles.append((idx0, idx1, idx2))
    
    if not floor_triangles:
        # Fallback: try faces pointing up (some IFCs have inverted normals)
        for i in range(num_triangles):
            idx0 = faces[i * 3]
            idx1 = faces[i * 3 + 1]
            idx2 = faces[i * 3 + 2]
            
            p0 = np.array([verts[idx0 * 3], verts[idx0 * 3 + 1], verts[idx0 * 3 + 2]])
            p1 = np.array([verts[idx1 * 3], verts[idx1 * 3 + 1], verts[idx1 * 3 + 2]])
            p2 = np.array([verts[idx2 * 3], verts[idx2 * 3 + 1], verts[idx2 * 3 + 2]])
            
            v1 = p1 - p0
            v2 = p2 - p0
            normal = np.cross(v1, v2)
            norm_len = np.linalg.norm(normal)
            if norm_len < 1e-10:
                continue
            normal = normal / norm_len
            
            if normal[2] > 0.9:
                floor_triangles.append((idx0, idx1, idx2))
    
    if not floor_triangles:
        return None
    
    # Collect edges from floor triangles
    edges = []
    for tri in floor_triangles:
        edges.append(tuple(sorted((tri[0], tri[1]))))
        edges.append(tuple(sorted((tri[1], tri[2]))))
        edges.append(tuple(sorted((tri[2], tri[0]))))
    
    # Boundary edges appear exactly once (interior edges appear twice)
    edge_counts = Counter(edges)
    boundary_edges = [e for e, count in edge_counts.items() if count == 1]
    
    if not boundary_edges:
        return None
    
    # Build adjacency map for edge chaining
    adjacency = defaultdict(list)
    for e in boundary_edges:
        adjacency[e[0]].append(e[1])
        adjacency[e[1]].append(e[0])
    
    # Chain edges to form ordered polygon
    visited = set()
    polygon_indices = []
    
    # Start from first boundary edge
    start = boundary_edges[0][0]
    current = start
    
    while True:
        if current in visited:
            break
        visited.add(current)
        polygon_indices.append(current)
        
        neighbors = adjacency[current]
        next_vertex = None
        for n in neighbors:
            if n not in visited:
                next_vertex = n
                break
        
        if next_vertex is None:
            break
        current = next_vertex
    
    if len(polygon_indices) < 3:
        return None
    
    # Extract 2D coordinates (X, Y) for the footprint
    footprint = []
    for idx in polygon_indices:
        x = float(verts[idx * 3])
        y = float(verts[idx * 3 + 1])
        footprint.append([x, y])
    
    min_z = min(all_z) if all_z else 0.0
    max_z = max(all_z) if all_z else 0.0
    
    return footprint, float(min_z), float(max_z)


def _apply_transform_to_footprint(footprint: list, matrix: list, min_z: float, max_z: float) -> tuple[list, float, float]:
    """
    Apply a 4x4 transformation matrix to a 2D footprint.
    Returns transformed footprint and Z bounds in world coordinates.
    
    Matrix is column-major (OpenGL style):
    [m0 m4 m8  m12]
    [m1 m5 m9  m13]
    [m2 m6 m10 m14]
    [m3 m7 m11 m15]
    """
    if not matrix or len(matrix) < 16:
        return footprint, min_z, max_z
    
    transformed = []
    for x, y in footprint:
        # Transform with Z = min_z (floor level)
        wx = x * matrix[0] + y * matrix[4] + min_z * matrix[8] + matrix[12]
        wy = x * matrix[1] + y * matrix[5] + min_z * matrix[9] + matrix[13]
        transformed.append([float(wx), float(wy)])
    
    # Transform Z bounds
    wz_min = min_z * matrix[10] + matrix[14]
    wz_max = max_z * matrix[10] + matrix[14]
    
    return transformed, float(wz_min), float(wz_max)


def _compute_space_bboxes(model) -> dict:
    try:
        import ifcopenshell.geom
    except Exception as e:
        raise RuntimeError(f"IfcOpenShell geometry module not available: {e}")

    settings = ifcopenshell.geom.settings()
    # Use world coordinates directly for proper alignment
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

            # Compute bbox (still useful for fallback and area estimation)
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

            # Extract footprint polygon
            footprint = None
            footprint_z_min = min_z
            footprint_z_max = max_z
            
            if faces:
                result = _extract_floor_footprint(list(verts), list(faces))
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
                "transform": None,  # World coords, no transform needed
            }
            
            # Add footprint if successfully extracted
            if footprint and len(footprint) >= 3:
                space_data["footprint"] = footprint
                space_data["footprint_z"] = [footprint_z_min, footprint_z_max]
            
            spaces.append(space_data)
        except Exception as e:
            print(f"Error processing space {getattr(space, 'GlobalId', 'unknown')}: {e}")
            failures += 1

    return {"spaces": spaces, "failures": failures}


@router.post("/api/fm/hvac/analyze/{job_id}")
async def analyze_hvac(job_id: str, current_user: dict = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
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
async def get_occupancy(job_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get the current occupancy snapshot for a job.
    Returns per-space occupancy counts and totals.
    """
    await ensure_job_access(job_id, int(current_user["id"]))
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
async def tick_occupancy(job_id: str, current_user: dict = Depends(get_current_user)):
    """
    Advance the occupancy simulation by one tick.
    Uses random walk with time-based patterns.
    """
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
    """
    Reset occupancy simulation to fresh initial state.
    """
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

    # Generate fresh snapshot without previous state
    snapshot = generate_occupancy_snapshot(spaces, None)
    save_occupancy_snapshot(job_id, snapshot)
    return snapshot


@router.post("/api/occupancy/demo/{job_id}")
async def generate_demo(
    job_id: str,
    frames: int = 30,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a demo loop of occupancy frames for playback.
    """
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

    # Save demo to disk
    demo_path = OUTPUT_DIR / job_id / "occupancy_demo.json"
    with open(demo_path, "w", encoding="utf-8") as f:
        json.dump({"frames": frames_data}, f, indent=2, ensure_ascii=False)

    return {"frames": frames_data, "count": len(frames_data)}


@router.get("/api/occupancy/demo/{job_id}")
async def get_demo(job_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get the pre-generated demo loop for playback.
    """
    await ensure_job_access(job_id, int(current_user["id"]))
    demo_path = OUTPUT_DIR / job_id / "occupancy_demo.json"
    if not demo_path.exists():
        raise HTTPException(status_code=404, detail="Demo not generated yet")

    with open(demo_path, "r", encoding="utf-8") as f:
        return json.load(f)
