"""
Graph store factory.

Phase 5 defaults to Neo4j-backed reads/writes for graph API and LLM context.
"""

from __future__ import annotations

import logging

from config import GRAPH_BACKEND
from graph_store_neo4j import Neo4jGraphStore
from graph_store_networkx import NetworkXGraphStore

logger = logging.getLogger(__name__)

if GRAPH_BACKEND == "neo4j":
    _graph_store = Neo4jGraphStore()
    _active_backend = "neo4j"
elif GRAPH_BACKEND == "networkx":
    _graph_store = NetworkXGraphStore()
    _active_backend = "networkx"
else:
    logger.warning("Unknown GRAPH_BACKEND '%s'; using neo4j.", GRAPH_BACKEND)
    _graph_store = Neo4jGraphStore()
    _active_backend = "neo4j"


def get_graph_store():
    return _graph_store


def get_graph_backend_name() -> str:
    return _active_backend


def invalidate_graph_cache(job_id: str) -> None:
    _graph_store.invalidate_cache(job_id)
