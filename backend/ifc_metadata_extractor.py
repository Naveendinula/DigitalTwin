"""
IFC Metadata Extraction Script

This script extracts BIM metadata from IFC files using ifcopenshell.
It processes all IfcProduct entities and extracts their properties
into a JSON format keyed by GlobalId for easy lookup in the viewer.
"""

import ifcopenshell
import ifcopenshell.util.element
import json
import sys
from pathlib import Path
from typing import Any


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


def extract_metadata(ifc_path: str) -> dict[str, dict]:
    """
    Extract metadata from all IfcProduct entities in an IFC file.
    
    Args:
        ifc_path: Path to the IFC file
        
    Returns:
        Dictionary keyed by GlobalId with element metadata
    """
    print(f"Loading IFC file: {ifc_path}")
    ifc_file = ifcopenshell.open(ifc_path)
    
    metadata = {}
    products = ifc_file.by_type('IfcProduct')
    total = len(products)
    
    print(f"Processing {total} IfcProduct entities...")
    
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
        
        metadata[global_id] = element_data
        
        # Progress indicator
        if i % 100 == 0 or i == total:
            print(f"Processed {i}/{total} elements ({i*100//total}%)")
    
    return metadata


def save_metadata(metadata: dict, output_path: str) -> None:
    """
    Save metadata dictionary to a JSON file.
    
    Args:
        metadata: The metadata dictionary
        output_path: Path for the output JSON file
    """
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    print(f"Metadata saved to: {output_path}")
    print(f"Total elements: {len(metadata)}")
    print(f"File size: {output_file.stat().st_size / 1024:.1f} KB")


def main():
    """Main entry point for command-line usage."""
    if len(sys.argv) != 3:
        print("Usage: python ifc_metadata_extractor.py <input.ifc> <output.json>")
        print("Example: python ifc_metadata_extractor.py model.ifc metadata.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    # Validate input file
    if not Path(input_file).exists():
        print(f"Error: Input file not found: {input_file}", file=sys.stderr)
        sys.exit(1)
    
    if not input_file.lower().endswith('.ifc'):
        print(f"Error: Input file must be an IFC file", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Extract and save metadata
        metadata = extract_metadata(input_file)
        save_metadata(metadata, output_file)
        print("Done!")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
