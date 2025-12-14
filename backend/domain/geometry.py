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
