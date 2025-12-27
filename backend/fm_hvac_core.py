"""
Core logic for HVAC/FM analysis: derive served terminals and spaces from IFC MEP connectivity.

This module is framework-agnostic. Call analyze_hvac_fm(model) from an API, CLI, or notebook.
"""

from collections import deque
from typing import Any, Dict, Iterable, Optional

import ifcopenshell
from ifcopenshell.util import element as ifc_element
from ifcopenshell.util import system as ifc_system


DEFAULT_MAX_DEPTH = 10
DEFAULT_MAX_NODES = 800

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


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


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


def _extract_space_identifiers(space, psets: dict[str, Any]) -> tuple[str, str]:
    number = ""
    for _, props in psets.items():
        if not isinstance(props, dict):
            continue
        for key, value in props.items():
            if key.lower() in ("number", "roomnumber", "space_number", "space number"):
                number = _clean_text(value)
                break
        if number:
            break

    base_name = _clean_text(getattr(space, "Name", None))
    long_name = _clean_text(getattr(space, "LongName", None))

    room_no = number
    room_name = ""

    if not room_no and base_name and long_name:
        room_no = base_name

    if not room_no and base_name:
        tokens = base_name.split()
        if len(tokens) > 1 and any(char.isdigit() for char in tokens[0]):
            room_no = tokens[0]
            room_name = " ".join(tokens[1:]).strip()

    if not room_name:
        if long_name:
            room_name = long_name
        elif base_name and base_name != room_no:
            room_name = base_name

    return room_no, room_name


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
    visited = {_element_key(equipment)}
    queue = deque([(equipment, 0)])
    terminals = {}
    visited_count = 0
    hit_max_nodes = False

    while queue:
        current, depth = queue.popleft()
        visited_count += 1
        if visited_count > max_nodes:
            hit_max_nodes = True
            break

        if current is not equipment and _is_terminal(current):
            info = _build_terminal_info(current)
            terminals[info["globalId"]] = info
            continue

        if depth >= max_depth:
            continue

        ports = ifc_system.get_ports(current)
        if not ports:
            continue

        connected = ifc_system.get_connected_to(current) or []
        for neighbor in sorted(_unique_elements(connected), key=_element_sort_key):
            key = _element_key(neighbor)
            if key in visited:
                continue
            visited.add(key)
            queue.append((neighbor, depth + 1))

    terminal_list = sorted(terminals.values(), key=lambda t: (_clean_text(t.get("name")).lower(), t.get("globalId", "")))
    return terminal_list, hit_max_nodes


def _collect_equipment(model) -> list:
    seen = set()
    equipment = []

    for ifc_type in EQUIPMENT_TYPE_HINTS:
        try:
            elements = model.by_type(ifc_type)
        except Exception:
            elements = []
        for element in elements:
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

        equipment_results.append(
            {
                "globalId": _element_key(equipment),
                "name": _clean_text(getattr(equipment, "Name", None)),
                "tag": _get_tag_or_mark(equipment, psets),
                "storey": _get_storey_name(equipment),
                "systems": systems,
                "systems_grouped": systems_grouped,
                "servedTerminals": terminals,
                "servedSpaces": served_spaces,
            }
        )

    summary = {
        "equipment_count": int(len(equipment_results)),
        "equipment_with_terminals": int(sum(1 for item in equipment_results if item["servedTerminals"])),
        "served_terminal_count": int(len(all_terminal_ids)),
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
