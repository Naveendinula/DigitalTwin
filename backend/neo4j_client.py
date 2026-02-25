"""
Neo4j driver lifecycle helpers.
"""

from __future__ import annotations

import logging
from typing import Any

from config import GRAPH_BACKEND, NEO4J_DATABASE, NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER

logger = logging.getLogger(__name__)

try:
    from neo4j import Driver, GraphDatabase
    _neo4j_import_error: Exception | None = None
except Exception as exc:
    Driver = Any  # type: ignore[assignment]
    GraphDatabase = None
    _neo4j_import_error = exc

_driver: Driver | None = None


def initialize_neo4j() -> None:
    """Initialize a shared Neo4j driver when configured."""
    global _driver

    if GRAPH_BACKEND != "neo4j":
        return

    if GraphDatabase is None:
        extra = f" Import error: {_neo4j_import_error}" if _neo4j_import_error else ""
        raise RuntimeError(
            "GRAPH_BACKEND=neo4j requires the neo4j package to be installed."
            f"{extra} Set GRAPH_BACKEND=networkx to run without Neo4j."
        )

    if not NEO4J_URI:
        raise RuntimeError("GRAPH_BACKEND=neo4j requires NEO4J_URI to be set.")

    auth = (NEO4J_USER, NEO4J_PASSWORD) if NEO4J_USER else None
    try:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=auth)
        _driver.verify_connectivity()
        logger.info("Neo4j connectivity verified for database '%s'.", NEO4J_DATABASE)
    except Exception as exc:
        close_neo4j()
        raise RuntimeError(f"Failed to initialize Neo4j connection: {exc}") from exc


def get_neo4j_driver() -> Driver | None:
    return _driver


def close_neo4j() -> None:
    global _driver
    if _driver is None:
        return
    try:
        _driver.close()
    finally:
        _driver = None
