"""
IFC Metadata Extraction Script

This script extracts BIM metadata from IFC files using ifcopenshell.
It processes all IfcProduct entities and extracts their properties
into a JSON format keyed by GlobalId for easy lookup in the viewer.

Schema Version History:
  v1: Flat dict keyed by GlobalId (legacy)
  v2: Wrapped structure with schemaVersion, orientation, and elements
"""

import ifcopenshell
import ifcopenshell.util.element
import json
import math
import sys
import logging
from pathlib import Path
from typing import Any

# Current metadata schema version
METADATA_SCHEMA_VERSION = 2
logger = logging.getLogger(__name__)


def get_property_sets(element) -> dict[str, dict[str, Any]]:
    """
    Extract all Property Sets (PSets) and Quantity Sets from an IFC element.
    
    Args:
        element: An IFC element (IfcProduct)
        
    Returns:
        Dictionary of property set names to their properties
    """
    psets = {}
    
    # Get all property sets using ifcopenshell utility
    element_psets = ifcopenshell.util.element.get_psets(element)
    
    for pset_name, properties in element_psets.items():
        # Skip the 'id' key that ifcopenshell adds
        pset_properties = {}
        for prop_name, prop_value in properties.items():
            if prop_name == 'id':
                continue
            # Convert values to JSON-serializable types
            pset_properties[prop_name] = convert_value(prop_value)
        
        if pset_properties:
            psets[pset_name] = pset_properties
    
    return psets


def convert_value(value: Any) -> Any:
    """
    Convert IFC values to JSON-serializable Python types.
    
    Args:
        value: Any IFC property value
        
    Returns:
        JSON-serializable value
    """
    if value is None:
        return None
    elif isinstance(value, (bool, int, float, str)):
        return value
    elif isinstance(value, (list, tuple)):
        return [convert_value(v) for v in value]
    elif isinstance(value, dict):
        return {k: convert_value(v) for k, v in value.items()}
    else:
        # Convert any other type to string
        return str(value)


def extract_project_orientation(ifc_file) -> dict:
    """
    Extract project orientation from IFC GeometricRepresentationContext.
    
    Computes yaw angle (rotation around Z-axis) from WorldCoordinateSystem's
    RefDirection (X-axis direction). Also extracts TrueNorth if present.
    
    IFC Coordinate System:
      - WorldCoordinateSystem (IfcAxis2Placement3D) defines project origin and axes
      - Axis = Z direction (default: 0,0,1)
      - RefDirection = X direction (default: 1,0,0)
      - Y direction = cross(Z, X)
      - TrueNorth = geodetic north direction in XY plane (optional)
    
    Args:
        ifc_file: An opened ifcopenshell IFC file
        
    Returns:
        Dictionary with:
          - modelYawDeg: Rotation around Z from default X=(1,0,0) in degrees
          - trueNorthDeg: TrueNorth angle from Y-axis in degrees (null if not set)
          - orientationSource: "explicit" if RefDirection was set, "default" otherwise
    """
    orientation = {
        "modelYawDeg": 0.0,
        "trueNorthDeg": None,
        "orientationSource": "default"
    }
    
    try:
        # Find the Model context (primary 3D representation context)
        contexts = ifc_file.by_type("IfcGeometricRepresentationContext")
        model_context = None
        
        for ctx in contexts:
            # Skip sub-contexts, look for top-level Model context
            if hasattr(ctx, 'ContextType') and ctx.ContextType == "Model":
                # Prefer contexts that aren't sub-contexts
                if not hasattr(ctx, 'ParentContext') or ctx.ParentContext is None:
                    model_context = ctx
                    break
        
        # Fallback: use first context if no explicit Model context
        if model_context is None and contexts:
            model_context = contexts[0]
        
        if model_context is None:
            logger.info("No GeometricRepresentationContext found, using default orientation")
            return orientation
        
        # Extract WorldCoordinateSystem (IfcAxis2Placement3D)
        wcs = getattr(model_context, 'WorldCoordinateSystem', None)
        if wcs is None:
            logger.info("No WorldCoordinateSystem defined, using default orientation")
            return orientation
        
        # Get RefDirection (X-axis) - defaults to (1,0,0) if not specified
        ref_direction = getattr(wcs, 'RefDirection', None)
        if ref_direction is not None and hasattr(ref_direction, 'DirectionRatios'):
            ratios = ref_direction.DirectionRatios
            ref_x = float(ratios[0]) if len(ratios) > 0 else 1.0
            ref_y = float(ratios[1]) if len(ratios) > 1 else 0.0
            
            # Compute yaw angle: atan2(y, x) gives angle from positive X-axis
            # If RefDirection = (1,0,0), yaw = 0
            # If RefDirection = (0,1,0), yaw = 90 degrees
            yaw_rad = math.atan2(ref_y, ref_x)
            orientation["modelYawDeg"] = round(math.degrees(yaw_rad), 4)
            orientation["orientationSource"] = "explicit"
            logger.info(f"RefDirection: ({ref_x:.4f}, {ref_y:.4f}) -> yaw = {orientation['modelYawDeg']}")
        else:
            logger.info("RefDirection not specified, using default (1,0,0)")
        
        # Extract TrueNorth if present
        true_north = getattr(model_context, 'TrueNorth', None)
        if true_north is not None and hasattr(true_north, 'DirectionRatios'):
            ratios = true_north.DirectionRatios
            tn_x = float(ratios[0]) if len(ratios) > 0 else 0.0
            tn_y = float(ratios[1]) if len(ratios) > 1 else 1.0
            
            # TrueNorth angle: measured from Y-axis (project north) to true north
            # atan2(x, y) gives angle from Y-axis
            tn_rad = math.atan2(tn_x, tn_y)
            orientation["trueNorthDeg"] = round(math.degrees(tn_rad), 4)
            logger.info(f"TrueNorth: ({tn_x:.4f}, {tn_y:.4f}) -> {orientation['trueNorthDeg']} from Y")
        else:
            logger.info("TrueNorth not specified")
            
    except Exception as e:
        logger.warning(f"Error extracting orientation: {e}")
    
    return orientation


def get_element_location(element) -> dict[str, float] | None:
    """
    Extract the placement/location of an element if available.
    
    Args:
        element: An IFC element
        
    Returns:
        Dictionary with x, y, z coordinates or None
    """
    try:
        placement = element.ObjectPlacement
        if placement and hasattr(placement, 'RelativePlacement'):
            rel_placement = placement.RelativePlacement
            if hasattr(rel_placement, 'Location') and rel_placement.Location:
                coords = rel_placement.Location.Coordinates
                return {
                    'x': float(coords[0]),
                    'y': float(coords[1]),
                    'z': float(coords[2]) if len(coords) > 2 else 0.0
                }
    except Exception:
        pass
    return None


def get_element_materials(element) -> list[str]:
    """
    Extract material names associated with an element.
    
    Args:
        element: An IFC element
        
    Returns:
        List of material names
    """
    materials = []
    try:
        # Get material associations
        if hasattr(element, 'HasAssociations'):
            for association in element.HasAssociations:
                if association.is_a('IfcRelAssociatesMaterial'):
                    material = association.RelatingMaterial
                    if material.is_a('IfcMaterial'):
                        materials.append(material.Name)
                    elif material.is_a('IfcMaterialLayerSetUsage'):
                        layer_set = material.ForLayerSet
                        for layer in layer_set.MaterialLayers:
                            if layer.Material:
                                materials.append(layer.Material.Name)
                    elif material.is_a('IfcMaterialLayerSet'):
                        for layer in material.MaterialLayers:
                            if layer.Material:
                                materials.append(layer.Material.Name)
                    elif material.is_a('IfcMaterialList'):
                        for mat in material.Materials:
                            materials.append(mat.Name)
    except Exception:
        pass
    return materials


def get_containing_storey(element) -> str | None:
    """
    Get the building storey that contains this element.
    
    Args:
        element: An IFC element
        
    Returns:
        Name of the containing storey or None
    """
    try:
        # Check spatial containment
        if hasattr(element, 'ContainedInStructure'):
            for rel in element.ContainedInStructure:
                structure = rel.RelatingStructure
                if structure.is_a('IfcBuildingStorey'):
                    return structure.Name
    except Exception:
        pass
    return None


def extract_metadata(ifc_path: str, original_filename: str = None) -> dict:
    """
    Extract metadata from all IfcProduct entities in an IFC file.
    
    Returns a wrapped structure with schema version, orientation, and elements.
    
    Args:
        ifc_path: Path to the IFC file
        original_filename: Original name of the uploaded file (optional)
        
    Returns:
        Dictionary with structure:
        {
            "schemaVersion": 2,
            "ifcSchema": "IFC2X3",
            "fileName": "model.ifc",
            "orientation": { modelYawDeg, trueNorthDeg, orientationSource },
            "elements": { GlobalId -> element data }
        }
    """
    logger.info(f"Loading IFC file: {ifc_path}")
    ifc_file = ifcopenshell.open(ifc_path)
    
    # Extract project orientation first
    logger.info("Extracting project orientation...")
    orientation = extract_project_orientation(ifc_file)
    
    # Extract schema and filename
    ifc_schema = ifc_file.schema
    file_name = original_filename if original_filename else Path(ifc_path).name
    
    elements = {}
    products = ifc_file.by_type('IfcProduct')
    total = len(products)
    
    logger.info(f"Processing {total} IfcProduct entities...")
    
    for i, element in enumerate(products, 1):
        # Skip spatial elements like IfcSite, IfcBuilding (optional)
        # Uncomment the following if you want to skip them:
        # if element.is_a('IfcSpatialStructureElement'):
        #     continue
        
        global_id = element.GlobalId
        
        # Build element data
        element_data = {
            'type': element.is_a(),
            'name': element.Name if hasattr(element, 'Name') else None,
            'description': element.Description if hasattr(element, 'Description') else None,
            'objectType': element.ObjectType if hasattr(element, 'ObjectType') else None,
            'storey': get_containing_storey(element),
            'materials': get_element_materials(element),
            'location': get_element_location(element),
            'properties': get_property_sets(element)
        }
        
        # Remove None values for cleaner output
        element_data = {k: v for k, v in element_data.items() 
                       if v is not None and v != [] and v != {}}
        
        elements[global_id] = element_data
        
        # Progress indicator
        if i % 100 == 0 or i == total:
            logger.info(f"Processed {i}/{total} elements ({i*100//total}%)")
    
    # Return wrapped structure with schema version
    return {
        "schemaVersion": METADATA_SCHEMA_VERSION,
        "ifcSchema": ifc_schema,
        "fileName": file_name,
        "orientation": orientation,
        "elements": elements
    }


def save_metadata(metadata: dict, output_path: str) -> None:
    """
    Save metadata dictionary to a JSON file.
    
    Args:
        metadata: The metadata dictionary (wrapped structure with schemaVersion)
        output_path: Path for the output JSON file
    """
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    # Count elements (handle both old flat format and new wrapped format)
    element_count = len(metadata.get("elements", metadata))
    
    logger.info(f"Metadata saved to: {output_path}")
    logger.info(f"Schema version: {metadata.get('schemaVersion', 1)}")
    logger.info(f"Total elements: {element_count}")
    logger.info(f"File size: {output_file.stat().st_size / 1024:.1f} KB")


def main():
    """Main entry point for command-line usage."""
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

    if len(sys.argv) != 3:
        logger.error("Usage: python ifc_metadata_extractor.py <input.ifc> <output.json>")
        logger.error("Example: python ifc_metadata_extractor.py model.ifc metadata.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    try:
        # Extract and save metadata
        metadata = extract_metadata(input_file)
        save_metadata(metadata, output_file)
        logger.info("Done!")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
