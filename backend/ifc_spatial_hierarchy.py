"""
IFC Spatial Hierarchy Extraction Script

This script extracts the complete spatial hierarchy from IFC files using ifcopenshell.
It walks the tree from IfcProject down through Site, Building, Storey, Space, and Elements,
producing a nested JSON structure suitable for tree views in the frontend.
"""

import ifcopenshell
import json
import sys
from pathlib import Path
from typing import Any


def get_element_info(element) -> dict[str, Any]:
    """
    Extract basic info from an IFC element.
    
    Args:
        element: An IFC element
        
    Returns:
        Dictionary with name, type, and GlobalId
    """
    return {
        'globalId': element.GlobalId,
        'type': element.is_a(),
        'name': element.Name if hasattr(element, 'Name') and element.Name else None,
        'children': []
    }


def get_decomposition_children(element) -> list:
    """
    Get children through IfcRelAggregates (spatial decomposition).
    Example: Project → Site → Building → Storey
    
    Args:
        element: An IFC spatial element
        
    Returns:
        List of child elements
    """
    children = []
    if hasattr(element, 'IsDecomposedBy'):
        for rel in element.IsDecomposedBy:
            if rel.is_a('IfcRelAggregates'):
                children.extend(rel.RelatedObjects)
    return children


def get_contained_elements(spatial_element) -> list:
    """
    Get elements contained in a spatial structure (via IfcRelContainedInSpatialStructure).
    Example: Elements (walls, doors) contained in a Storey or Space.
    
    Args:
        spatial_element: An IFC spatial structure element (Building, Storey, Space)
        
    Returns:
        List of contained elements
    """
    elements = []
    if hasattr(spatial_element, 'ContainsElements'):
        for rel in spatial_element.ContainsElements:
            if rel.is_a('IfcRelContainedInSpatialStructure'):
                elements.extend(rel.RelatedElements)
    return elements


def get_spaces_in_storey(storey) -> list:
    """
    Get spaces within a building storey.
    
    Args:
        storey: An IfcBuildingStorey element
        
    Returns:
        List of IfcSpace elements
    """
    spaces = []
    # Spaces can be in decomposition
    for child in get_decomposition_children(storey):
        if child.is_a('IfcSpace'):
            spaces.append(child)
    return spaces


def get_elements_in_space(space) -> list:
    """
    Get elements bounded by a space (via IfcRelSpaceBoundary).
    
    Args:
        space: An IfcSpace element
        
    Returns:
        List of elements related to the space
    """
    elements = []
    # Elements contained directly in space
    elements.extend(get_contained_elements(space))
    
    # Elements bounded by space
    if hasattr(space, 'BoundedBy'):
        for rel in space.BoundedBy:
            if hasattr(rel, 'RelatedBuildingElement') and rel.RelatedBuildingElement:
                elements.append(rel.RelatedBuildingElement)
    
    return elements


def categorize_elements(elements: list) -> dict[str, list]:
    """
    Group elements by their IFC type for cleaner hierarchy display.
    
    Args:
        elements: List of IFC elements
        
    Returns:
        Dictionary mapping type names to element lists
    """
    categorized = {}
    for element in elements:
        element_type = element.is_a()
        if element_type not in categorized:
            categorized[element_type] = []
        categorized[element_type].append(element)
    return categorized


def build_element_node(element, include_category: bool = False) -> dict[str, Any]:
    """
    Build a tree node for a building element.
    
    Args:
        element: An IFC element
        include_category: Whether to include element category grouping
        
    Returns:
        Tree node dictionary
    """
    node = get_element_info(element)
    # Elements typically don't have children in the spatial hierarchy
    del node['children']
    return node


def build_space_node(space) -> dict[str, Any]:
    """
    Build a tree node for an IfcSpace including its elements.
    
    Args:
        space: An IfcSpace element
        
    Returns:
        Tree node dictionary with contained elements
    """
    node = get_element_info(space)
    
    # Get elements in this space
    elements = get_elements_in_space(space)
    seen_ids = set()
    
    for element in elements:
        if element.GlobalId not in seen_ids:
            seen_ids.add(element.GlobalId)
            node['children'].append(build_element_node(element))
    
    # Remove empty children array
    if not node['children']:
        del node['children']
    
    return node


def build_storey_node(storey, elements_by_storey: dict) -> dict[str, Any]:
    """
    Build a tree node for an IfcBuildingStorey including spaces and elements.
    
    Args:
        storey: An IfcBuildingStorey element
        elements_by_storey: Pre-computed mapping of storey GlobalIds to elements
        
    Returns:
        Tree node dictionary with spaces and elements
    """
    node = get_element_info(storey)
    
    # Track elements assigned to spaces to avoid duplication
    elements_in_spaces = set()
    
    # Add spaces in this storey
    spaces = get_spaces_in_storey(storey)
    for space in spaces:
        space_node = build_space_node(space)
        node['children'].append(space_node)
        # Track elements in spaces
        if 'children' in space_node:
            for elem in space_node.get('children', []):
                elements_in_spaces.add(elem['globalId'])
    
    # Add elements directly contained in storey (not in spaces)
    storey_elements = elements_by_storey.get(storey.GlobalId, [])
    
    # Group elements by type for cleaner display
    categorized = categorize_elements(storey_elements)
    
    for element_type, elements in sorted(categorized.items()):
        # Create a category node
        category_node = {
            'type': 'Category',
            'name': element_type.replace('Ifc', ''),  # Clean up name
            'category': element_type,
            'children': []
        }
        
        for element in elements:
            if element.GlobalId not in elements_in_spaces:
                category_node['children'].append(build_element_node(element))
        
        # Only add category if it has elements
        if category_node['children']:
            node['children'].append(category_node)
    
    # Remove empty children array
    if not node['children']:
        del node['children']
    
    return node


def build_building_node(building, elements_by_storey: dict) -> dict[str, Any]:
    """
    Build a tree node for an IfcBuilding including storeys.
    
    Args:
        building: An IfcBuilding element
        elements_by_storey: Pre-computed mapping of storey GlobalIds to elements
        
    Returns:
        Tree node dictionary with storeys
    """
    node = get_element_info(building)
    
    # Add storeys
    for child in get_decomposition_children(building):
        if child.is_a('IfcBuildingStorey'):
            node['children'].append(build_storey_node(child, elements_by_storey))
    
    # Sort storeys by elevation if available
    node['children'].sort(
        key=lambda x: get_storey_elevation(x.get('globalId', '')),
        reverse=True  # Higher floors first
    )
    
    if not node['children']:
        del node['children']
    
    return node


# Cache for storey elevations
_storey_elevations = {}


def get_storey_elevation(global_id: str) -> float:
    """Get cached storey elevation for sorting."""
    return _storey_elevations.get(global_id, 0.0)


def build_site_node(site, elements_by_storey: dict) -> dict[str, Any]:
    """
    Build a tree node for an IfcSite including buildings.
    
    Args:
        site: An IfcSite element
        elements_by_storey: Pre-computed mapping of storey GlobalIds to elements
        
    Returns:
        Tree node dictionary with buildings
    """
    node = get_element_info(site)
    
    # Add buildings
    for child in get_decomposition_children(site):
        if child.is_a('IfcBuilding'):
            node['children'].append(build_building_node(child, elements_by_storey))
    
    if not node['children']:
        del node['children']
    
    return node


def precompute_element_assignments(ifc_file) -> dict[str, list]:
    """
    Pre-compute which elements belong to which storey.
    This is more efficient than querying for each storey.
    
    Args:
        ifc_file: The loaded IFC file
        
    Returns:
        Dictionary mapping storey GlobalIds to lists of elements
    """
    elements_by_storey = {}
    
    # Cache storey elevations for sorting
    global _storey_elevations
    _storey_elevations = {}
    
    for storey in ifc_file.by_type('IfcBuildingStorey'):
        _storey_elevations[storey.GlobalId] = storey.Elevation if storey.Elevation else 0.0
        elements_by_storey[storey.GlobalId] = get_contained_elements(storey)
    
    return elements_by_storey


def extract_spatial_hierarchy(ifc_path: str) -> dict[str, Any]:
    """
    Extract the complete spatial hierarchy from an IFC file.
    
    Args:
        ifc_path: Path to the IFC file
        
    Returns:
        Nested dictionary representing the spatial tree
    """
    print(f"Loading IFC file: {ifc_path}")
    ifc_file = ifcopenshell.open(ifc_path)
    
    # Find the project
    projects = ifc_file.by_type('IfcProject')
    if not projects:
        raise ValueError("No IfcProject found in the IFC file")
    
    project = projects[0]
    print(f"Found project: {project.Name}")
    
    # Pre-compute element assignments for efficiency
    print("Computing element assignments...")
    elements_by_storey = precompute_element_assignments(ifc_file)
    
    # Build the hierarchy starting from project
    print("Building spatial hierarchy...")
    hierarchy = get_element_info(project)
    
    # Add sites (or buildings directly if no site)
    for child in get_decomposition_children(project):
        if child.is_a('IfcSite'):
            hierarchy['children'].append(build_site_node(child, elements_by_storey))
        elif child.is_a('IfcBuilding'):
            # Some IFC files have buildings directly under project
            hierarchy['children'].append(build_building_node(child, elements_by_storey))
    
    if not hierarchy['children']:
        del hierarchy['children']
    
    # Add summary statistics
    stats = compute_statistics(hierarchy)
    hierarchy['statistics'] = stats
    
    return hierarchy


def compute_statistics(hierarchy: dict, stats: dict = None) -> dict:
    """
    Compute statistics about the hierarchy.
    
    Args:
        hierarchy: The hierarchy tree
        stats: Running statistics dictionary
        
    Returns:
        Statistics dictionary
    """
    if stats is None:
        stats = {
            'totalElements': 0,
            'sites': 0,
            'buildings': 0,
            'storeys': 0,
            'spaces': 0,
            'elementsByType': {}
        }
    
    node_type = hierarchy.get('type', '')
    
    if node_type == 'IfcSite':
        stats['sites'] += 1
    elif node_type == 'IfcBuilding':
        stats['buildings'] += 1
    elif node_type == 'IfcBuildingStorey':
        stats['storeys'] += 1
    elif node_type == 'IfcSpace':
        stats['spaces'] += 1
    elif node_type.startswith('Ifc') and node_type != 'IfcProject':
        stats['totalElements'] += 1
        if node_type not in stats['elementsByType']:
            stats['elementsByType'][node_type] = 0
        stats['elementsByType'][node_type] += 1
    
    # Recurse into children
    for child in hierarchy.get('children', []):
        compute_statistics(child, stats)
    
    return stats


def save_hierarchy(hierarchy: dict, output_path: str) -> None:
    """
    Save hierarchy to a JSON file.
    
    Args:
        hierarchy: The hierarchy dictionary
        output_path: Path for the output JSON file
    """
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(hierarchy, f, indent=2, ensure_ascii=False)
    
    stats = hierarchy.get('statistics', {})
    print(f"\nHierarchy saved to: {output_path}")
    print(f"Statistics:")
    print(f"  - Sites: {stats.get('sites', 0)}")
    print(f"  - Buildings: {stats.get('buildings', 0)}")
    print(f"  - Storeys: {stats.get('storeys', 0)}")
    print(f"  - Spaces: {stats.get('spaces', 0)}")
    print(f"  - Total Elements: {stats.get('totalElements', 0)}")


def main():
    """Main entry point for command-line usage."""
    if len(sys.argv) != 3:
        print("Usage: python ifc_spatial_hierarchy.py <input.ifc> <output.json>")
        print("Example: python ifc_spatial_hierarchy.py model.ifc hierarchy.json")
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
        hierarchy = extract_spatial_hierarchy(input_file)
        save_hierarchy(hierarchy, output_file)
        print("\nDone!")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
