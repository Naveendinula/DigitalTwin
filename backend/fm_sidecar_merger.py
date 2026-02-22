"""
FM Sidecar Merger

Merges FM parameter sidecar files (*.fm_params.json) into IFC metadata.
This allows Revit FM parameters to appear in the DigitalTwin viewer's
Property Panel without modifying the IFC export process.

FM Sidecar Contract:
--------------------
JSON schema keyed by IFC GlobalId:
{
    "<IFC_GlobalId>": {
        "FMReadiness": {
            "FM_Barcode": "string or null",
            "FM_UniqueAssetId": "string or null",
            "FM_Criticality": "string or null",
            "FM_InstallationDate": "string or null",
            ...other FM instance parameters
        },
        "FMReadinessType": {
            "Manufacturer": "string or null",
            "Model": "string or null",
            "TypeMark": "string or null",
            ...other FM type parameters
        },
        "_meta": {
            "RevitElementId": number,
            "RevitUniqueId": "string",
            "Category": "string",
            "Family": "string",
            "TypeName": "string"
        }
    }
}

Behavior:
- Missing keys in sidecar: warn and continue
- Malformed data: log error and skip element, continue with others
- GlobalId not found in metadata: increment not_found count, continue
- Sidecar errors are NON-FATAL: always continue processing

Usage:
    # In backend/main.py:
    from fm_sidecar_merger import merge_fm_sidecar, find_fm_sidecar

    # During IFC processing:
    sidecar_path = find_fm_sidecar(ifc_filename, upload_dir)
    if sidecar_path:
        merge_fm_sidecar(metadata_path, sidecar_path)
"""

import json
import logging
from pathlib import Path
from typing import Optional, List
import re

logger = logging.getLogger(__name__)


def validate_global_id(global_id: str) -> bool:
    """
    Validate that a string looks like a valid IFC GlobalId.
    IFC GlobalIds are 22 characters from base64 alphabet.
    
    Args:
        global_id: String to validate
        
    Returns:
        True if valid IFC GlobalId format
    """
    if not isinstance(global_id, str):
        return False
    # IFC GlobalId is 22 chars, alphanumeric + underscore + dollar
    if len(global_id) != 22:
        return False
    # Allow alphanumeric plus typical IFC GlobalId chars
    return bool(re.match(r'^[A-Za-z0-9_$]+$', global_id))


def validate_sidecar_structure(sidecar: dict) -> tuple[bool, List[str]]:
    """
    Validate the structure of an FM sidecar JSON.
    
    Args:
        sidecar: Parsed sidecar dictionary
        
    Returns:
        Tuple of (is_valid, list of warning messages)
    """
    warnings = []
    
    if not isinstance(sidecar, dict):
        return False, ["Sidecar root must be a dictionary keyed by IFC GlobalId"]
    
    if len(sidecar) == 0:
        warnings.append("Sidecar is empty (no elements)")
        return True, warnings
    
    # Check a sample of keys for valid GlobalId format
    sample_keys = list(sidecar.keys())[:5]
    invalid_keys = [k for k in sample_keys if not validate_global_id(k)]
    if invalid_keys:
        warnings.append(f"Some keys don't look like valid IFC GlobalIds: {invalid_keys}")
    
    # Check structure of first few elements
    for global_id in sample_keys[:3]:
        fm_data = sidecar[global_id]
        if not isinstance(fm_data, dict):
            warnings.append(f"Element {global_id}: value must be a dictionary")
            continue
        
        has_fm = "FMReadiness" in fm_data or "FMReadinessType" in fm_data
        if not has_fm:
            warnings.append(f"Element {global_id}: missing both FMReadiness and FMReadinessType")
    
    return True, warnings


def find_fm_sidecar(ifc_filename: str, search_dir: Path) -> Optional[Path]:
    """
    Find the FM sidecar file for an IFC file.
    
    Looks for files matching these patterns:
    - {ifc_basename}.fm_params.json
    - {ifc_basename}_FM.fm_params.json
    
    Args:
        ifc_filename: Name of the IFC file (e.g., "model.ifc")
        search_dir: Directory to search in
        
    Returns:
        Path to sidecar file if found, None otherwise
    """
    base_name = Path(ifc_filename).stem
    
    # Try different naming patterns
    patterns = [
        f"{base_name}.fm_params.json",
        f"{base_name}_FM.fm_params.json",
        f"{base_name}.fm.json",
    ]
    
    for pattern in patterns:
        sidecar_path = search_dir / pattern
        if sidecar_path.exists():
            return sidecar_path
    
    # Also look for any .fm_params.json file that starts with similar name
    for file in search_dir.glob("*.fm_params.json"):
        if file.stem.startswith(base_name.split("_")[0]):
            return file
            
    return None


def merge_fm_sidecar(metadata_path: Path, sidecar_path: Path) -> dict:
    """
    Merge FM sidecar data into metadata.json.
    
    The sidecar file structure:
    {
        "<IFC_GlobalId>": {
            "FMReadiness": { FM instance params... },
            "FMReadinessType": { FM type params... },
            "_meta": { Revit metadata... }
        }
    }
    
    Merges into metadata.elements[GlobalId].properties:
    {
        "FMReadiness": { ... },
        "FMReadinessType": { ... }
    }
    
    Args:
        metadata_path: Path to metadata.json
        sidecar_path: Path to *.fm_params.json sidecar file
        
    Returns:
        Dictionary with merge statistics
    """
    result = {
        "sidecar_file": str(sidecar_path),
        "elements_in_sidecar": 0,
        "elements_merged": 0,
        "elements_not_found": 0,
        "elements_with_errors": 0,
        "unmatched_global_ids": [],
        "validation_warnings": [],
        "errors": []
    }
    
    try:
        # Load metadata
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        
        # Handle both schema v1 (flat) and v2 (wrapped)
        if "elements" in metadata:
            elements = metadata["elements"]
        else:
            elements = metadata
        
        # Load and validate sidecar
        with open(sidecar_path, 'r', encoding='utf-8') as f:
            sidecar = json.load(f)
        
        is_valid, warnings = validate_sidecar_structure(sidecar)
        result["validation_warnings"] = warnings
        
        if not is_valid:
            result["errors"].append("Sidecar failed validation")
            logger.error("[FM Sidecar] Validation failed: %s", warnings)
            return result
        
        if warnings:
            for w in warnings:
                logger.warning("[FM Sidecar] Warning: %s", w)
        
        result["elements_in_sidecar"] = len(sidecar)
        
        # Merge FM data into elements
        for global_id, fm_data in sidecar.items():
            try:
                if global_id in elements:
                    # Ensure properties dict exists
                    if "properties" not in elements[global_id]:
                        elements[global_id]["properties"] = {}
                    
                    # Merge FMReadiness instance params
                    if "FMReadiness" in fm_data and fm_data["FMReadiness"]:
                        # Filter out null values
                        fm_params = {k: v for k, v in fm_data["FMReadiness"].items() if v is not None}
                        if fm_params:
                            elements[global_id]["properties"]["FMReadiness"] = fm_params
                    
                    # Merge FMReadinessType params  
                    if "FMReadinessType" in fm_data and fm_data["FMReadinessType"]:
                        type_params = {k: v for k, v in fm_data["FMReadinessType"].items() if v is not None}
                        if type_params:
                            elements[global_id]["properties"]["FMReadinessType"] = type_params
                    
                    result["elements_merged"] += 1
                else:
                    result["elements_not_found"] += 1
                    # Track first 20 unmatched IDs for debugging
                    if len(result["unmatched_global_ids"]) < 20:
                        result["unmatched_global_ids"].append(global_id)
            except Exception as elem_err:
                result["elements_with_errors"] += 1
                logger.warning("[FM Sidecar] Error processing element %s: %s", global_id, elem_err)
                # Continue with next element
        
        # Save updated metadata
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        
        logger.info("[FM Sidecar] Merged %s elements from %s", result["elements_merged"], sidecar_path.name)
        if result["elements_not_found"] > 0:
            logger.warning(
                "[FM Sidecar] %s GlobalIds not found in metadata",
                result["elements_not_found"],
            )
        
    except json.JSONDecodeError as je:
        result["errors"].append(f"Invalid JSON in sidecar: {je}")
        logger.exception("[FM Sidecar] JSON decode error: %s", je)
    except Exception as e:
        result["errors"].append(str(e))
        logger.exception("[FM Sidecar] Error merging sidecar: %s", e)
    
    return result


def merge_fm_sidecar_into_dict(metadata: dict, sidecar: dict) -> dict:
    """
    Merge FM sidecar data into a metadata dictionary (in-memory version).
    
    Useful when processing metadata before saving to file.
    
    Args:
        metadata: Metadata dictionary (will be modified in place)
        sidecar: Sidecar dictionary
        
    Returns:
        Dictionary with merge statistics
    """
    result = {
        "elements_in_sidecar": len(sidecar),
        "elements_merged": 0,
        "elements_not_found": 0
    }
    
    # Handle both schema v1 (flat) and v2 (wrapped)
    if "elements" in metadata:
        elements = metadata["elements"]
    else:
        elements = metadata
    
    for global_id, fm_data in sidecar.items():
        if global_id in elements:
            if "properties" not in elements[global_id]:
                elements[global_id]["properties"] = {}
            
            if "FMReadiness" in fm_data and fm_data["FMReadiness"]:
                fm_params = {k: v for k, v in fm_data["FMReadiness"].items() if v is not None}
                if fm_params:
                    elements[global_id]["properties"]["FMReadiness"] = fm_params
            
            if "FMReadinessType" in fm_data and fm_data["FMReadinessType"]:
                type_params = {k: v for k, v in fm_data["FMReadinessType"].items() if v is not None}
                if type_params:
                    elements[global_id]["properties"]["FMReadinessType"] = type_params
            
            result["elements_merged"] += 1
        else:
            result["elements_not_found"] += 1
    
    return result
