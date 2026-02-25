"""
Neo4j graph persistence + query helpers.

Phase 2:
- graph.json -> Neo4j dual-write ingest
- per-job graph deletion

Phase 3:
- Neo4j-backed graph query store implementation

Phase 5:
- Neo4j-first cutover for graph API + LLM query paths
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import Lock
from typing import Any, Iterable

from fastapi import HTTPException

from config import NEO4J_DATABASE, NEO4J_INGEST_BATCH_SIZE
from neo4j_client import get_neo4j_driver
from utils import clean_text as _clean_text

logger = logging.getLogger(__name__)

_schema_initialized = False
_schema_lock = Lock()
_GRAPH_NOT_BUILT_MESSAGE = "Graph not built for this job. Re-process to enable."

_SCHEMA_QUERIES = (
    """
    CREATE CONSTRAINT bim_node_job_id_unique IF NOT EXISTS
    FOR (n:BIMNode)
    REQUIRE (n.job_id, n.id) IS UNIQUE
    """,
    """
    CREATE CONSTRAINT bim_rel_job_key_unique IF NOT EXISTS
    FOR ()-[r:BIM_REL]-()
    REQUIRE (r.job_id, r.edge_key) IS UNIQUE
    """,
    """
    CREATE INDEX bim_node_job_ifc_type IF NOT EXISTS
    FOR (n:BIMNode)
    ON (n.job_id, n.ifcType)
    """,
    """
    CREATE INDEX bim_node_job_storey IF NOT EXISTS
    FOR (n:BIMNode)
    ON (n.job_id, n.storey)
    """,
    """
    CREATE INDEX bim_rel_job_type IF NOT EXISTS
    FOR ()-[r:BIM_REL]-()
    ON (r.job_id, r.type)
    """,
)

_DELETE_JOB_GRAPH_CYPHER = """
MATCH (n:BIMNode {job_id: $job_id})
DETACH DELETE n
"""

_UPSERT_NODES_CYPHER = """
UNWIND $rows AS row
MERGE (n:BIMNode {job_id: $job_id, id: row.id})
SET n.globalId = row.globalId,
    n.label = row.label,
    n.ifcType = row.ifcType,
    n.name = row.name,
    n.storey = row.storey,
    n.materials = row.materials
"""

_UPSERT_EDGES_CYPHER = """
UNWIND $rows AS row
MATCH (source:BIMNode {job_id: $job_id, id: row.source})
MATCH (target:BIMNode {job_id: $job_id, id: row.target})
MERGE (source)-[r:BIM_REL {job_id: $job_id, edge_key: row.edge_key}]->(target)
SET r.type = row.type,
    r.source = row.source,
    r.target = row.target
"""


def _iter_batches(rows: list[dict[str, Any]], batch_size: int) -> Iterable[list[dict[str, Any]]]:
    for start in range(0, len(rows), batch_size):
        yield rows[start : start + batch_size]


def _ensure_schema() -> bool:
    global _schema_initialized
    if _schema_initialized:
        return True

    driver = get_neo4j_driver()
    if not driver:
        return False

    with _schema_lock:
        if _schema_initialized:
            return True
        try:
            with driver.session(database=NEO4J_DATABASE) as session:
                for query in _SCHEMA_QUERIES:
                    session.execute_write(lambda tx, q=query: tx.run(q).consume())
            _schema_initialized = True
            logger.info("Neo4j BIM graph schema ensured.")
            return True
        except Exception as exc:
            logger.warning("Neo4j schema initialization failed: %s", exc)
            return False


def _normalize_node(raw_node: dict[str, Any]) -> dict[str, Any] | None:
    node_id = _clean_text(raw_node.get("id")) or _clean_text(raw_node.get("globalId"))
    if not node_id:
        return None

    materials_raw = raw_node.get("materials") or []
    materials = []
    if isinstance(materials_raw, list):
        for value in materials_raw:
            text = _clean_text(value)
            if text:
                materials.append(text)

    return {
        "id": node_id,
        "globalId": _clean_text(raw_node.get("globalId")) or node_id,
        "label": _clean_text(raw_node.get("label")) or None,
        "ifcType": _clean_text(raw_node.get("ifcType")) or None,
        "name": _clean_text(raw_node.get("name")) or None,
        "storey": _clean_text(raw_node.get("storey")) or None,
        "materials": materials,
    }


def _normalize_edge(raw_edge: dict[str, Any]) -> dict[str, Any] | None:
    source = _clean_text(raw_edge.get("source"))
    target = _clean_text(raw_edge.get("target"))
    if not source or not target:
        return None
    edge_type = _clean_text(raw_edge.get("type")) or "RELATED_TO"
    return {
        "source": source,
        "target": target,
        "type": edge_type,
        "edge_key": f"{source}|{edge_type}|{target}",
    }


def _load_graph_rows(graph_json_path: str | Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    graph_path = Path(graph_json_path)
    with open(graph_path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)

    raw_nodes = payload.get("nodes") if isinstance(payload, dict) else []
    edge_key = "links" if isinstance(payload, dict) and "links" in payload else "edges"
    raw_edges = payload.get(edge_key) if isinstance(payload, dict) else []

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    if isinstance(raw_nodes, list):
        for raw in raw_nodes:
            if not isinstance(raw, dict):
                continue
            normalized = _normalize_node(raw)
            if normalized:
                nodes.append(normalized)

    if isinstance(raw_edges, list):
        for raw in raw_edges:
            if not isinstance(raw, dict):
                continue
            normalized = _normalize_edge(raw)
            if normalized:
                edges.append(normalized)

    return nodes, edges


def sync_graph_json_to_neo4j(job_id: str, graph_json_path: str | Path) -> dict[str, Any]:
    """
    Import a job's graph.json into Neo4j using batched upserts.
    Existing graph rows for the same job are replaced.
    """
    driver = get_neo4j_driver()
    if not driver:
        return {"enabled": False, "nodes": 0, "edges": 0}

    if not _ensure_schema():
        return {"enabled": True, "nodes": 0, "edges": 0, "error": "schema_init_failed"}

    nodes, edges = _load_graph_rows(graph_json_path)

    try:
        with driver.session(database=NEO4J_DATABASE) as session:
            session.execute_write(lambda tx: tx.run(_DELETE_JOB_GRAPH_CYPHER, job_id=job_id).consume())

            for batch in _iter_batches(nodes, NEO4J_INGEST_BATCH_SIZE):
                session.execute_write(
                    lambda tx, rows=batch: tx.run(_UPSERT_NODES_CYPHER, job_id=job_id, rows=rows).consume()
                )

            for batch in _iter_batches(edges, NEO4J_INGEST_BATCH_SIZE):
                session.execute_write(
                    lambda tx, rows=batch: tx.run(_UPSERT_EDGES_CYPHER, job_id=job_id, rows=rows).consume()
                )
    except Exception as exc:
        logger.warning("[%s] Neo4j graph sync failed: %s", job_id, exc)
        return {"enabled": True, "nodes": 0, "edges": 0, "error": str(exc)}

    return {"enabled": True, "nodes": len(nodes), "edges": len(edges)}


def delete_job_graph_from_neo4j(job_id: str) -> bool:
    """Delete all Neo4j graph data for a single job_id."""
    driver = get_neo4j_driver()
    if not driver:
        return False
    try:
        with driver.session(database=NEO4J_DATABASE) as session:
            session.execute_write(lambda tx: tx.run(_DELETE_JOB_GRAPH_CYPHER, job_id=job_id).consume())
        return True
    except Exception as exc:
        logger.warning("[%s] Failed to delete Neo4j graph data: %s", job_id, exc)
        return False


def _node_payload(row: dict[str, Any]) -> dict[str, Any]:
    materials_raw = row.get("materials") or []
    materials: list[str] = []
    if isinstance(materials_raw, list):
        for value in materials_raw:
            text = _clean_text(value)
            if text:
                materials.append(text)
    return {
        "id": str(row.get("id") or ""),
        "globalId": str(row.get("globalId") or row.get("id") or ""),
        "label": row.get("label"),
        "ifcType": row.get("ifcType"),
        "name": row.get("name"),
        "storey": row.get("storey"),
        "materials": materials,
    }


def _node_sort_key(node: dict[str, Any]) -> tuple[str, str, str]:
    return (
        _clean_text(node.get("name")).lower(),
        _clean_text(node.get("ifcType")).lower(),
        str(node.get("id") or ""),
    )


def _dedupe_edges(edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    result: list[dict[str, Any]] = []
    for edge in edges:
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        edge_type = _clean_text(edge.get("type")) or "RELATED_TO"
        key = (source, target, edge_type)
        if key in seen:
            continue
        seen.add(key)
        result.append({"source": source, "target": target, "type": edge_type})
    return result


class Neo4jGraphStore:
    def __init__(self) -> None:
        pass

    def invalidate_cache(self, job_id: str) -> None:
        return None

    def _execute_read(self, query: str, **params: Any) -> list[dict[str, Any]]:
        driver = get_neo4j_driver()
        if not driver:
            raise HTTPException(status_code=500, detail="Neo4j driver is not available.")
        with driver.session(database=NEO4J_DATABASE) as session:
            result = session.run(query, **params)
            return [record.data() for record in result]

    def _job_node_count(self, job_id: str) -> int:
        rows = self._execute_read(
            "MATCH (n:BIMNode {job_id: $job_id}) RETURN count(n) AS count",
            job_id=job_id,
        )
        if not rows:
            return 0
        return int(rows[0].get("count") or 0)

    def _ensure_job_graph_exists(self, job_id: str) -> None:
        if self._job_node_count(job_id) == 0:
            raise HTTPException(status_code=404, detail=_GRAPH_NOT_BUILT_MESSAGE)

    def _get_node_by_id(self, job_id: str, node_id: str) -> dict[str, Any] | None:
        rows = self._execute_read(
            """
            MATCH (n:BIMNode {job_id: $job_id, id: $node_id})
            RETURN n.id AS id,
                   n.globalId AS globalId,
                   n.label AS label,
                   n.ifcType AS ifcType,
                   n.name AS name,
                   n.storey AS storey,
                   n.materials AS materials
            LIMIT 1
            """,
            job_id=job_id,
            node_id=node_id,
        )
        if not rows:
            return None
        return _node_payload(rows[0])

    def get_stats(self, job_id: str) -> dict[str, Any]:
        self._ensure_job_graph_exists(job_id)

        node_count_rows = self._execute_read(
            "MATCH (n:BIMNode {job_id: $job_id}) RETURN count(n) AS count",
            job_id=job_id,
        )
        edge_count_rows = self._execute_read(
            "MATCH ()-[r:BIM_REL {job_id: $job_id}]->() RETURN count(r) AS count",
            job_id=job_id,
        )
        node_type_rows = self._execute_read(
            """
            MATCH (n:BIMNode {job_id: $job_id})
            RETURN coalesce(n.ifcType, 'Unknown') AS value, count(*) AS count
            """,
            job_id=job_id,
        )
        edge_type_rows = self._execute_read(
            """
            MATCH ()-[r:BIM_REL {job_id: $job_id}]->()
            RETURN coalesce(r.type, 'RELATED_TO') AS value, count(*) AS count
            """,
            job_id=job_id,
        )
        storey_rows = self._execute_read(
            """
            MATCH (n:BIMNode {job_id: $job_id})
            WHERE n.storey IS NOT NULL
            RETURN DISTINCT n.storey AS value
            """,
            job_id=job_id,
        )
        material_rows = self._execute_read(
            """
            MATCH (n:BIMNode {job_id: $job_id})
            UNWIND coalesce(n.materials, []) AS mat
            RETURN DISTINCT mat AS value
            """,
            job_id=job_id,
        )

        node_types: dict[str, int] = {}
        for row in node_type_rows:
            key = _clean_text(row.get("value")) or "Unknown"
            node_types[key] = int(row.get("count") or 0)

        edge_types: dict[str, int] = {}
        for row in edge_type_rows:
            key = _clean_text(row.get("value")) or "RELATED_TO"
            edge_types[key] = int(row.get("count") or 0)

        storeys = sorted(
            {
                text
                for row in storey_rows
                if (text := _clean_text(row.get("value")))
            },
            key=lambda value: value.lower(),
        )

        materials = sorted(
            {
                text
                for row in material_rows
                if (text := _clean_text(row.get("value")))
            },
            key=lambda value: value.lower(),
        )

        return {
            "job_id": job_id,
            "node_count": int((node_count_rows[0] if node_count_rows else {}).get("count") or 0),
            "edge_count": int((edge_count_rows[0] if edge_count_rows else {}).get("count") or 0),
            "node_types": dict(sorted(node_types.items(), key=lambda item: item[0].lower())),
            "edge_types": dict(sorted(edge_types.items(), key=lambda item: item[0].lower())),
            "storeys": storeys,
            "materials": materials,
        }

    def get_neighbors(self, job_id: str, global_id: str) -> dict[str, Any]:
        self._ensure_job_graph_exists(job_id)

        node_id = _clean_text(global_id)
        center_node = self._get_node_by_id(job_id, node_id)
        if not center_node:
            raise HTTPException(status_code=404, detail=f"Node not found in graph: {node_id}")

        edge_rows = self._execute_read(
            """
            MATCH (a:BIMNode {job_id: $job_id})-[r:BIM_REL {job_id: $job_id}]-(b:BIMNode {job_id: $job_id})
            WHERE a.id = $node_id OR b.id = $node_id
            RETURN DISTINCT startNode(r).id AS source,
                            endNode(r).id AS target,
                            coalesce(r.type, 'RELATED_TO') AS type
            """,
            job_id=job_id,
            node_id=node_id,
        )
        edges_payload = _dedupe_edges(edge_rows)

        neighbor_ids = {node_id}
        for edge in edges_payload:
            neighbor_ids.add(str(edge["source"]))
            neighbor_ids.add(str(edge["target"]))

        node_rows = self._execute_read(
            """
            MATCH (n:BIMNode {job_id: $job_id})
            WHERE n.id IN $node_ids
            RETURN n.id AS id,
                   n.globalId AS globalId,
                   n.label AS label,
                   n.ifcType AS ifcType,
                   n.name AS name,
                   n.storey AS storey,
                   n.materials AS materials
            """,
            job_id=job_id,
            node_ids=list(neighbor_ids),
        )
        node_map = {str(row.get("id")): _node_payload(row) for row in node_rows}

        ordered_neighbor_ids = sorted(
            [nid for nid in neighbor_ids if nid != node_id],
            key=lambda nid: _node_sort_key(node_map.get(nid, {"id": nid})),
        )
        ordered_ids = [node_id] + ordered_neighbor_ids
        nodes_payload = [node_map[nid] for nid in ordered_ids if nid in node_map]

        return {
            "nodes": nodes_payload,
            "edges": edges_payload,
            "total": len(nodes_payload),
            "center": node_id,
        }

    def get_path(self, job_id: str, source_id: str, target_id: str) -> dict[str, Any]:
        self._ensure_job_graph_exists(job_id)

        source = _clean_text(source_id)
        target = _clean_text(target_id)

        if not self._get_node_by_id(job_id, source):
            raise HTTPException(status_code=404, detail=f"Node not found in graph: {source}")
        if not self._get_node_by_id(job_id, target):
            raise HTTPException(status_code=404, detail=f"Node not found in graph: {target}")

        path_rows = self._execute_read(
            """
            MATCH (source:BIMNode {job_id: $job_id, id: $source_id})
            MATCH (target:BIMNode {job_id: $job_id, id: $target_id})
            MATCH p = shortestPath((source)-[:BIM_REL*]-(target))
            RETURN [n IN nodes(p) | n.id] AS path_ids
            """,
            job_id=job_id,
            source_id=source,
            target_id=target,
        )
        if not path_rows:
            raise HTTPException(status_code=404, detail=f"No path found between {source} and {target}")

        path_ids_raw = path_rows[0].get("path_ids") or []
        path_ids = [str(item) for item in path_ids_raw if _clean_text(item)]
        if not path_ids:
            raise HTTPException(status_code=404, detail=f"No path found between {source} and {target}")

        node_rows = self._execute_read(
            """
            MATCH (n:BIMNode {job_id: $job_id})
            WHERE n.id IN $path_ids
            RETURN n.id AS id,
                   n.globalId AS globalId,
                   n.label AS label,
                   n.ifcType AS ifcType,
                   n.name AS name,
                   n.storey AS storey,
                   n.materials AS materials
            """,
            job_id=job_id,
            path_ids=path_ids,
        )
        node_map = {str(row.get("id")): _node_payload(row) for row in node_rows}
        nodes_payload = [node_map[nid] for nid in path_ids if nid in node_map]

        edge_candidates: list[dict[str, Any]] = []
        for index in range(len(path_ids) - 1):
            left = path_ids[index]
            right = path_ids[index + 1]
            hop_rows = self._execute_read(
                """
                MATCH (a:BIMNode {job_id: $job_id, id: $left})-[r:BIM_REL {job_id: $job_id}]-(b:BIMNode {job_id: $job_id, id: $right})
                RETURN startNode(r).id AS source,
                       endNode(r).id AS target,
                       coalesce(r.type, 'RELATED_TO') AS type
                ORDER BY toLower(coalesce(r.type, 'RELATED_TO')) ASC
                LIMIT 1
                """,
                job_id=job_id,
                left=left,
                right=right,
            )
            if hop_rows:
                edge_candidates.append(
                    {
                        "source": str(hop_rows[0].get("source") or ""),
                        "target": str(hop_rows[0].get("target") or ""),
                        "type": _clean_text(hop_rows[0].get("type")) or "RELATED_TO",
                    }
                )

        edges_payload = _dedupe_edges(edge_candidates)
        return {
            "nodes": nodes_payload,
            "edges": edges_payload,
            "total": len(nodes_payload),
            "hops": max(len(path_ids) - 1, 0),
        }

    def _collect_related_node_ids(
        self,
        job_id: str,
        related_to: str | None,
        relationship: str | None,
        max_depth: int,
    ) -> set[str]:
        if not related_to:
            rows = self._execute_read(
                "MATCH (n:BIMNode {job_id: $job_id}) RETURN n.id AS id",
                job_id=job_id,
            )
            return {str(row.get("id")) for row in rows if _clean_text(row.get("id"))}

        related_id = _clean_text(related_to)
        if not self._get_node_by_id(job_id, related_id):
            raise HTTPException(status_code=404, detail=f"Node not found in graph: {related_id}")

        depth = max(1, min(4, int(max_depth)))
        rows = self._execute_read(
            f"""
            MATCH (start:BIMNode {{job_id: $job_id, id: $start_id}})
            MATCH p = (start)-[r:BIM_REL*0..{depth}]-(n:BIMNode {{job_id: $job_id}})
            WHERE $relationship IS NULL
               OR all(rel IN relationships(p) WHERE toLower(coalesce(rel.type, '')) = toLower($relationship))
            RETURN DISTINCT n.id AS id
            """,
            job_id=job_id,
            start_id=related_id,
            relationship=relationship,
        )
        return {str(row.get("id")) for row in rows if _clean_text(row.get("id"))}

    def _query_impl(self, job_id: str, query: Any) -> dict[str, Any]:
        relationship = _clean_text(query.relationship) or None
        related_node_ids = self._collect_related_node_ids(
            job_id,
            query.related_to,
            relationship,
            int(query.max_depth),
        )
        if not related_node_ids:
            return {"nodes": [], "edges": [], "total": 0}

        node_rows = self._execute_read(
            """
            MATCH (n:BIMNode {job_id: $job_id})
            WHERE n.id IN $related_ids
              AND ($node_type IS NULL OR toLower(coalesce(n.ifcType, '')) = toLower($node_type))
              AND ($storey IS NULL OR toLower(coalesce(n.storey, '')) = toLower($storey))
              AND ($name_contains IS NULL OR toLower(coalesce(n.name, '')) CONTAINS toLower($name_contains))
              AND ($material IS NULL OR any(m IN coalesce(n.materials, []) WHERE toLower(toString(m)) = toLower($material)))
            RETURN n.id AS id,
                   n.globalId AS globalId,
                   n.label AS label,
                   n.ifcType AS ifcType,
                   n.name AS name,
                   n.storey AS storey,
                   n.materials AS materials
            """,
            job_id=job_id,
            related_ids=list(related_node_ids),
            node_type=_clean_text(query.node_type) or None,
            storey=_clean_text(query.storey) or None,
            name_contains=_clean_text(query.name_contains) or None,
            material=_clean_text(query.material) or None,
        )

        filtered_nodes = [_node_payload(row) for row in node_rows]
        filtered_nodes.sort(key=_node_sort_key)
        total = len(filtered_nodes)

        offset = max(0, int(query.offset))
        limit = max(1, int(query.limit))
        paged_nodes = filtered_nodes[offset : offset + limit]
        paged_ids = [str(node.get("id")) for node in paged_nodes if _clean_text(node.get("id"))]

        edges_payload: list[dict[str, Any]] = []
        if paged_ids:
            edge_rows = self._execute_read(
                """
                MATCH (a:BIMNode {job_id: $job_id})-[r:BIM_REL {job_id: $job_id}]->(b:BIMNode {job_id: $job_id})
                WHERE a.id IN $node_ids
                  AND b.id IN $node_ids
                  AND ($relationship IS NULL OR toLower(coalesce(r.type, '')) = toLower($relationship))
                RETURN DISTINCT startNode(r).id AS source,
                                endNode(r).id AS target,
                                coalesce(r.type, 'RELATED_TO') AS type
                """,
                job_id=job_id,
                node_ids=paged_ids,
                relationship=relationship,
            )
            edges_payload = _dedupe_edges(edge_rows)

        return {
            "nodes": paged_nodes,
            "edges": edges_payload,
            "total": total,
        }

    def query(self, job_id: str, query: Any) -> dict[str, Any]:
        self._ensure_job_graph_exists(job_id)
        return self._query_impl(job_id, query)

    def subgraph(self, job_id: str, query: Any) -> dict[str, Any]:
        self._ensure_job_graph_exists(job_id)
        return self._query_impl(job_id, query)

    def get_existing_node_ids(self, job_id: str, node_ids: list[str]) -> list[str]:
        if not node_ids:
            return []
        cleaned_ids = [text for raw in node_ids if (text := _clean_text(raw))]
        if not cleaned_ids:
            return []

        self._ensure_job_graph_exists(job_id)
        rows = self._execute_read(
            """
            MATCH (n:BIMNode {job_id: $job_id})
            WHERE n.id IN $node_ids
            RETURN n.id AS id
            """,
            job_id=job_id,
            node_ids=cleaned_ids,
        )
        existing = [str(row.get("id")) for row in rows if _clean_text(row.get("id"))]
        return list(dict.fromkeys(existing))
