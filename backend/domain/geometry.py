from typing import Optional
import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util import shape as shape_utils

# -----------------------------------------------------------------------------
# Geometry settings (reused across calls – geom is expensive)
# -----------------------------------------------------------------------------
GEOM_SETTINGS = ifcopenshell.geom.settings()
GEOM_SETTINGS.set(GEOM_SETTINGS.USE_WORLD_COORDS, True)
GEOM_SETTINGS.set(GEOM_SETTINGS.DISABLE_OPENING_SUBTRACTIONS, False)


def compute_volume_from_geom(element) -> Optional[float]:
    """
    Compute the solid volume of an element using IfcOpenShell's geom engine.

    Returns
    -------
    float | None
        Volume in m³ (SI), or None if geometry can't be built or isn't volumetric.
    """
    try:
        shape = ifcopenshell.geom.create_shape(GEOM_SETTINGS, element)
    except Exception:
        return None

    try:
        vol_m3 = shape_utils.get_volume(shape.geometry)
    except Exception:
        return None

    if vol_m3 is None or vol_m3 <= 0:
        return None

    return float(vol_m3)


def extract_floor_footprint(verts: list, faces: list) -> tuple[list, float, float] | None:
    """
    Extract a 2D floor footprint polygon from a triangulated mesh.

    Returns `(footprint_points, min_z, max_z)` where `footprint_points` is
    a list of `[x, y]` coordinates, or `None` when extraction fails.
    """
    import numpy as np
    from collections import Counter, defaultdict

    if not verts or not faces:
        return None

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

        v1 = p1 - p0
        v2 = p2 - p0
        normal = np.cross(v1, v2)
        norm_len = np.linalg.norm(normal)
        if norm_len < 1e-10:
            continue
        normal = normal / norm_len

        if normal[2] < -0.9:
            floor_triangles.append((idx0, idx1, idx2))

    if not floor_triangles:
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

    edges = []
    for tri in floor_triangles:
        edges.append(tuple(sorted((tri[0], tri[1]))))
        edges.append(tuple(sorted((tri[1], tri[2]))))
        edges.append(tuple(sorted((tri[2], tri[0]))))

    edge_counts = Counter(edges)
    boundary_edges = [e for e, count in edge_counts.items() if count == 1]

    if not boundary_edges:
        return None

    adjacency = defaultdict(list)
    for e in boundary_edges:
        adjacency[e[0]].append(e[1])
        adjacency[e[1]].append(e[0])

    visited = set()
    polygon_indices = []

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

    footprint = []
    for idx in polygon_indices:
        x = float(verts[idx * 3])
        y = float(verts[idx * 3 + 1])
        footprint.append([x, y])

    min_z = min(all_z) if all_z else 0.0
    max_z = max(all_z) if all_z else 0.0

    return footprint, float(min_z), float(max_z)


def apply_transform_to_footprint(
    footprint: list,
    matrix: list,
    min_z: float,
    max_z: float,
) -> tuple[list, float, float]:
    """
    Apply a 4x4 transform matrix to a 2D footprint and z-bounds.
    """
    if not matrix or len(matrix) < 16:
        return footprint, min_z, max_z

    transformed = []
    for x, y in footprint:
        wx = x * matrix[0] + y * matrix[4] + min_z * matrix[8] + matrix[12]
        wy = x * matrix[1] + y * matrix[5] + min_z * matrix[9] + matrix[13]
        transformed.append([float(wx), float(wy)])

    wz_min = min_z * matrix[10] + matrix[14]
    wz_max = max_z * matrix[10] + matrix[14]

    return transformed, float(wz_min), float(wz_max)
