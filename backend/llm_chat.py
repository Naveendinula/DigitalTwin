"""
LLM-powered BIM chat using graph-store queries as context source.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL
from graph_models import GraphQuery
from graph_store import get_graph_store
from utils import clean_text as _clean_text

logger = logging.getLogger(__name__)

_MAX_KEYWORDS = 8
_MATCH_LIMIT = 30
_TOP_MATCHES_FOR_EDGES = 5
_EDGE_LIMIT = 40


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
    return list(dict.fromkeys(keywords))


def _node_searchable_text(node: dict[str, Any]) -> str:
    materials = node.get("materials") or []
    material_text = " ".join(_clean_text(value) for value in materials)
    return " ".join(
        filter(
            None,
            [
                _clean_text(node.get("name")),
                _clean_text(node.get("ifcType")),
                _clean_text(node.get("storey")),
                material_text,
            ],
        )
    )


def _keyword_search_nodes(job_id: str, keywords: list[str], *, limit: int = _MATCH_LIMIT) -> list[dict[str, Any]]:
    """Run targeted store queries and rank matching nodes by keyword hit count."""
    if not keywords:
        return []

    store = get_graph_store()
    capped_keywords = keywords[:_MAX_KEYWORDS]

    candidates_by_id: dict[str, dict[str, Any]] = {}
    for keyword in capped_keywords:
        query_variants = (
            GraphQuery(name_contains=keyword, limit=120, offset=0),
            GraphQuery(node_type=keyword, limit=120, offset=0),
            GraphQuery(storey=keyword, limit=120, offset=0),
            GraphQuery(material=keyword, limit=120, offset=0),
        )
        for query in query_variants:
            result = store.query(job_id, query)
            for node in result.get("nodes") or []:
                node_id = _clean_text(node.get("id")) or _clean_text(node.get("globalId"))
                if not node_id:
                    continue
                normalized_node = {
                    "id": node_id,
                    "name": node.get("name"),
                    "ifcType": node.get("ifcType"),
                    "storey": node.get("storey"),
                    "materials": node.get("materials") or [],
                }
                candidates_by_id[node_id] = normalized_node

    if not candidates_by_id:
        return []

    patterns = [re.compile(re.escape(kw), re.IGNORECASE) for kw in capped_keywords]
    scored: list[tuple[int, str, dict[str, Any]]] = []
    for node_id, node in candidates_by_id.items():
        searchable = _node_searchable_text(node)
        score = sum(1 for pattern in patterns if pattern.search(searchable))
        if score > 0:
            scored.append((score, node_id, node))

    scored.sort(
        key=lambda item: (
            -item[0],
            _clean_text(item[2].get("name")).lower(),
            _clean_text(item[2].get("ifcType")).lower(),
            item[1],
        )
    )
    return [node for _score, _node_id, node in scored[:limit]]


def _build_graph_context(job_id: str, question: str) -> str:
    """Build prompt context from graph-store query results."""
    store = get_graph_store()
    summary = store.get_stats(job_id)
    keywords = _extract_keywords(question)
    matched_nodes = _keyword_search_nodes(job_id, keywords, limit=_MATCH_LIMIT)

    top_node_edges: list[dict[str, Any]] = []
    name_map: dict[str, str] = {}
    for node in matched_nodes[:_TOP_MATCHES_FOR_EDGES]:
        node_id = node["id"]
        result = store.get_neighbors(job_id, node_id)
        for neighbor_node in result.get("nodes") or []:
            neighbor_id = _clean_text(neighbor_node.get("id")) or _clean_text(neighbor_node.get("globalId"))
            if not neighbor_id:
                continue
            display_name = (
                _clean_text(neighbor_node.get("name"))
                or _clean_text(neighbor_node.get("ifcType"))
                or neighbor_id
            )
            name_map[neighbor_id] = display_name
        for edge in result.get("edges") or []:
            source = _clean_text(edge.get("source"))
            target = _clean_text(edge.get("target"))
            edge_type = _clean_text(edge.get("type")) or "RELATED_TO"
            if source and target:
                top_node_edges.append({"source": source, "target": target, "type": edge_type})

    for node in matched_nodes:
        display_name = _clean_text(node.get("name")) or _clean_text(node.get("ifcType")) or node["id"]
        name_map[node["id"]] = display_name

    seen_edges: set[tuple[str, str, str]] = set()
    deduped_edges: list[dict[str, Any]] = []
    for edge in top_node_edges:
        key = (edge["source"], edge["target"], edge["type"])
        if key in seen_edges:
            continue
        seen_edges.add(key)
        deduped_edges.append(edge)

    parts: list[str] = []
    parts.append("=== BIM MODEL GRAPH SUMMARY ===")
    parts.append(f"Nodes: {summary['node_count']}, Edges: {summary['edge_count']}")
    parts.append(f"Node types: {json.dumps(summary['node_types'])}")
    parts.append(f"Edge types: {json.dumps(summary['edge_types'])}")
    parts.append(f"Storeys: {', '.join(summary['storeys']) or 'none'}")
    parts.append(f"Materials: {', '.join((summary.get('materials') or [])[:40]) or 'none'}")

    if matched_nodes:
        parts.append("")
        parts.append(f"=== MATCHED NODES (keywords: {', '.join(keywords[:_MAX_KEYWORDS])}) ===")
        for node in matched_nodes:
            line = (
                f"- {node['name'] or '(unnamed)'} | type={node['ifcType']} "
                f"| storey={node['storey'] or '?'} | id={node['id']}"
            )
            if node.get("materials"):
                line += f" | materials={', '.join(node['materials'])}"
            parts.append(line)

    if deduped_edges:
        parts.append("")
        parts.append("=== RELATIONSHIPS (for top matched nodes) ===")
        for edge in deduped_edges[:_EDGE_LIMIT]:
            src_name = name_map.get(edge["source"], edge["source"])
            tgt_name = name_map.get(edge["target"], edge["target"])
            parts.append(f"- {src_name} --[{edge['type']}]--> {tgt_name}")

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
    job_id: str,
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Send a chat completion request to OpenRouter with graph-store context.

    Parameters
    ----------
    job_id : str
        Job identifier used to run graph store queries.
    messages : list[dict]
        Chat history in OpenAI format: [{role, content}, ...].
        The last message should be the user's new question.

    Returns
    -------
    dict with keys:
        answer (str): The LLM response text.
        referenced_ids (list[str]): globalIds mentioned in the answer and found in graph store.
        reasoning (str | None): Reasoning details if available.
    """
    if not OPENROUTER_API_KEY:
        return {
            "answer": "LLM is not configured. Set OPENROUTER_API_KEY in environment.",
            "referenced_ids": [],
            "reasoning": None,
        }

    latest_question = ""
    for message in reversed(messages):
        if message.get("role") == "user":
            latest_question = message.get("content", "")
            break

    graph_context = _build_graph_context(job_id, latest_question)
    system_message = {
        "role": "system",
        "content": f"{SYSTEM_PROMPT}\n\n{graph_context}",
    }

    request_messages = [system_message] + [
        {"role": message["role"], "content": message["content"]}
        for message in messages
        if message.get("role") in ("user", "assistant") and message.get("content")
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

    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})
    answer = message.get("content") or ""
    reasoning_raw = message.get("reasoning_details") or message.get("reasoning") or None

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

    referenced_ids = _extract_referenced_ids(answer, job_id)
    return {
        "answer": answer,
        "referenced_ids": referenced_ids,
        "reasoning": reasoning,
    }


def _extract_referenced_ids(text: str, job_id: str) -> list[str]:
    """Extract node ids/globalIds from answer and keep only ids present in graph store."""
    candidates = re.findall(r"\b([0-9A-Za-z_$]{22})\b", text)
    prefixed = re.findall(r"\b((?:mat|sys):[^\s\)]+)", text)
    all_candidates = list(dict.fromkeys(candidates + prefixed))
    if not all_candidates:
        return []

    store = get_graph_store()
    try:
        existing = store.get_existing_node_ids(job_id, all_candidates)
    except Exception:
        existing = []
    return list(dict.fromkeys(existing))
