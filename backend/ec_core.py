# ec_core.py
"""
Core logic for extracting LCA properties from an IFC file and
computing embodied carbon using a material database CSV.

This module is framework-agnostic: you can call compute_ec_from_ifc(...)
from a web API, CLI, or notebook.
"""

from pathlib import Path
from typing import Dict, Any, Optional
import logging

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

logger = logging.getLogger(__name__)

LCA_ROW_COLUMNS = [
    "GlobalId",
    "IfcType",
    "Name",
    "MaterialName",
    "MaterialClass",
    "LayerThickness",
    "LayerShare",
    "Volume_m3",
    "ElementVolume_m3",
    "Area_m2",
    "Length_m",
]


def _get_candidate_elements_for_lca(model) -> list:
    """
    Resolve a schema-compatible element base type for EC extraction.
    """
    candidate_types = ("IfcBuildingElement", "IfcBuiltElement", "IfcElement")

    for ifc_type in candidate_types:
        try:
            entities = list(model.by_type(ifc_type))
        except RuntimeError:
            continue

        if entities:
            logger.info("Using IFC base type %s for EC extraction (%s entities)", ifc_type, len(entities))
            return entities

    logger.warning(
        "No IFC elements found for EC extraction using candidate types: %s",
        ", ".join(candidate_types),
    )
    return []


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

    candidate_elements = _get_candidate_elements_for_lca(model)
    elements_for_lca = []
    for el in candidate_elements:
        if not is_leaf_element(el):
            continue
        if not has_material(el):
            continue
        elements_for_lca.append(el)

    logger.info("Found %s LCA-ready elements", len(elements_for_lca))

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

    df = pd.DataFrame(rows, columns=LCA_ROW_COLUMNS)
    return df


# -----------------------------------------------------------------------------
# EC database loading and EC computation
# -----------------------------------------------------------------------------
def load_ec_db(csv_path: str | Path) -> pd.DataFrame:
    """
    Load the EC database CSV (prac-database.csv) into a normalized structure:

      MaterialClass            e.g. "Concrete", "Steel"
      Density_kg_m3            float
      EC_min_kgCO2e_per_kg     float
      EC_avg_kgCO2e_per_kg     float
      EC_max_kgCO2e_per_kg     float
      Notes                    str
    """
    ec_db = pd.read_csv(str(csv_path))

    required_cols = {
        "MaterialClass",
        "Density_kg_m3",
        "EC_min_kgCO2e_per_kg",
        "EC_avg_kgCO2e_per_kg",
        "EC_max_kgCO2e_per_kg",
        "Notes",
    }
    missing_cols = required_cols.difference(ec_db.columns)
    if missing_cols:
        missing = ", ".join(sorted(missing_cols))
        raise ValueError(f"EC database is missing required columns: {missing}")

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


def load_ifc_elements(ifc_path: Path) -> pd.DataFrame:
    return extract_lca_properties(ifc_path)


def match_materials(df: pd.DataFrame, ec_db: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    df = df.copy()
    ec_db = ec_db.copy()
    df["MaterialClass"] = df["MaterialClass"].astype("string")
    ec_db["MaterialClass"] = ec_db["MaterialClass"].astype("string")

    df_ec = df.merge(
        ec_db,
        on="MaterialClass",
        how="left",
        suffixes=("", "_db"),
    )

    warnings: list[str] = []
    if len(df_ec) > len(df):
        msg = (
            f"Row explosion detected: Input rows {len(df)} -> Merged rows {len(df_ec)}. "
            "Check for duplicate MaterialClass in EC DB."
        )
        warnings.append(msg)
        logger.warning("%s", msg)

    return df_ec, warnings


def apply_overrides(df_ec: pd.DataFrame, overrides: Optional[Dict[str, Any]]) -> pd.DataFrame:
    if overrides:
        # A. Material Class Overrides
        mat_overrides = overrides.get("material_classes", {})
        for mat_class, props in mat_overrides.items():
            mask = df_ec["MaterialClass"] == mat_class
            if props.get("density_kg_m3") is not None:
                df_ec.loc[mask, "Density_kg_m3"] = props["density_kg_m3"]
            if props.get("EC_avg_kgCO2e_per_kg") is not None:
                df_ec.loc[mask, "EC_avg_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                df_ec.loc[mask, "EC_min_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                df_ec.loc[mask, "EC_max_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]

        # B. IFC Type Overrides
        type_overrides = overrides.get("ifc_types", {})
        for ifc_type, props in type_overrides.items():
            mask = df_ec["IfcType"] == ifc_type
            if props.get("EC_avg_kgCO2e_per_kg") is not None:
                df_ec.loc[mask, "EC_avg_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                df_ec.loc[mask, "EC_min_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]
                df_ec.loc[mask, "EC_max_kgCO2e_per_kg"] = props["EC_avg_kgCO2e_per_kg"]

    # Standard per-row mass/EC calculation.
    df_ec["Mass_kg"] = df_ec["Volume_m3"] * df_ec["Density_kg_m3"]
    df_ec["EC_min_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_min_kgCO2e_per_kg"]
    df_ec["EC_avg_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_avg_kgCO2e_per_kg"]
    df_ec["EC_max_kgCO2e"] = df_ec["Mass_kg"] * df_ec["EC_max_kgCO2e_per_kg"]

    # Total EC overrides happen after standard calculation.
    if overrides:
        mat_overrides = overrides.get("material_classes", {})
        for key, props in mat_overrides.items():
            if props.get("EC_total_kgCO2e") is not None:
                total_val = props["EC_total_kgCO2e"]
                mask = (df_ec["MaterialClass"] == key) | (df_ec["MaterialName"] == key)
                matching_count = mask.sum()
                if matching_count > 0:
                    val_per_item = total_val / matching_count
                    df_ec.loc[mask, "EC_avg_kgCO2e"] = val_per_item
                    df_ec.loc[mask, "EC_min_kgCO2e"] = val_per_item
                    df_ec.loc[mask, "EC_max_kgCO2e"] = val_per_item

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

        elem_overrides = overrides.get("elements", {})
        for global_id, props in elem_overrides.items():
            if props.get("EC_total_kgCO2e") is not None:
                mask = df_ec["GlobalId"] == global_id
                matching_indices = df_ec.index[mask].tolist()
                if not matching_indices:
                    continue

                total_ec = props["EC_total_kgCO2e"]
                first_idx = matching_indices[0]
                df_ec.loc[first_idx, "EC_avg_kgCO2e"] = total_ec
                df_ec.loc[first_idx, "EC_min_kgCO2e"] = total_ec
                df_ec.loc[first_idx, "EC_max_kgCO2e"] = total_ec
                if len(matching_indices) > 1:
                    df_ec.loc[
                        matching_indices[1:],
                        ["EC_avg_kgCO2e", "EC_min_kgCO2e", "EC_max_kgCO2e"],
                    ] = 0.0

    return df_ec


def compute_statistics(
    df_ec: pd.DataFrame,
    warnings: list[str],
    max_detail_rows: Optional[int] = None,
) -> Dict[str, Any]:
    missing_mask = df_ec["EC_avg_kgCO2e_per_kg"].isna()
    rows_total = int(len(df_ec))
    rows_missing = int(missing_mask.sum())
    rows_with_factors = rows_total - rows_missing

    missing_classes = sorted(df_ec.loc[missing_mask, "MaterialClass"].dropna().unique().tolist())
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
        "missing_material_names_top": missing_names_top,
    }

    total_min = float(df_ec["EC_min_kgCO2e"].sum(skipna=True))
    total_avg = float(df_ec["EC_avg_kgCO2e"].sum(skipna=True))
    total_max = float(df_ec["EC_max_kgCO2e"].sum(skipna=True))

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

    detail_rows = (
        df_ec[df_ec["EC_avg_kgCO2e"].notna()]
        .sort_values("EC_avg_kgCO2e", ascending=False)
        .copy()
    )
    if max_detail_rows is not None:
        detail_rows = detail_rows.head(max_detail_rows)

    detail_rows = detail_rows.fillna(
        {
            "Volume_m3": 0.0,
            "Mass_kg": 0.0,
            "EC_min_kgCO2e": 0.0,
            "EC_avg_kgCO2e": 0.0,
            "EC_max_kgCO2e": 0.0,
            "Name": "",
            "MaterialName": "",
            "MaterialClass": "",
        }
    )

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
    top_elements = detail_rows[detail_cols].to_dict(orient="records")

    return {
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


def compute_ec_from_ifc(
    ifc_path: str | Path,
    ec_db_path: str | Path,
    max_detail_rows: Optional[int] = None,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    High-level function:
      1) Extract element + layer properties from IFC
      2) Join with EC database
      3) Apply overrides (MaterialClass, IfcType, Element)
      4) Compute mass + EC
      5) Return JSON-serializable summary + (optionally) per-element rows

    max_detail_rows:
      - None to return all rows with computed EC values
      - integer to limit detail rows
    """
    ifc_path = Path(ifc_path)
    ec_db_path = Path(ec_db_path)

    df = load_ifc_elements(ifc_path)
    ec_db = load_ec_db(ec_db_path)
    df_ec, warnings = match_materials(df, ec_db)
    df_ec = apply_overrides(df_ec, overrides)
    return compute_statistics(df_ec, warnings, max_detail_rows)

