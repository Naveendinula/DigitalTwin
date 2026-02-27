"""
FastAPI router for graph-query endpoints.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from graph_models import GraphQuery
from graph_store import get_graph_store, invalidate_graph_cache as invalidate_graph_store_cache
from job_security import require_job_access_user

router = APIRouter(prefix="/api/graph", tags=["graph"])


def invalidate_graph_cache(job_id: str) -> None:
    invalidate_graph_store_cache(job_id)


@router.get("/{job_id}/stats")
async def get_graph_stats(
    job_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    return get_graph_store().get_stats(job_id)


@router.get("/{job_id}/neighbors/{global_id}")
async def get_graph_neighbors(
    job_id: str,
    global_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    return get_graph_store().get_neighbors(job_id, global_id)


@router.get("/{job_id}/path/{source_id}/{target_id}")
async def get_graph_path(
    job_id: str,
    source_id: str,
    target_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    return get_graph_store().get_path(job_id, source_id, target_id)


@router.post("/{job_id}/query")
async def query_graph(
    job_id: str,
    query: GraphQuery,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    return get_graph_store().query(job_id, query)


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
    return get_graph_store().subgraph(job_id, query)


@router.get("/{job_id}/properties/{global_id}")
async def get_element_properties(
    job_id: str,
    global_id: str,
    pset_name: str | None = Query(default=None),
    _: dict[str, Any] = Depends(require_job_access_user),
):
    """Return property sets attached to a single element."""
    store = get_graph_store()
    method = getattr(store, "get_element_properties", None)
    if not method:
        return {"properties": [], "note": "Property queries not supported by current graph backend."}
    return {"properties": method(job_id, global_id, pset_name=pset_name)}


@router.get("/{job_id}/property-stats")
async def get_property_stats(
    job_id: str,
    _: dict[str, Any] = Depends(require_job_access_user),
):
    """Return aggregate property counts for the model."""
    store = get_graph_store()
    method = getattr(store, "get_property_stats", None)
    if not method:
        return {"total_properties": 0, "note": "Property queries not supported by current graph backend."}
    return method(job_id)
