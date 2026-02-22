"""
FastAPI router for graph-query endpoints backed by graph.json artifacts.
"""

from __future__ import annotations

import json
from collections import Counter, deque
from pathlib import Path
from typing import Any

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config import OUTPUT_DIR
from job_security import require_job_access_user
from utils import clean_text as _clean_text

router = APIRouter(prefix="/api/graph", tags=["graph"])

_GRAPH_NOT_BUILT_MESSAGE = "Graph not built for this job. Re-process to enable."
_GRAPH_CACHE: dict[str, tuple[tuple[int, int], nx.MultiDiGraph]] = {}


class GraphQuery(BaseModel):
    # Node filters
    node_type: str | None = None
    storey: str | None = None
    material: str | None = None
    name_contains: str | None = None

    # Relationship traversal
    related_to: str | None = None
    relationship: str | None = None
    max_depth: int = Field(default=1, ge=1, le=4)

    # Pagination
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


def invalidate_graph_cache(job_id: str) -> None:
    _GRAPH_CACHE.pop(job_id, None)


def _graph_path(job_id: str) -> Path:
    return OUTPUT_DIR / job_id / "graph.json"


def _load_graph(job_id: str) -> nx.MultiDiGraph:
    graph_path = _graph_path(job_id)
    if not graph_path.exists() or not graph_path.is_file():
        raise HTTPException(status_code=404, detail=_GRAPH_NOT_BUILT_MESSAGE)

    stat = graph_path.stat()
    version = (int(stat.st_mtime_ns), int(stat.st_size))
    cached = _GRAPH_CACHE.get(job_id)
    if cached and cached[0] == version:
        return cached[1]

    try:
        with open(graph_path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read graph.json: {exc}")

    edge_key = "links" if isinstance(raw, dict) and "links" in raw else "edges"
    try:
        graph_obj = nx.node_link_graph(
            raw,
            directed=bool(raw.get("directed", True)),
            multigraph=bool(raw.get("multigraph", True)),
            edges=edge_key,
        )
    except TypeError:
        # Compatibility fallback for older node_link_graph signatures.
        graph_obj = nx.node_link_graph(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse graph.json: {exc}")

    graph = graph_obj if isinstance(graph_obj, nx.MultiDiGraph) else nx.MultiDiGraph(graph_obj)
    _GRAPH_CACHE[job_id] = (version, graph)
    return graph


def _node_payload(node_id: str, attrs: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(node_id),
        "globalId": str(attrs.get("globalId") or node_id),
        "label": attrs.get("label"),
        "ifcType": attrs.get("ifcType"),
        "name": attrs.get("name"),
        "storey": attrs.get("storey"),
        "materials": attrs.get("materials") or [],
    }


def _edge_payload(source: str, target: str, attrs: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": str(source),
        "target": str(target),
        "type": _clean_text(attrs.get("type")) or "RELATED_TO",
    }


def _node_sort_key(graph: nx.MultiDiGraph, node_id: str) -> tuple[str, str, str]:
    attrs = graph.nodes[node_id]
    return (
        _clean_text(attrs.get("name")).lower(),
        _clean_text(attrs.get("ifcType")).lower(),
        str(node_id),
    )


def _edge_matches_relationship(attrs: dict[str, Any], relationship: str | None) -> bool:
    if not relationship:
        return True
    return _clean_text(attrs.get("type")).lower() == relationship.lower()


def _iter_incident_edges(
    graph: nx.MultiDiGraph,
    node_id: str,
    relationship: str | None = None,
) -> list[tuple[str, str, dict[str, Any]]]:
    incident: list[tuple[str, str, dict[str, Any]]] = []
    for source, target, _key, attrs in graph.out_edges(node_id, keys=True, data=True):
        if _edge_matches_relationship(attrs, relationship):
            incident.append((str(source), str(target), attrs))
    for source, target, _key, attrs in graph.in_edges(node_id, keys=True, data=True):
        if _edge_matches_relationship(attrs, relationship):
            incident.append((str(source), str(target), attrs))
    return incident


def _dedupe_edges(edge_tuples: list[tuple[str, str, dict[str, Any]]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    edges: list[dict[str, Any]] = []
    for source, target, attrs in edge_tuples:
        edge_type = _clean_text(attrs.get("type")) or "RELATED_TO"
        key = (source, target, edge_type)
        if key in seen:
            continue
        seen.add(key)
        edges.append({"source": source, "target": target, "type": edge_type})
    return edges


def _collect_related_nodes(
    graph: nx.MultiDiGraph,
    start_id: str,
    max_depth: int,
    relationship: str | None = None,
) -> set[str]:
    visited: set[str] = {start_id}
    queue = deque([(start_id, 0)])

    while queue:
        node_id, depth = queue.popleft()
        if depth >= max_depth:
            continue

        for source, target, attrs in _iter_incident_edges(graph, node_id, relationship):
            if not _edge_matches_relationship(attrs, relationship):
                continue
            neighbor = target if source == node_id else source
            if neighbor in visited:
                continue
            visited.add(neighbor)
            queue.append((neighbor, depth + 1))

    return visited


def _node_matches_query(attrs: dict[str, Any], query: GraphQuery) -> bool:
    if query.node_type:
        if _clean_text(attrs.get("ifcType")).lower() != query.node_type.lower():
            return False

    if query.storey:
        if _clean_text(attrs.get("storey")).lower() != query.storey.lower():
            return False

    if query.material:
        mats = attrs.get("materials") or []
        mat_values = {_clean_text(value).lower() for value in mats}
        if query.material.lower() not in mat_values:
            return False

    if query.name_contains:
        name = _clean_text(attrs.get("name")).lower()
        if query.name_contains.lower() not in name:
            return False

    return True


def _collect_edges_for_nodes(
    graph: nx.MultiDiGraph,
    node_ids: set[str],
    relationship: str | None = None,
) -> list[dict[str, Any]]:
    edge_tuples: list[tuple[str, str, dict[str, Any]]] = []
    for source, target, _key, attrs in graph.edges(keys=True, data=True):
        src = str(source)
        tgt = str(target)
        if src not in node_ids or tgt not in node_ids:
            continue
        if not _edge_matches_relationship(attrs, relationship):
            continue
        edge_tuples.append((src, tgt, attrs))
    return _dedupe_edges(edge_tuples)


def _run_query(graph: nx.MultiDiGraph, query: GraphQuery) -> dict[str, Any]:
    if query.related_to:
        related_id = _clean_text(query.related_to)
        if related_id not in graph:
            raise HTTPException(status_code=404, detail=f"Node not found in graph: {related_id}")
        related_nodes = _collect_related_nodes(
            graph,
            related_id,
            max_depth=query.max_depth,
            relationship=query.relationship,
        )
    else:
        related_nodes = {str(node_id) for node_id in graph.nodes}

    filtered_nodes = [
        str(node_id)
        for node_id, attrs in graph.nodes(data=True)
        if str(node_id) in related_nodes and _node_matches_query(attrs, query)
    ]

    filtered_nodes.sort(key=lambda node_id: _node_sort_key(graph, node_id))
    total = len(filtered_nodes)

    paged_nodes = filtered_nodes[query.offset : query.offset + query.limit]
    paged_node_set = set(paged_nodes)

    nodes_payload = [_node_payload(node_id, graph.nodes[node_id]) for node_id in paged_nodes]
    edges_payload = _collect_edges_for_nodes(graph, paged_node_set, relationship=query.relationship)

    return {
        "nodes": nodes_payload,
        "edges": edges_payload,
        "total": total,
    }


@router.get("/{job_id}/stats")
async def get_graph_stats(
    job_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    graph = _load_graph(job_id)

    node_types: Counter[str] = Counter()
    edge_types: Counter[str] = Counter()
    storeys: set[str] = set()
    materials: set[str] = set()

    for _node_id, attrs in graph.nodes(data=True):
        ifc_type = _clean_text(attrs.get("ifcType")) or "Unknown"
        node_types[ifc_type] += 1

        storey = _clean_text(attrs.get("storey"))
        if storey:
            storeys.add(storey)

        node_materials = attrs.get("materials") or []
        for material in node_materials:
            text = _clean_text(material)
            if text:
                materials.add(text)

    for _source, _target, attrs in graph.edges(data=True):
        edge_type = _clean_text(attrs.get("type")) or "RELATED_TO"
        edge_types[edge_type] += 1

    return {
        "job_id": job_id,
        "node_count": int(graph.number_of_nodes()),
        "edge_count": int(graph.number_of_edges()),
        "node_types": dict(sorted(node_types.items(), key=lambda item: item[0].lower())),
        "edge_types": dict(sorted(edge_types.items(), key=lambda item: item[0].lower())),
        "storeys": sorted(storeys, key=lambda value: value.lower()),
        "materials": sorted(materials, key=lambda value: value.lower()),
    }


@router.get("/{job_id}/neighbors/{global_id}")
async def get_graph_neighbors(
    job_id: str,
    global_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    graph = _load_graph(job_id)
    node_id = _clean_text(global_id)
    if node_id not in graph:
        raise HTTPException(status_code=404, detail=f"Node not found in graph: {node_id}")

    incident = _iter_incident_edges(graph, node_id)
    neighbor_ids = {node_id}
    for source, target, _attrs in incident:
        neighbor_ids.add(source)
        neighbor_ids.add(target)

    ordered_ids = [node_id] + sorted(
        [nid for nid in neighbor_ids if nid != node_id],
        key=lambda nid: _node_sort_key(graph, nid),
    )
    nodes_payload = [_node_payload(nid, graph.nodes[nid]) for nid in ordered_ids]
    edges_payload = _dedupe_edges(incident)

    return {
        "nodes": nodes_payload,
        "edges": edges_payload,
        "total": len(nodes_payload),
        "center": node_id,
    }


@router.get("/{job_id}/path/{source_id}/{target_id}")
async def get_graph_path(
    job_id: str,
    source_id: str,
    target_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    graph = _load_graph(job_id)
    source = _clean_text(source_id)
    target = _clean_text(target_id)

    if source not in graph:
        raise HTTPException(status_code=404, detail=f"Node not found in graph: {source}")
    if target not in graph:
        raise HTTPException(status_code=404, detail=f"Node not found in graph: {target}")

    try:
        path_ids = [str(node_id) for node_id in nx.shortest_path(graph.to_undirected(as_view=True), source, target)]
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail=f"No path found between {source} and {target}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to compute path: {exc}")

    edge_tuples: list[tuple[str, str, dict[str, Any]]] = []
    for idx in range(len(path_ids) - 1):
        left = path_ids[idx]
        right = path_ids[idx + 1]

        candidates: list[tuple[str, str, dict[str, Any]]] = []
        edge_map = graph.get_edge_data(left, right) or {}
        for data in edge_map.values():
            candidates.append((left, right, data))

        if not candidates:
            reverse_map = graph.get_edge_data(right, left) or {}
            for data in reverse_map.values():
                candidates.append((right, left, data))

        if candidates:
            candidates.sort(key=lambda item: _clean_text(item[2].get("type")).lower())
            edge_tuples.append(candidates[0])

    nodes_payload = [_node_payload(node_id, graph.nodes[node_id]) for node_id in path_ids]
    edges_payload = _dedupe_edges(edge_tuples)

    return {
        "nodes": nodes_payload,
        "edges": edges_payload,
        "total": len(nodes_payload),
        "hops": max(len(path_ids) - 1, 0),
    }


@router.post("/{job_id}/query")
async def query_graph(
    job_id: str,
    query: GraphQuery,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    graph = _load_graph(job_id)
    return _run_query(graph, query)


@router.get("/{job_id}/subgraph")
async def get_graph_subgraph(
    job_id: str,
    node_type: str | None = Query(default=None),
    storey: str | None = Query(default=None),
    material: str | None = Query(default=None),
    name_contains: str | None = Query(default=None),
    related_to: str | None = Query(default=None),
    relationship: str | None = Query(default=None),
    max_depth: int = Query(default=1, ge=1, le=4),
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    _: dict[str, Any] = Depends(require_job_access_user),
):
    graph = _load_graph(job_id)
    query = GraphQuery(
        node_type=node_type,
        storey=storey,
        material=material,
        name_contains=name_contains,
        related_to=related_to,
        relationship=relationship,
        max_depth=max_depth,
        limit=limit,
        offset=offset,
    )
    return _run_query(graph, query)
