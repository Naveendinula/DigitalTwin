"""
LLM-powered BIM chat using the NetworkX graph as context.

Strategy: context-stuffing.
1. Load graph stats (node types, storeys, materials, edge types).
2. Extract keywords from the user question to run targeted graph queries.
3. Inject the graph results into the LLM prompt as context.
4. Return the LLM answer + any referenced globalIds for 3D highlighting.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx
import networkx as nx

from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL
from utils import clean_text as _clean_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Graph context helpers
# ---------------------------------------------------------------------------

def _graph_summary(graph: nx.MultiDiGraph) -> dict[str, Any]:
    """Compact summary of the graph for the system prompt."""
    from collections import Counter
    node_types: Counter[str] = Counter()
    edge_types: Counter[str] = Counter()
    storeys: set[str] = set()
    materials: set[str] = set()

    for _nid, attrs in graph.nodes(data=True):
        ifc_type = _clean_text(attrs.get("ifcType")) or "Unknown"
        node_types[ifc_type] += 1
        storey = _clean_text(attrs.get("storey"))
        if storey:
            storeys.add(storey)
        for m in attrs.get("materials") or []:
            text = _clean_text(m)
            if text:
                materials.add(text)

    for _src, _tgt, attrs in graph.edges(data=True):
        edge_types[_clean_text(attrs.get("type")) or "RELATED_TO"] += 1

    return {
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "node_types": dict(sorted(node_types.items())),
        "edge_types": dict(sorted(edge_types.items())),
        "storeys": sorted(storeys, key=str.lower),
        "materials": sorted(materials, key=str.lower),
    }


def _keyword_search_nodes(
    graph: nx.MultiDiGraph,
    keywords: list[str],
    *,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Return nodes whose name / ifcType / storey / materials match any keyword."""
    if not keywords:
        return []
    patterns = [re.compile(re.escape(kw), re.IGNORECASE) for kw in keywords]
    hits: list[tuple[int, str, dict[str, Any]]] = []

    for nid, attrs in graph.nodes(data=True):
        searchable = " ".join(
            filter(None, [
                _clean_text(attrs.get("name")),
                _clean_text(attrs.get("ifcType")),
                _clean_text(attrs.get("storey")),
                " ".join(_clean_text(m) for m in (attrs.get("materials") or [])),
            ])
        )
        score = sum(1 for p in patterns if p.search(searchable))
        if score > 0:
            hits.append((score, str(nid), attrs))

    hits.sort(key=lambda h: -h[0])
    return [
        {
            "id": nid,
            "name": attrs.get("name"),
            "ifcType": attrs.get("ifcType"),
            "storey": attrs.get("storey"),
            "materials": attrs.get("materials") or [],
        }
        for _score, nid, attrs in hits[:limit]
    ]


def _neighbors_of(
    graph: nx.MultiDiGraph,
    node_id: str,
    *,
    limit: int = 15,
) -> list[dict[str, Any]]:
    """Return immediate neighbors of a node."""
    if node_id not in graph:
        return []
    neighbor_ids: set[str] = set()
    for _src, tgt, _key, _attrs in graph.out_edges(node_id, keys=True, data=True):
        neighbor_ids.add(str(tgt))
    for src, _tgt, _key, _attrs in graph.in_edges(node_id, keys=True, data=True):
        neighbor_ids.add(str(src))

    result: list[dict[str, Any]] = []
    for nid in list(neighbor_ids)[:limit]:
        attrs = graph.nodes[nid]
        result.append({
            "id": nid,
            "name": attrs.get("name"),
            "ifcType": attrs.get("ifcType"),
            "storey": attrs.get("storey"),
        })
    return result


def _edges_for_node(graph: nx.MultiDiGraph, node_id: str) -> list[dict[str, Any]]:
    """Return edges involving a node."""
    if node_id not in graph:
        return []
    edges: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for src, tgt, _key, attrs in graph.out_edges(node_id, keys=True, data=True):
        key = (str(src), str(tgt), _clean_text(attrs.get("type")))
        if key not in seen:
            seen.add(key)
            edges.append({"source": str(src), "target": str(tgt), "type": key[2]})
    for src, tgt, _key, attrs in graph.in_edges(node_id, keys=True, data=True):
        key = (str(src), str(tgt), _clean_text(attrs.get("type")))
        if key not in seen:
            seen.add(key)
            edges.append({"source": str(src), "target": str(tgt), "type": key[2]})
    return edges


def _extract_keywords(question: str) -> list[str]:
    """Extract meaningful keywords from a user question."""
    stop_words = {
        "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "shall",
        "should", "may", "might", "must", "can", "could", "of", "in", "to",
        "for", "with", "on", "at", "from", "by", "about", "as", "into",
        "through", "during", "before", "after", "above", "below", "between",
        "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
        "neither", "each", "every", "all", "any", "few", "more", "most",
        "some", "no", "only", "own", "same", "than", "too", "very",
        "what", "which", "who", "whom", "this", "that", "these", "those",
        "i", "me", "my", "myself", "we", "our", "ours", "you", "your",
        "he", "him", "his", "she", "her", "it", "its", "they", "them",
        "how", "many", "much", "where", "when", "why", "show", "list",
        "tell", "give", "find", "get", "describe", "explain",
    }
    tokens = re.findall(r"[A-Za-z0-9_\-]+", question)
    keywords = [t for t in tokens if t.lower() not in stop_words and len(t) > 1]
    return keywords


def _build_graph_context(
    graph: nx.MultiDiGraph,
    question: str,
) -> str:
    """Build a text context block from graph data relevant to the question."""
    summary = _graph_summary(graph)
    keywords = _extract_keywords(question)
    matched_nodes = _keyword_search_nodes(graph, keywords, limit=30)

    # Also find edges for the top matches
    top_node_edges: list[dict[str, Any]] = []
    for node in matched_nodes[:5]:
        top_node_edges.extend(_edges_for_node(graph, node["id"]))

    # Deduplicate edges
    seen_edges: set[tuple[str, str, str]] = set()
    deduped_edges: list[dict[str, Any]] = []
    for e in top_node_edges:
        key = (e["source"], e["target"], e["type"])
        if key not in seen_edges:
            seen_edges.add(key)
            deduped_edges.append(e)

    # Build the name map for referenced node IDs
    referenced_ids = set()
    for e in deduped_edges:
        referenced_ids.add(e["source"])
        referenced_ids.add(e["target"])
    name_map: dict[str, str] = {}
    for nid in referenced_ids:
        if nid in graph:
            attrs = graph.nodes[nid]
            name = _clean_text(attrs.get("name")) or _clean_text(attrs.get("ifcType")) or nid
            name_map[nid] = name

    parts: list[str] = []
    parts.append("=== BIM MODEL GRAPH SUMMARY ===")
    parts.append(f"Nodes: {summary['node_count']}, Edges: {summary['edge_count']}")
    parts.append(f"Node types: {json.dumps(summary['node_types'])}")
    parts.append(f"Edge types: {json.dumps(summary['edge_types'])}")
    parts.append(f"Storeys: {', '.join(summary['storeys']) or 'none'}")
    parts.append(f"Materials: {', '.join(summary['materials'][:40]) or 'none'}")

    if matched_nodes:
        parts.append("")
        parts.append(f"=== MATCHED NODES (keywords: {', '.join(keywords)}) ===")
        for node in matched_nodes:
            line = f"- {node['name'] or '(unnamed)'} | type={node['ifcType']} | storey={node['storey'] or '?'} | id={node['id']}"
            if node["materials"]:
                line += f" | materials={', '.join(node['materials'])}"
            parts.append(line)

    if deduped_edges:
        parts.append("")
        parts.append("=== RELATIONSHIPS (for top matched nodes) ===")
        for e in deduped_edges[:40]:
            src_name = name_map.get(e["source"], e["source"])
            tgt_name = name_map.get(e["target"], e["target"])
            parts.append(f"- {src_name} --[{e['type']}]--> {tgt_name}")

    return "\n".join(parts)


SYSTEM_PROMPT = """You are a BIM (Building Information Modeling) assistant for a digital twin application. You help users understand their building model by answering questions about the structure, spaces, materials, systems, and relationships between building elements.

You have access to a graph representation of the IFC building model. The graph contains:
- **Nodes**: Building elements (walls, doors, slabs, columns, etc.), spaces, storeys, materials, and systems.
- **Edges**: Relationships like CONTAINED_IN (element in a space/storey), DECOMPOSES (spatial hierarchy), HAS_MATERIAL, BOUNDED_BY (space boundaries), FEEDS (equipment to terminal), SERVES (terminal to space), IN_SYSTEM.

When answering:
1. Use the provided graph context to give accurate, specific answers.
2. Reference specific element names and IDs when relevant.
3. If the data doesn't contain enough information to answer, say so clearly.
4. Keep answers concise but informative.
5. When you mention specific building elements, include their globalId in parentheses so the user can locate them in the 3D viewer."""


async def ask_about_model(
    graph: nx.MultiDiGraph,
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Send a chat completion request to OpenRouter with graph context.

    Parameters
    ----------
    graph : nx.MultiDiGraph
        The loaded BIM relationship graph.
    messages : list[dict]
        Chat history in OpenAI format: [{role, content}, ...].
        The last message should be the user's new question.

    Returns
    -------
    dict with keys:
        answer (str) – The LLM's response text.
        referenced_ids (list[str]) – globalIds mentioned in the answer.
        reasoning (str | None) – Reasoning details if available.
    """
    if not OPENROUTER_API_KEY:
        return {
            "answer": "LLM is not configured. Set OPENROUTER_API_KEY in environment.",
            "referenced_ids": [],
            "reasoning": None,
        }

    # Find the latest user question for context building
    latest_question = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            latest_question = msg.get("content", "")
            break

    # Build graph context from the question
    graph_context = _build_graph_context(graph, latest_question)

    # Assemble the full message list with system prompt + graph context
    system_message = {
        "role": "system",
        "content": f"{SYSTEM_PROMPT}\n\n{graph_context}",
    }

    # Build request messages: system + conversation history
    request_messages = [system_message] + [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": request_messages,
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                OPENROUTER_BASE_URL,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as exc:
        logger.error("OpenRouter HTTP error: %s %s", exc.response.status_code, exc.response.text[:500])
        return {
            "answer": f"LLM request failed (HTTP {exc.response.status_code}). Please try again.",
            "referenced_ids": [],
            "reasoning": None,
        }
    except Exception as exc:
        logger.error("OpenRouter request error: %s", exc)
        return {
            "answer": "Failed to reach the LLM service. Please try again later.",
            "referenced_ids": [],
            "reasoning": None,
        }

    # Parse response
    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})
    answer = message.get("content") or ""
    reasoning_raw = message.get("reasoning_details") or message.get("reasoning") or None

    # Normalize reasoning: OpenRouter may return a list of dicts
    reasoning: str | None = None
    if isinstance(reasoning_raw, str):
        reasoning = reasoning_raw
    elif isinstance(reasoning_raw, list):
        parts = []
        for item in reasoning_raw:
            if isinstance(item, dict):
                parts.append(item.get("content") or item.get("text") or str(item))
            elif isinstance(item, str):
                parts.append(item)
        reasoning = "\n".join(parts) if parts else None

    # Extract globalIds referenced in the answer (22-char alphanumeric IFC GUIDs)
    referenced_ids = _extract_global_ids(answer, graph)

    return {
        "answer": answer,
        "referenced_ids": referenced_ids,
        "reasoning": reasoning,
    }


def _extract_global_ids(text: str, graph: nx.MultiDiGraph) -> list[str]:
    """Pull out IFC GlobalIds mentioned in the LLM response."""
    # IFC GlobalIds are 22-char base64-ish strings
    candidates = re.findall(r"\b([0-9A-Za-z_$]{22})\b", text)
    valid = [c for c in candidates if c in graph]
    # Also check for node IDs explicitly mentioned (mat:, sys: prefixed)
    prefixed = re.findall(r"\b((?:mat|sys):[^\s\)]+)", text)
    valid.extend(p for p in prefixed if p in graph)
    return list(dict.fromkeys(valid))  # dedupe, preserve order
