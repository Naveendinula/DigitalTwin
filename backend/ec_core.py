# ec_core.py
"""
Core logic for extracting LCA properties from an IFC file and
computing embodied carbon using a material database CSV.

This module is framework-agnostic: you can call compute_ec_from_ifc(...)
from a web API, CLI, or notebook.
"""

from pathlib import Path
from typing import Dict, Any, Optional, List

import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util import element as ifc_element
from ifcopenshell.util import shape as shape_utils

import pandas as pd


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


# -----------------------------------------------------------------------------
# Material classification
# -----------------------------------------------------------------------------
MATERIAL_CLASSES = {
    "Aggregates and Sand": ["aggregate", "sand", "gravel"],
    "Aluminium": ["aluminium", "aluminum"],
    "Asphalt": ["asphalt"],
    "Bitumen": ["bitumen"],
    "Brass": ["brass"],
    "Bricks": ["brick", "bricks"],
    "Bronze": ["bronze"],
    "Carpet": ["carpet"],
    "Cement and Mortar": ["cement", "mortar", "grout"],
    "Ceramics": ["ceramic", "tile"],
    "Clay": ["clay", "terracotta"],
    "Concrete": ["concrete"],
    "Copper": ["copper"],
    "Glass": ["glass", "glazing"],
    "Insulation": ["insulation", "insul", "xps", "eps", "mineral wool", "rockwool"],
    "Iron": ["iron", "wrought iron", "cast iron"],
    "Lead": ["lead"],
    "Lime": ["lime"],
    "Linoleum": ["linoleum"],
    "Miscellaneous": ["misc"],
    "Paint": ["paint", "coating"],
    "Paper": ["paper", "cardboard"],
    "Plaster": ["plaster", "gypsum", "gypboard", "drywall"],
    "Plastics": ["plastic", "poly", "pvc", "hdpe", "ldpe", "acrylic"],
    "Rubber": ["rubber", "neoprene", "epdm"],
    "Sealants and Adhesives": ["sealant", "adhesive", "mastic"],
    "Soil": ["soil", "earth"],
    "Steel": ["steel", "metal stud", "metal-stud"],
    "Stone": ["stone", "granite", "marble", "limestone", "slate"],
    "Timber": ["timber", "wood", "plywood", "osb", "lumber"],
    "Tin": ["tin"],
    "Titanium": ["titanium"],
    "Vinyl": ["vinyl", "vct"],
    "Zinc": ["zinc"],
}


def classify_material(raw_name: Optional[str]) -> Optional[str]:
    """Map a raw IFC material name to one of the high-level material classes."""
    if not raw_name:
        return None
    name = raw_name.lower().strip()

    # Optional: strip generic "cladding" noise
    for generic in ["clad", "cladding"]:
        name = name.replace(generic, "")
    name = name.strip()

    for cls, keywords in MATERIAL_CLASSES.items():
        for kw in keywords:
            if kw in name:
                return cls

    return "Miscellaneous"


# -----------------------------------------------------------------------------
# Material extraction helpers
# -----------------------------------------------------------------------------
def _extract_material_names_from_relating(relating) -> list[str]:
    """Handle different IfcMaterial* constructs and return a list of names."""
    names: List[str] = []

    if relating is None:
        return names

    try:
        if relating.is_a("IfcMaterial"):
            if relating.Name:
                names.append(relating.Name)

        elif relating.is_a("IfcMaterialLayerSetUsage"):
            mls = getattr(relating, "ForLayerSet", None)
            if mls:
                names.extend(_extract_material_names_from_relating(mls))

        elif relating.is_a("IfcMaterialLayerSet"):
            for layer in getattr(relating, "MaterialLayers", []) or []:
                mat = getattr(layer, "Material", None)
                if mat is not None and mat.Name:
                    names.append(mat.Name)

        elif relating.is_a("IfcMaterialConstituentSet"):
            for c in getattr(relating, "MaterialConstituents", []) or []:
                mat = getattr(c, "Material", None)
                if mat is not None and mat.Name:
                    names.append(mat.Name)

        elif relating.is_a("IfcMaterialList"):
            for m in getattr(relating, "Materials", []) or []:
                if m is not None and m.Name:
                    names.append(m.Name)

        elif relating.is_a("IfcMaterialProfileSetUsage"):
            mps = getattr(relating, "ForProfileSet", None)
            if mps:
                mat = getattr(mps, "Material", None)
                if mat is not None and mat.Name:
                    names.append(mat.Name)
                for prof in getattr(mps, "MaterialProfiles", []) or []:
                    mat2 = getattr(prof, "Material", None)
                    if mat2 is not None and mat2.Name:
                        names.append(mat2.Name)
    except AttributeError:
        pass

    # Remove duplicates, keep order
    seen = set()
    unique: List[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            unique.append(n)
    return unique


def get_element_material_names(element) -> list[str]:
    """
    Collect material names for a single element.
    Looks at:
      - Direct IfcRelAssociatesMaterial on the element
      - Materials on its type (IfcRelDefinesByType → RelatingType)
    """
    material_names: set[str] = set()

    # Direct associations
    for rel in (getattr(element, "HasAssociations", []) or []):
        if rel.is_a("IfcRelAssociatesMaterial"):
            material_names.update(
                _extract_material_names_from_relating(rel.RelatingMaterial)
            )

    # Type-based associations
    for rel in (getattr(element, "IsTypedBy", []) or []):
        type_obj = getattr(rel, "RelatingType", None)
        if not type_obj:
            continue
        for rel2 in (getattr(type_obj, "HasAssociations", []) or []):
            if rel2.is_a("IfcRelAssociatesMaterial"):
                material_names.update(
                    _extract_material_names_from_relating(rel2.RelatingMaterial)
                )

    return sorted(material_names)


# -----------------------------------------------------------------------------
# Element helpers
# -----------------------------------------------------------------------------
def is_leaf_element(el) -> bool:
    """True if the element has no children in IfcRelAggregates / IfcRelNests."""
    rels = getattr(el, "IsDecomposedBy", None) or []
    return len(rels) == 0


def has_material(el) -> bool:
    """True if the element (or its type) has any material association."""
    mats = ifc_element.get_materials(el, should_inherit=True)
    return bool(mats)


def is_void_layer(material_name: str) -> bool:
    """
    Return True if the material name suggests a void/air/gap layer
    that should not contribute to embodied carbon or volume share.
    """
    if not material_name:
        return False
    
    name_lower = material_name.lower()
    void_keywords = [
        "air", "vapor", "vapour", "damp", "membrane", 
        "retarder", "void", "cavity"
    ]
    
    for kw in void_keywords:
        if kw in name_lower:
            return True
    return False


def get_material_layers_with_shares(el) -> list[Dict[str, Any]]:
    """
    Returns a list of dicts with:
      - name: material name
      - thickness: layer thickness (IFC length units, e.g. mm from Revit)
      - share: thickness / total_non_void_thickness (ignoring air gaps)

    Only handles layered materials (IfcMaterialLayerSetUsage / IfcMaterialLayerSet).
    For non-layered materials, an empty list is returned; the caller can fall back
    to simple material name lists.
    """
    assoc = ifc_element.get_material(el, should_inherit=True)
    layers: List[Dict[str, Any]] = []

    if not assoc:
        return layers

    # IfcMaterialLayerSetUsage -> ForLayerSet -> MaterialLayers
    if assoc.is_a("IfcMaterialLayerSetUsage"):
        mls = assoc.ForLayerSet
    elif assoc.is_a("IfcMaterialLayerSet"):
        mls = assoc
    else:
        return layers  # not a layered material

    material_layers = getattr(mls, "MaterialLayers", []) or []
    
    # Calculate total thickness of NON-VOID layers only
    total_non_void_thickness = 0.0
    for l in material_layers:
        mat = l.Material
        name = mat.Name if (mat and mat.Name) else ""
        if not is_void_layer(name):
            total_non_void_thickness += (l.LayerThickness or 0.0)

    for l in material_layers:
        t = (l.LayerThickness or 0.0)
        mat = l.Material
        name = mat.Name if (mat and mat.Name) else ""
        
        # If void layer, share is 0. If non-void, share is t / total_non_void
        if is_void_layer(name):
            share = 0.0
        else:
            share = t / total_non_void_thickness if total_non_void_thickness > 0 else 0.0
            
        layers.append({"name": name, "thickness": t, "share": share})

    return layers


def get_base_quantities(el) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """
    Returns (volume_m3, area_m2, length_m) for an element.

    Priority:
      1) Area + length from IFC quantity sets / psets
      2) Volume from geometry (compute_volume_from_geom → m³)
      3) If geometry fails, fall back to any Volume/NetVolume/GrossVolume in psets
         (which may be in odd units depending on exporter).
    """
    psets = ifc_element.get_psets(el) or {}

    vol_pset = None
    area = None
    length = None

    # Scan psets / qto sets for area, length, and a backup volume
    for qset_name, props in psets.items():
        if not isinstance(props, dict):
            continue

        for key, value in props.items():
            k = key.lower()

            # Backup volume candidate (may be dodgy for some elements)
            if vol_pset is None and k in ("netvolume", "grossvolume", "volume"):
                vol_pset = value

            # Area (m²)
            if area is None and k in ("netarea", "grossarea", "area"):
                area = value

            # Length-ish (m) – best effort
            if length is None and k in ("length", "height"):
                length = value

    # Primary: geometry-based volume in m³
    vol_geom = compute_volume_from_geom(el)

    if vol_geom is not None:
        vol = vol_geom
    else:
        vol = vol_pset  # fallback, may be None or weird units

    return vol, area, length


# -----------------------------------------------------------------------------
# IFC → per-layer DataFrame
# -----------------------------------------------------------------------------
def extract_lca_properties(ifc_path: str | Path) -> pd.DataFrame:
    """
    Open IFC and return one row per (element, material/layer) with:
      - GlobalId, IfcType, Name
      - MaterialName, MaterialClass
      - LayerThickness (m), LayerShare
      - Volume_m3 (per material), ElementVolume_m3, Area_m2, Length_m
    """
    model = ifcopenshell.open(str(ifc_path))

    elements_for_lca = []
    for el in model.by_type("IfcBuildingElement"):
        if not is_leaf_element(el):
            continue
        if not has_material(el):
            continue
        elements_for_lca.append(el)

    print(f"Found {len(elements_for_lca)} LCA-ready elements")

    rows: list[Dict[str, Any]] = []
    for el in elements_for_lca:
        # Geometric base quantities
        vol, area, length = get_base_quantities(el)

        # Materials / layers with thickness + share
        layers = get_material_layers_with_shares(el)

        # If we got nothing, fall back to simple material names with equal shares
        if not layers:
            raw_mats = get_element_material_names(el)
            if not raw_mats:
                continue
            share = 1.0 / len(raw_mats)
            layers = [{"name": n, "thickness": None, "share": share} for n in raw_mats]

        for layer in layers:
            mat_name = layer["name"] or ""
            mat_class = classify_material(mat_name) or "Miscellaneous"
            share = layer["share"] or 0.0
            thickness = layer["thickness"]  # may be None

            # Convert thickness to meters only if we actually have a thickness.
            # Revit IFC typically exports MaterialLayer.LayerThickness in mm.
            if thickness is not None:
                thickness_m = float(thickness) / 1000.0
            else:
                thickness_m = None

            # Per-material volume
            layer_vol = 0.0
            
            # If it's a void layer, force volume to 0
            if is_void_layer(mat_name):
                layer_vol = 0.0
            else:
                # Primary: Area * Thickness (if available)
                if area is not None and thickness_m is not None:
                    layer_vol = area * thickness_m
                # Fallback: Element Volume * Share (if available)
                elif vol is not None:
                    layer_vol = vol * share

            rows.append(
                {
                    "GlobalId": el.GlobalId,
                    "IfcType": el.is_a(),
                    "Name": (el.Name or "").strip(),
                    "MaterialName": mat_name,
                    "MaterialClass": mat_class,
                    "LayerThickness": thickness_m,
                    "LayerShare": share,
                    "Volume_m3": layer_vol,
                    "ElementVolume_m3": vol,
                    "Area_m2": area,
                    "Length_m": length,
                }
            )

    df = pd.DataFrame(rows)
    return df


# -----------------------------------------------------------------------------
# EC database loading and EC computation
# -----------------------------------------------------------------------------
def load_ec_db(csv_path: str | Path) -> pd.DataFrame:
    """
    Load the EC database CSV (prac-database.csv) and map its columns into a
    normalized structure:

      MaterialClass            e.g. "Concrete", "Steel"
      Density_kg_m3            float
      EC_min_kgCO2e_per_kg     float
      EC_avg_kgCO2e_per_kg     float
      EC_max_kgCO2e_per_kg     float
      Notes                    str
    """
    db_raw = pd.read_csv(str(csv_path))

    # Reinterpret misaligned columns from the source file:
    ec_db = pd.DataFrame(
        {
            # Join key (e.g., "Concrete", "Steel", "Glass")
            "MaterialClass": db_raw["MaterialName"],

            # density (kg/m3) – actually stored in the 'MaterialClass' column
            "Density_kg_m3": db_raw["MaterialClass"],

            # EC factors (kgCO2e/kg) – shifted one column to the right
            "EC_min_kgCO2e_per_kg": db_raw["Density_kg_m3"],
            "EC_avg_kgCO2e_per_kg": db_raw["EC_min_kgCO2e_per_kg"],
            "EC_max_kgCO2e_per_kg": db_raw["EC_avg_kgCO2e_per_kg"],

            # Notes / source info
            "Notes": db_raw["EC_max_kgCO2e_per_kg"],
        }
    )

    # Ensure numeric
    for col in [
        "Density_kg_m3",
        "EC_min_kgCO2e_per_kg",
        "EC_avg_kgCO2e_per_kg",
        "EC_max_kgCO2e_per_kg",
    ]:
        ec_db[col] = pd.to_numeric(ec_db[col], errors="coerce")

    ec_db["MaterialClass"] = ec_db["MaterialClass"].astype("string")

    # Group by MaterialClass to ensure uniqueness and avoid merge explosion
    ec_db = ec_db.groupby("MaterialClass", as_index=False).agg({
        "Density_kg_m3": "mean",
        "EC_min_kgCO2e_per_kg": "min",
        "EC_avg_kgCO2e_per_kg": "mean",
        "EC_max_kgCO2e_per_kg": "max",
        "Notes": "first"
    })

    return ec_db


def compute_ec_from_ifc(
    ifc_path: str | Path,
    ec_db_path: str | Path,
    max_detail_rows: int = 200,
) -> Dict[str, Any]:
    """
    High-level function:
      1) Extract element + layer properties from IFC
      2) Join with EC database
      3) Compute mass + EC
      4) Return JSON-serializable summary + (optionally) per-element rows
    """
    ifc_path = Path(ifc_path)
    ec_db_path = Path(ec_db_path)

    # 1) LCA-relevant properties from IFC
    df = extract_lca_properties(ifc_path)

    # 2) Load EC database
    ec_db = load_ec_db(ec_db_path)

    # 3) Merge on MaterialClass
    df["MaterialClass"] = df["MaterialClass"].astype("string")
    ec_db["MaterialClass"] = ec_db["MaterialClass"].astype("string")

    df_ec = df.merge(
        ec_db,
        on="MaterialClass",
        how="left",
        suffixes=("", "_db"),
    )

    # Sanity check: ensure we haven't multiplied rows due to many-to-many merge
    warnings = []
    if len(df_ec) > len(df):
        msg = f"Row explosion detected: Input rows {len(df)} -> Merged rows {len(df_ec)}. Check for duplicate MaterialClass in EC DB."
        warnings.append(msg)
        print(f"WARNING: {msg}")

    # 4) Mass and EC per row
    df_ec["Mass_kg"] = df_ec["Volume_m3"] * df_ec["Density_kg_m3"]
    df_ec["EC_min_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_min_kgCO2e_per_kg"]
    df_ec["EC_avg_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_avg_kgCO2e_per_kg"]
    df_ec["EC_max_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_max_kgCO2e_per_kg"]

    # --- Summary: totals ---
    total_min = float(df_ec["EC_min_kgCO2e"].sum(skipna=True))
    total_avg = float(df_ec["EC_avg_kgCO2e"].sum(skipna=True))
    total_max = float(df_ec["EC_max_kgCO2e"].sum(skipna=True))

    # --- Summary: by material class ---
    by_class = (
        df_ec.groupby("MaterialClass")[["EC_min_kgCO2e", "EC_avg_kgCO2e", "EC_max_kgCO2e"]]
        .sum()
        .sort_values("EC_avg_kgCO2e", ascending=False)
    )

    by_class_records = [
        {
            "material_class": cls,
            "ec_min_kgCO2e": float(row["EC_min_kgCO2e"]),
            "ec_avg_kgCO2e": float(row["EC_avg_kgCO2e"]),
            "ec_max_kgCO2e": float(row["EC_max_kgCO2e"]),
        }
        for cls, row in by_class.iterrows()
    ]

    # --- Summary: by IfcType (nice for stakeholders) ---
    by_ifc = (
        df_ec.groupby("IfcType")[["EC_avg_kgCO2e", "Mass_kg", "Volume_m3"]]
        .sum()
        .sort_values("EC_avg_kgCO2e", ascending=False)
    )

    by_ifc_records = [
        {
            "ifc_type": ifc_type,
            "ec_avg_kgCO2e": float(row["EC_avg_kgCO2e"]),
            "mass_kg": float(row["Mass_kg"]),
            "volume_m3": float(row["Volume_m3"]),
        }
        for ifc_type, row in by_ifc.iterrows()
    ]

    # --- Per-element details (limited) ---
    # Top N rows by EC contribution – useful for a table in the UI
    top = (
        df_ec.sort_values("EC_avg_kgCO2e", ascending=False)
        .head(max_detail_rows)
        .copy()
    )
    
    # Fill NaN values with 0 or empty string to ensure JSON compliance
    top = top.fillna({
        "Volume_m3": 0.0,
        "Mass_kg": 0.0,
        "EC_min_kgCO2e": 0.0,
        "EC_avg_kgCO2e": 0.0,
        "EC_max_kgCO2e": 0.0,
        "Name": "",
        "MaterialName": "",
        "MaterialClass": ""
    })

    detail_cols = [
        "GlobalId",
        "IfcType",
        "Name",
        "MaterialName",
        "MaterialClass",
        "Volume_m3",
        "Mass_kg",
        "EC_min_kgCO2e",
        "EC_avg_kgCO2e",
        "EC_max_kgCO2e",
    ]

    top_elements = top[detail_cols].to_dict(orient="records")

    result: Dict[str, Any] = {
        "warnings": warnings,
        "summary": {
            "total": {
                "min_kgCO2e": total_min,
                "avg_kgCO2e": total_avg,
                "max_kgCO2e": total_max,
                "avg_tCO2e": total_avg / 1000.0,
            },
            "by_material_class": by_class_records,
            "by_ifc_type": by_ifc_records,
        },
        "details": {
            "total_elements": int(len(df_ec)),
            "returned_elements": int(len(top_elements)),
            "elements": top_elements,
        },
    }

    return result
