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
from ifcopenshell.util import element as ifc_element

import pandas as pd

# Import domain logic
from domain.materials import (
    classify_material, 
    get_element_material_names, 
    get_material_layers_with_shares,
    has_material,
    is_leaf_element,
    is_void_layer
)
from domain.geometry import compute_volume_from_geom


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
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    High-level function:
      1) Extract element + layer properties from IFC
      2) Join with EC database
      3) Apply overrides (MaterialClass, IfcType, Element)
      4) Compute mass + EC
      5) Return JSON-serializable summary + (optionally) per-element rows
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

    # --- Apply Overrides ---
    if overrides:
        # A. Material Class Overrides
        # Applied to all elements with this material class
        mat_overrides = overrides.get("material_classes", {})
        for mat_class, props in mat_overrides.items():
            mask = df_ec["MaterialClass"] == mat_class
            if props.get("density_kg_m3") is not None:
                df_ec.loc[mask, "Density_kg_m3"] = props["density_kg_m3"]
            if props.get("EC_avg_kgCO2e_per_kg") is not None:
                df_ec.loc[mask, "EC_avg_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                # Also update min/max if not provided, to avoid confusion
                df_ec.loc[mask, "EC_min_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                df_ec.loc[mask, "EC_max_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]

        # B. IFC Type Overrides
        # Applied as a fallback or direct override for specific types
        # Note: This is a broad brush. Usually used if material mapping failed.
        type_overrides = overrides.get("ifc_types", {})
        for ifc_type, props in type_overrides.items():
            mask = df_ec["IfcType"] == ifc_type
            if props.get("EC_avg_kgCO2e_per_kg") is not None:
                # Only apply if we don't already have a valid factor (fallback behavior)
                # OR should it override? The prompt says "apply material_classes before merge, ifc_types after merge"
                # Let's assume it overrides the factor for the type.
                df_ec.loc[mask, "EC_avg_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                df_ec.loc[mask, "EC_min_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                df_ec.loc[mask, "EC_max_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                
                # If density is missing, we might need it to compute mass. 
                # But the prompt only mentioned EC factor for types.
                # If density is missing, mass will be NaN, and EC will be NaN unless we set total EC.

    # 4) Mass and EC per row (Standard Calculation)
    df_ec["Mass_kg"] = df_ec["Volume_m3"] * df_ec["Density_kg_m3"]
    df_ec["EC_min_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_min_kgCO2e_per_kg"]
    df_ec["EC_avg_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_avg_kgCO2e_per_kg"]
    df_ec["EC_max_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_max_kgCO2e_per_kg"]

    # --- Apply Total EC Overrides (Material Class & IfcType) ---
    # These are applied AFTER standard calculation but BEFORE element overrides
    if overrides:
        # Material Class Total EC
        mat_overrides = overrides.get("material_classes", {})
        for key, props in mat_overrides.items():
            if props.get("EC_total_kgCO2e") is not None:
                total_val = props["EC_total_kgCO2e"]
                # Match MaterialClass OR MaterialName (since frontend sends MaterialName from missing list)
                mask = (df_ec["MaterialClass"] == key) | (df_ec["MaterialName"] == key)
                
                matching_count = mask.sum()
                if matching_count > 0:
                    # Distribute evenly among all matching rows
                    # This assumes the user means "The total EC for this material in the project is X"
                    val_per_item = total_val / matching_count
                    df_ec.loc[mask, "EC_avg_kgCO2e"] = val_per_item
                    df_ec.loc[mask, "EC_min_kgCO2e"] = val_per_item
                    df_ec.loc[mask, "EC_max_kgCO2e"] = val_per_item
                    
                    # We do NOT update per-kg factors because we might not have mass/volume
                    # This ensures the final sum is correct.

        # IfcType Total EC
        type_overrides = overrides.get("ifc_types", {})
        for key, props in type_overrides.items():
            if props.get("EC_total_kgCO2e") is not None:
                total_val = props["EC_total_kgCO2e"]
                mask = df_ec["IfcType"] == key
                
                matching_count = mask.sum()
                if matching_count > 0:
                    val_per_item = total_val / matching_count
                    df_ec.loc[mask, "EC_avg_kgCO2e"] = val_per_item
                    df_ec.loc[mask, "EC_min_kgCO2e"] = val_per_item
                    df_ec.loc[mask, "EC_max_kgCO2e"] = val_per_item

    # C. Element Overrides (Specific GlobalId)
    # "If EC_total_kgCO2e is present, use it directly."
    # This happens AFTER standard calculation to overwrite it.
    if overrides:
        elem_overrides = overrides.get("elements", {})
        for global_id, props in elem_overrides.items():
            if props.get("EC_total_kgCO2e") is not None:
                mask = df_ec["GlobalId"] == global_id
                total_ec = props["EC_total_kgCO2e"]
                
                # If an element has multiple layers (rows), how do we distribute the total EC?
                # The simplest approach is to assign it to the first layer and zero others, 
                # or split it. But typically overrides are for "unexploded" elements.
                # Let's check how many rows match.
                matching_indices = df_ec.index[mask].tolist()
                if not matching_indices:
                    continue
                
                # If multiple rows (layers), we can't easily know how to split.
                # Strategy: Assign full value to the first row, 0 to others.
                # This ensures the sum is correct.
                first_idx = matching_indices[0]
                df_ec.loc[first_idx, "EC_avg_kgCO2e"] = total_ec
                df_ec.loc[first_idx, "EC_min_kgCO2e"] = total_ec
                df_ec.loc[first_idx, "EC_max_kgCO2e"] = total_ec
                
                # Zero out the rest
                if len(matching_indices) > 1:
                    df_ec.loc[matching_indices[1:], ["EC_avg_kgCO2e", "EC_min_kgCO2e", "EC_max_kgCO2e"]] = 0.0

    # --- Quality / Coverage Stats ---
    # Check which rows failed to map to an EC factor
    # We assume if EC_avg_kgCO2e_per_kg is NaN, we missed it.
    missing_mask = df_ec["EC_avg_kgCO2e_per_kg"].isna()
    rows_total = int(len(df_ec))
    rows_missing = int(missing_mask.sum())
    rows_with_factors = rows_total - rows_missing
    
    missing_classes = sorted(df_ec.loc[missing_mask, "MaterialClass"].dropna().unique().tolist())
    
    # Top missing material names
    missing_names_series = df_ec.loc[missing_mask, "MaterialName"].value_counts().head(5)
    missing_names_top = [
        {"name": name, "count": int(count)}
        for name, count in missing_names_series.items()
    ]
    
    quality_stats = {
        "rows_total": rows_total,
        "rows_with_factors": rows_with_factors,
        "rows_missing_factors": rows_missing,
        "missing_material_classes": missing_classes,
        "missing_material_names_top": missing_names_top
    }

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
        "quality": quality_stats,
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
