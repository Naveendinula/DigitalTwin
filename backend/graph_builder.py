"""
Build and persist a lightweight IFC relationship graph for query workflows.

The graph is stored as NetworkX node-link JSON at output/{job_id}/graph.json.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import ifcopenshell
import networkx as nx
from ifcopenshell.util import system as ifc_system

from fm_hvac_core import analyze_hvac_fm
from ifc_metadata_extractor import get_containing_storey, get_element_materials, get_property_sets, convert_value
from utils import clean_text as _clean_text

logger = logging.getLogger(__name__)


def _global_id(entity: Any) -> str | None:
    value = getattr(entity, "GlobalId", None)
    if not value:
        return None
    return str(value)


def _label_for_type(ifc_type: str | None) -> str:
    text = _clean_text(ifc_type)
    if text.startswith("Ifc"):
        return text[3:]
    return text or "Node"


def _is_spatial(entity: Any) -> bool:
    try:
        return bool(
            entity.is_a("IfcSpatialStructureElement")
            or entity.is_a("IfcSpatialElement")
        )
    except Exception:
        return False


def _normalize_materials(values: list[Any] | None) -> list[str]:
    if not values:
        return []
    return sorted({_clean_text(value) for value in values if _clean_text(value)})


def _ensure_element_node(graph: nx.MultiDiGraph, element: Any) -> str | None:
    node_id = _global_id(element)
    if not node_id:
        return None
    if node_id in graph:
        return node_id

    ifc_type = _clean_text(element.is_a()) or "IfcObject"
    name = _clean_text(getattr(element, "Name", None)) or None
    storey = get_containing_storey(element)
    materials = _normalize_materials(get_element_materials(element))

    graph.add_node(
        node_id,
        globalId=node_id,
        label=_label_for_type(ifc_type),
        ifcType=ifc_type,
        name=name,
        storey=storey,
        materials=materials,
    )
    return node_id


def _ensure_material_node(graph: nx.MultiDiGraph, material_name: str) -> str:
    node_id = f"mat:{material_name}"
    if node_id not in graph:
        graph.add_node(
            node_id,
            globalId=node_id,
            label="Material",
            ifcType="Material",
            name=material_name,
            storey=None,
            materials=[],
        )
    return node_id


def _ensure_system_node(graph: nx.MultiDiGraph, system_name: str) -> str:
    node_id = f"sys:{system_name}"
    if node_id not in graph:
        graph.add_node(
            node_id,
            globalId=node_id,
            label="System",
            ifcType="IfcSystem",
            name=system_name,
            storey=None,
            materials=[],
        )
    return node_id


def _coerce_prop_value(value: Any) -> str:
    """Coerce a property value to a short string for graph storage."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, tuple)):
        return ", ".join(str(v) for v in value[:10])
    return str(value)[:500]


def _value_type(value: Any) -> str:
    """Classify a property value for downstream filtering."""
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, (list, tuple)):
        return "list"
    return "string"


def _ensure_property_node(
    graph: nx.MultiDiGraph,
    parent_id: str,
    pset_name: str,
    prop_name: str,
    prop_value: Any,
    seen_edges: set[tuple[str, str, str]],
) -> str | None:
    """Create a Property node and connect it to its parent element."""
    clean_pset = _clean_text(pset_name)
    clean_prop = _clean_text(prop_name)
    if not clean_pset or not clean_prop:
        return None

    node_id = f"prop:{parent_id}:{clean_pset}:{clean_prop}"
    if node_id not in graph:
        str_value = _coerce_prop_value(prop_value)
        graph.add_node(
            node_id,
            globalId=node_id,
            label="Property",
            ifcType="Property",
            name=f"{clean_pset}.{clean_prop}",
            storey=None,
            materials=[],
            psetName=clean_pset,
            propName=clean_prop,
            value=str_value,
            valueType=_value_type(prop_value),
        )
    _add_typed_edge_once(graph, seen_edges, parent_id, node_id, "HAS_PROPERTY")
    return node_id


def _ensure_min_node(
    graph: nx.MultiDiGraph,
    node_id: str,
    ifc_type: str = "IfcObject",
    name: str | None = None,
    storey: str | None = None,
) -> str:
    if node_id not in graph:
        graph.add_node(
            node_id,
            globalId=node_id,
            label=_label_for_type(ifc_type),
            ifcType=ifc_type,
            name=name,
            storey=storey,
            materials=[],
        )
    return node_id


def _add_typed_edge_once(
    graph: nx.MultiDiGraph,
    seen_edges: set[tuple[str, str, str]],
    source_id: str | None,
    target_id: str | None,
    edge_type: str,
) -> None:
    if not source_id or not target_id:
        return
    key = (source_id, target_id, edge_type)
    if key in seen_edges:
        return
    seen_edges.add(key)
    graph.add_edge(source_id, target_id, type=edge_type)


def _index_root_entities(ifc_file: ifcopenshell.file) -> dict[str, Any]:
    entities: dict[str, Any] = {}
    for entity in ifc_file.by_type("IfcRoot"):
        node_id = _global_id(entity)
        if node_id:
            entities[node_id] = entity
    return entities


def _ensure_node_from_global_id(
    graph: nx.MultiDiGraph,
    entities: dict[str, Any],
    global_id: str | None,
    fallback_ifc_type: str = "IfcObject",
    fallback_name: str | None = None,
    fallback_storey: str | None = None,
) -> str | None:
    node_id = _clean_text(global_id)
    if not node_id:
        return None
    if node_id in graph:
        return node_id

    element = entities.get(node_id)
    if element is not None:
        return _ensure_element_node(graph, element)

    return _ensure_min_node(
        graph,
        node_id,
        ifc_type=fallback_ifc_type,
        name=fallback_name,
        storey=fallback_storey,
    )


def build_graph_from_ifc_model(ifc_file: ifcopenshell.file) -> nx.MultiDiGraph:
    """
    Build a relationship graph from an opened IFC model.
    """
    graph = nx.MultiDiGraph()
    seen_edges: set[tuple[str, str, str]] = set()

    entities_by_global_id = _index_root_entities(ifc_file)
    products = list(ifc_file.by_type("IfcProduct"))

    for product in products:
        _ensure_element_node(graph, product)

    # IfcRelContainedInSpatialStructure: Element -> Spatial container
    for relation in ifc_file.by_type("IfcRelContainedInSpatialStructure"):
        target_id = _ensure_element_node(graph, relation.RelatingStructure)
        for element in relation.RelatedElements or []:
            source_id = _ensure_element_node(graph, element)
            _add_typed_edge_once(graph, seen_edges, source_id, target_id, "CONTAINED_IN")

    # IfcRelAggregates (spatial only): Child spatial -> Parent spatial
    for relation in ifc_file.by_type("IfcRelAggregates"):
        parent = relation.RelatingObject
        if not _is_spatial(parent):
            continue
        parent_id = _ensure_element_node(graph, parent)
        for child in relation.RelatedObjects or []:
            if not _is_spatial(child):
                continue
            child_id = _ensure_element_node(graph, child)
            _add_typed_edge_once(graph, seen_edges, child_id, parent_id, "DECOMPOSES")

    # IfcRelSpaceBoundary: Space -> related building element
    for relation in ifc_file.by_type("IfcRelSpaceBoundary"):
        space = getattr(relation, "RelatingSpace", None)
        element = getattr(relation, "RelatedBuildingElement", None)
        if not space or not element:
            continue
        source_id = _ensure_element_node(graph, space)
        target_id = _ensure_element_node(graph, element)
        _add_typed_edge_once(graph, seen_edges, source_id, target_id, "BOUNDED_BY")

    # Materials, properties, and system associations from products
    for product in products:
        product_id = _ensure_element_node(graph, product)
        if not product_id:
            continue

        for material_name in _normalize_materials(get_element_materials(product)):
            material_id = _ensure_material_node(graph, material_name)
            _add_typed_edge_once(graph, seen_edges, product_id, material_id, "HAS_MATERIAL")

        # Property sets / quantity sets
        try:
            psets = get_property_sets(product)
        except Exception:
            psets = {}
        for pset_name, properties in psets.items():
            for prop_name, prop_value in properties.items():
                _ensure_property_node(
                    graph, product_id, pset_name, prop_name,
                    prop_value, seen_edges,
                )

        try:
            systems = ifc_system.get_element_systems(product) or []
        except Exception:
            systems = []
        for system in systems:
            system_name = _clean_text(getattr(system, "Name", None))
            if not system_name:
                system_name = _global_id(system) or f"system-{system.id()}"
            system_id = _ensure_system_node(graph, system_name)
            _add_typed_edge_once(graph, seen_edges, product_id, system_id, "IN_SYSTEM")

    # FEEDS and SERVES from existing HVAC/FM traversal
    hvac_result = analyze_hvac_fm(ifc_file)
    for equipment in hvac_result.get("equipment", []):
        equipment_id = _ensure_node_from_global_id(
            graph,
            entities_by_global_id,
            equipment.get("globalId"),
            fallback_ifc_type="IfcDistributionElement",
            fallback_name=equipment.get("name"),
            fallback_storey=equipment.get("storey"),
        )
        if not equipment_id:
            continue

        for terminal in equipment.get("servedTerminals", []):
            terminal_id = _ensure_node_from_global_id(
                graph,
                entities_by_global_id,
                terminal.get("globalId"),
                fallback_ifc_type=terminal.get("type") or "IfcFlowTerminal",
                fallback_name=terminal.get("name"),
                fallback_storey=terminal.get("storey"),
            )
            _add_typed_edge_once(graph, seen_edges, equipment_id, terminal_id, "FEEDS")

            space = terminal.get("space") or {}
            space_id = _ensure_node_from_global_id(
                graph,
                entities_by_global_id,
                space.get("globalId"),
                fallback_ifc_type="IfcSpace",
                fallback_name=space.get("name"),
                fallback_storey=terminal.get("storey"),
            )
            _add_typed_edge_once(graph, seen_edges, terminal_id, space_id, "SERVES")

    return graph


def save_graph(graph: nx.MultiDiGraph, output_path: str | Path) -> None:
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as handle:
        json.dump(nx.node_link_data(graph), handle, indent=2, ensure_ascii=False)


def build_graph(ifc_path: str, output_path: str) -> dict[str, int]:
    """
    Build graph.json for a job from an IFC path.
    """
    logger.info("Loading IFC file for graph build: %s", ifc_path)
    ifc_file = ifcopenshell.open(ifc_path)
    graph = build_graph_from_ifc_model(ifc_file)
    save_graph(graph, output_path)

    stats = {
        "nodes": int(graph.number_of_nodes()),
        "edges": int(graph.number_of_edges()),
    }
    logger.info(
        "Graph saved to: %s (%s nodes, %s edges)",
        output_path,
        stats["nodes"],
        stats["edges"],
    )
    return stats
