"""
Core logic for HVAC/FM analysis: derive served terminals and spaces from IFC MEP connectivity.

This module is framework-agnostic. Call analyze_hvac_fm(model) from an API, CLI, or notebook.
"""

from collections import deque
from typing import Any, Dict, Iterable, Optional

import ifcopenshell
from ifcopenshell.util import element as ifc_element
from ifcopenshell.util import system as ifc_system
from utils import clean_text as _clean_text, extract_space_identifiers as _extract_space_identifiers


DEFAULT_MAX_DEPTH = 35
DEFAULT_MAX_NODES = 3000

# Heuristic keywords for proxy-based HVAC equipment (e.g., HRUs).
HVAC_KEYWORDS = (
    "HRU",
    "AHU",
    "AIR HANDLING",
    "AIRHANDLING",
    "HEAT RECOVERY",
    "HEAT-RECOVERY",
    "HEATRECOVERY",
    "VENTILATION",
    "ERV",
    "DOAS",
    "RTU",
)

# IFC type hints for HVAC equipment.
EQUIPMENT_TYPE_HINTS = (
    "IfcAirHandlingUnit",
    "IfcUnitaryEquipment",
    "IfcEnergyConversionDevice",
    "IfcFlowMovingDevice",
)

TERMINAL_TYPE_HINTS = (
    "IfcAirTerminal",
    "IfcFlowTerminal",
)


def _element_key(element) -> str:
    global_id = getattr(element, "GlobalId", None)
    if global_id:
        return str(global_id)
    if hasattr(element, "id"):
        return str(element.id())
    return str(id(element))


def _element_sort_key(element) -> tuple[str, str, str]:
    return (
        _clean_text(getattr(element, "Name", "")).lower(),
        _clean_text(element.is_a()),
        _element_key(element),
    )


def _classify_system(name: str) -> str:
    name_lower = name.lower()
    if "supply" in name_lower:
        return "supply"
    if "return" in name_lower:
        return "return"
    if "exhaust" in name_lower:
        return "exhaust"
    if "fresh" in name_lower or "outside" in name_lower:
        return "outside_air"
    return "other"


def _group_systems(system_names: Iterable[str]) -> dict[str, list[str]]:
    grouped: dict[str, set[str]] = {}
    for name in system_names:
        cleaned = _clean_text(name)
        if not cleaned:
            continue
        bucket = _classify_system(cleaned)
        grouped.setdefault(bucket, set()).add(cleaned)
    return {
        key: sorted(values, key=lambda v: v.lower())
        for key, values in grouped.items()
    }


def _matches_keywords(value: Any) -> bool:
    text = _clean_text(value).upper()
    if not text:
        return False
    return any(keyword in text for keyword in HVAC_KEYWORDS)


def _get_psets(element) -> dict[str, Any]:
    try:
        return ifc_element.get_psets(element) or {}
    except Exception:
        return {}


def _element_matches_keywords(element, psets: Optional[dict[str, Any]] = None) -> bool:
    if _matches_keywords(getattr(element, "Name", None)):
        return True
    if _matches_keywords(getattr(element, "ObjectType", None)):
        return True
    if _matches_keywords(getattr(element, "Tag", None)):
        return True

    if psets is None:
        psets = _get_psets(element)

    for pset_name, props in psets.items():
        if _matches_keywords(pset_name):
            return True
        if not isinstance(props, dict):
            continue
        for key, value in props.items():
            if key == "id":
                continue
            if _matches_keywords(key):
                return True
            if isinstance(value, str) and _matches_keywords(value):
                return True
    return False


def _is_terminal(element) -> bool:
    return any(element.is_a(ifc_type) for ifc_type in TERMINAL_TYPE_HINTS)


def _get_tag_or_mark(element, psets: Optional[dict[str, Any]] = None) -> str:
    direct_tag = _clean_text(getattr(element, "Tag", None))
    if direct_tag:
        return direct_tag

    if psets is None:
        psets = _get_psets(element)

    for _, props in psets.items():
        if not isinstance(props, dict):
            continue
        for key, value in props.items():
            if key == "id":
                continue
            if key.lower() in ("mark", "tag", "assettag", "reference"):
                tag_val = _clean_text(value)
                if tag_val:
                    return tag_val
    return ""


def _get_storey_name(element) -> Optional[str]:
    try:
        storey = ifc_element.get_container(element, ifc_class="IfcBuildingStorey")
    except Exception:
        storey = None
    if storey:
        name = _clean_text(getattr(storey, "Name", None))
        return name or _element_key(storey)
    return None


def _get_space_info(element) -> Optional[dict[str, str]]:
    try:
        space = ifc_element.get_container(element, ifc_class="IfcSpace")
    except Exception:
        space = None
    if space:
        psets = _get_psets(space)
        base_name = _clean_text(getattr(space, "Name", None))
        long_name = _clean_text(getattr(space, "LongName", None))
        room_no, room_name = _extract_space_identifiers(space, psets)

        name_parts = [part for part in (base_name, long_name) if part]
        name_text = " ".join(name_parts).strip()

        label_parts = [part for part in (room_no, room_name or name_text) if part]
        label = " ".join(label_parts).strip()

        return {
            "globalId": _element_key(space),
            "name": label or name_text or _element_key(space),
            "room_no": room_no,
            "room_name": room_name,
        }
    return None


def _unique_elements(elements: Iterable) -> list:
    seen = set()
    unique = []
    for element in elements:
        if element is None:
            continue
        key = _element_key(element)
        if key in seen:
            continue
        seen.add(key)
        unique.append(element)
    return unique


def _collect_systems(element) -> list[dict[str, Any]]:
    try:
        systems = ifc_system.get_element_systems(element) or []
    except Exception:
        systems = []
    system_entries = []
    for system in systems:
        try:
            system_elements = ifc_system.get_system_elements(system) or []
        except Exception:
            system_elements = []
        system_entries.append(
            {
                "globalId": _element_key(system),
                "name": _clean_text(getattr(system, "Name", None)),
                "elementCount": int(len(system_elements)),
            }
        )
    return sorted(system_entries, key=lambda s: (_clean_text(s.get("name")).lower(), s.get("globalId", "")))


def _collect_system_names(element) -> list[str]:
    try:
        systems = ifc_system.get_element_systems(element) or []
    except Exception:
        systems = []
    names = []
    for system in systems:
        name = _clean_text(getattr(system, "Name", None))
        if name:
            names.append(name)
    return sorted(set(names), key=lambda v: v.lower())


def _build_terminal_info(terminal) -> dict[str, Any]:
    psets = _get_psets(terminal)
    return {
        "globalId": _element_key(terminal),
        "name": _clean_text(getattr(terminal, "Name", None)),
        "type": terminal.is_a(),
        "tag": _get_tag_or_mark(terminal, psets),
        "space": _get_space_info(terminal),
        "storey": _get_storey_name(terminal),
        "systems": _collect_system_names(terminal),
    }


def _get_model_from_element(element) -> Optional[ifcopenshell.file]:
    wrapped_data = getattr(element, "wrapped_data", None)
    model = getattr(wrapped_data, "file", None) if wrapped_data else None
    if model:
        return model

    model_attr = getattr(element, "file", None)
    if callable(model_attr):
        try:
            return model_attr()
        except Exception:
            return None
    return model_attr


def _collect_system_associated_terminals(
    equipment,
    connected_terminal_ids: set[str],
) -> list[dict[str, Any]]:
    """
    Collect terminals that share at least one IFC system with equipment, but are not physically connected.
    """
    try:
        equipment_systems = ifc_system.get_element_systems(equipment) or []
    except Exception:
        equipment_systems = []
    if not equipment_systems:
        return []

    model = _get_model_from_element(equipment)
    if not model:
        return []

    equipment_system_ids = {_element_key(system) for system in equipment_systems}

    all_terminals = []
    for ifc_type in TERMINAL_TYPE_HINTS:
        try:
            all_terminals.extend(model.by_type(ifc_type))
        except Exception:
            pass

    associated_terminals = {}
    for terminal in _unique_elements(all_terminals):
        terminal_id = _element_key(terminal)
        if terminal_id in connected_terminal_ids:
            continue

        try:
            terminal_systems = ifc_system.get_element_systems(terminal) or []
        except Exception:
            terminal_systems = []

        if any(_element_key(system) in equipment_system_ids for system in terminal_systems):
            info = _build_terminal_info(terminal)
            associated_terminals[info["globalId"]] = info

    return sorted(
        associated_terminals.values(),
        key=lambda t: (_clean_text(t.get("name")).lower(), t.get("globalId", "")),
    )


def _derive_served_spaces(terminals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    spaces = {}
    space_systems: dict[str, set[str]] = {}
    for terminal in terminals:
        system_names = terminal.get("systems") or []
        space = terminal.get("space")
        storey = terminal.get("storey")
        if space:
            key = space.get("globalId") or space.get("name")
            if key and key not in spaces:
                spaces[key] = {
                    "globalId": space.get("globalId"),
                    "name": space.get("name"),
                    "room_no": space.get("room_no", ""),
                    "room_name": space.get("room_name", ""),
                    "storey": storey,
                }
            if key:
                space_systems.setdefault(key, set()).update(system_names)
        elif storey:
            key = f"storey:{storey}"
            if key not in spaces:
                spaces[key] = {
                    "globalId": None,
                    "name": storey,
                    "room_no": "",
                    "room_name": "",
                    "storey": storey,
                }
            space_systems.setdefault(key, set()).update(system_names)

    for key, entry in spaces.items():
        entry["systems_grouped"] = _group_systems(space_systems.get(key, set()))

    return sorted(
        spaces.values(),
        key=lambda s: (_clean_text(s.get("name")).lower(), _clean_text(s.get("globalId"))),
    )


def _traverse_terminals(
    equipment,
    max_depth: int,
    max_nodes: int,
) -> tuple[list[dict[str, Any]], bool]:
    """
    Traverse from equipment to find physically connected terminals.
    """
    visited = {_element_key(equipment)}
    queue = deque()
    terminals = {}
    visited_count = 0
    hit_max_nodes = False

    # CRITICAL: Seed the queue with ALL elements connected to ALL ports of the equipment
    # This ensures we start traversal down all 4 ducts (Supply, Return, Exhaust, etc.)
    initial_neighbors = set()
    
    try:
        connected = ifc_system.get_connected_to(equipment) or []
        initial_neighbors.update(connected)
    except Exception:
        pass
    
    try:
        connected_from = ifc_system.get_connected_from(equipment) or []
        initial_neighbors.update(connected_from)
    except Exception:
        pass
    
    try:
        ports = ifc_system.get_ports(equipment)
        for port in ports:
            try:
                for rel in getattr(port, "ConnectedFrom", []):
                    related_port = rel.RelatingPort if hasattr(rel, "RelatingPort") else None
                    if related_port:
                        owner = ifc_system.get_port_element(related_port)
                        if owner:
                            initial_neighbors.add(owner)
            except Exception:
                pass
            
            try:
                for rel in getattr(port, "ConnectedTo", []):
                    related_port = rel.RelatedPort if hasattr(rel, "RelatedPort") else None
                    if related_port:
                        owner = ifc_system.get_port_element(related_port)
                        if owner:
                            initial_neighbors.add(owner)
            except Exception:
                pass
    except Exception:
        pass
    
    # Add all initial neighbors to queue at depth 1
    for neighbor in _unique_elements(initial_neighbors):
        key = _element_key(neighbor)
        if key not in visited:
            visited.add(key)
            queue.append((neighbor, 1))

    while queue:
        current, depth = queue.popleft()
        visited_count += 1
        if visited_count > max_nodes:
            hit_max_nodes = True
            break

        if _is_terminal(current):
            info = _build_terminal_info(current)
            terminals[info["globalId"]] = info
            continue

        if depth >= max_depth:
            continue

        # Collect all neighbors via port connections
        neighbors = set()
        
        # Method 1: Via get_connected_to (follows port relationships)
        try:
            connected = ifc_system.get_connected_to(current) or []
            neighbors.update(connected)
        except Exception:
            pass
        
        # Method 2: Via get_connected_from (reverse direction)
        try:
            connected_from = ifc_system.get_connected_from(current) or []
            neighbors.update(connected_from)
        except Exception:
            pass
        
        # Method 3: Explicitly iterate all ports and find their connections
        try:
            ports = ifc_system.get_ports(current)
            for port in ports:
                # Find ports connected to this port
                try:
                    for rel in getattr(port, "ConnectedFrom", []):
                        related_port = rel.RelatingPort if hasattr(rel, "RelatingPort") else None
                        if related_port:
                            owner = ifc_system.get_port_element(related_port)
                            if owner:
                                neighbors.add(owner)
                except Exception:
                    pass
                
                try:
                    for rel in getattr(port, "ConnectedTo", []):
                        related_port = rel.RelatedPort if hasattr(rel, "RelatedPort") else None
                        if related_port:
                            owner = ifc_system.get_port_element(related_port)
                            if owner:
                                neighbors.add(owner)
                except Exception:
                    pass
        except Exception:
            pass
        
        # Method 4: Fallback for fittings/elbows with incomplete port data
        # Look for IfcRelConnectsElements and IfcRelConnectsPortToPort that reference this element
        try:
            # Check if element is related via IfcRelConnectsElements
            for inv in getattr(current, "ConnectedFrom", []):
                try:
                    relating = inv.RelatingElement if hasattr(inv, "RelatingElement") else None
                    if relating and relating != current:
                        neighbors.add(relating)
                except Exception:
                    pass
            
            for inv in getattr(current, "ConnectedTo", []):
                try:
                    related = inv.RelatedElement if hasattr(inv, "RelatedElement") else None
                    if related and related != current:
                        neighbors.add(related)
                except Exception:
                    pass
        except Exception:
            pass

        # Add unique neighbors to queue
        for neighbor in sorted(_unique_elements(neighbors), key=_element_sort_key):
            key = _element_key(neighbor)
            if key in visited:
                continue
            visited.add(key)
            queue.append((neighbor, depth + 1))

    terminal_list = sorted(
        terminals.values(),
        key=lambda t: (_clean_text(t.get("name")).lower(), t.get("globalId", "")),
    )
    return terminal_list, hit_max_nodes


def _collect_equipment(model) -> list:
    """
    Collect HVAC equipment from the model.
    
    Equipment is identified by:
    1. IFC type hints (IfcAirHandlingUnit, etc.)
    2. Keyword matching in names/properties for proxies and distribution elements
    
    Terminals (IfcAirTerminal, IfcFlowTerminal) are explicitly excluded.
    """
    seen = set()
    equipment = []

    for ifc_type in EQUIPMENT_TYPE_HINTS:
        try:
            elements = model.by_type(ifc_type)
        except Exception:
            elements = []
        for element in elements:
            # Skip if this is actually a terminal
            if _is_terminal(element):
                continue
            key = _element_key(element)
            if key in seen:
                continue
            seen.add(key)
            equipment.append(element)

    try:
        proxy_elements = model.by_type("IfcBuildingElementProxy")
    except Exception:
        proxy_elements = []
    for element in proxy_elements:
        if not _element_matches_keywords(element):
            continue
        # Skip if this is actually a terminal
        if _is_terminal(element):
            continue
        key = _element_key(element)
        if key in seen:
            continue
        seen.add(key)
        equipment.append(element)

    try:
        dist_elements = model.by_type("IfcDistributionElement")
    except Exception:
        dist_elements = []
    for element in dist_elements:
        if not _element_matches_keywords(element):
            continue
        # Skip if this is actually a terminal
        if _is_terminal(element):
            continue
        key = _element_key(element)
        if key in seen:
            continue
        seen.add(key)
        equipment.append(element)

    return sorted(equipment, key=_element_sort_key)


def analyze_hvac_fm(
    model: ifcopenshell.file,
    max_depth: int = DEFAULT_MAX_DEPTH,
    max_nodes: int = DEFAULT_MAX_NODES,
) -> Dict[str, Any]:
    """
    Analyze HVAC/FM from an IFC model and return served terminals and spaces.
    """
    equipment_elements = _collect_equipment(model)
    equipment_results = []
    warnings = []
    all_terminal_ids = set()
    all_system_associated_terminal_ids = set()
    all_space_keys = set()
    terminals_without_space = 0

    for equipment in equipment_elements:
        psets = _get_psets(equipment)
        systems = _collect_systems(equipment)
        systems_grouped = _group_systems([system.get("name", "") for system in systems])
        terminals, hit_max_nodes = _traverse_terminals(
            equipment,
            max_depth=max_depth,
            max_nodes=max_nodes,
        )
        system_associated_terminals = _collect_system_associated_terminals(
            equipment,
            connected_terminal_ids={terminal["globalId"] for terminal in terminals},
        )
        served_spaces = _derive_served_spaces(terminals)

        if hit_max_nodes:
            warnings.append(
                f"Traversal hit max_nodes ({max_nodes}) for equipment {_element_key(equipment)}."
            )

        for terminal in terminals:
            all_terminal_ids.add(terminal["globalId"])
            if terminal.get("space"):
                all_space_keys.add(terminal["space"].get("globalId") or terminal["space"].get("name"))
            elif terminal.get("storey"):
                all_space_keys.add(f"storey:{terminal.get('storey')}")
                terminals_without_space += 1
        for terminal in system_associated_terminals:
            all_system_associated_terminal_ids.add(terminal["globalId"])

        equipment_results.append(
            {
                "globalId": _element_key(equipment),
                "name": _clean_text(getattr(equipment, "Name", None)),
                "tag": _get_tag_or_mark(equipment, psets),
                "storey": _get_storey_name(equipment),
                "systems": systems,
                "systems_grouped": systems_grouped,
                "servedTerminals": terminals,
                "systemAssociatedTerminals": system_associated_terminals,
                "servedSpaces": served_spaces,
            }
        )

    summary = {
        "equipment_count": int(len(equipment_results)),
        "equipment_with_terminals": int(sum(1 for item in equipment_results if item["servedTerminals"])),
        "served_terminal_count": int(len(all_terminal_ids)),
        "system_associated_terminal_count": int(len(all_system_associated_terminal_ids)),
        "served_space_count": int(len(all_space_keys)),
        "terminals_without_space": int(terminals_without_space),
        "limits": {
            "max_depth": int(max_depth),
            "max_nodes": int(max_nodes),
        },
    }

    return {
        "warnings": warnings,
        "summary": summary,
        "equipment": equipment_results,
    }
