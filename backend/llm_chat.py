"""
LLM-powered BIM chat using graph-store queries as context source.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from config import GRAPH_BACKEND, OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL
from cypher_agent import cypher_query_with_retry
from graph_models import GraphQuery
from graph_store import get_graph_store
from utils import clean_text as _clean_text

logger = logging.getLogger(__name__)

_MAX_KEYWORDS = 8
_MATCH_LIMIT = 30
_TOP_MATCHES_FOR_EDGES = 5
_TOP_MATCHES_FOR_PROPS = 5
_MAX_PROPS_PER_NODE = 20
_EDGE_LIMIT = 40

_SPACE_TARGET_STOP_WORDS = {
    "the", "a", "an", "room", "space", "in", "on", "at", "to", "for",
    "connected", "air", "terminal", "terminals", "how", "many", "what",
    "is", "are", "of",
}


def _is_cobie_hru_question(question: str) -> bool:
    text = _clean_text(question).lower()
    if "cobie" not in text:
        return False
    return any(
        token in text
        for token in ("hru", "heat recovery unit", "heatrecoveryunit")
    )


def _has_non_empty_cobie_value(value: Any) -> bool:
    if value is None:
        return False
    return _clean_text(value) != ""


def _answer_cobie_hru_question(job_id: str, question: str) -> dict[str, Any] | None:
    """Deterministic answer path for COBie-on-HRU questions."""
    if not _is_cobie_hru_question(question):
        return None

    store = get_graph_store()
    prop_method = getattr(store, "get_element_properties", None)
    if not prop_method:
        return None

    hru_nodes_by_id: dict[str, dict[str, Any]] = {}
    for keyword in ("HeatRecoveryUnit", "Heat Recovery Unit", "HRU"):
        try:
            result = store.query(job_id, GraphQuery(name_contains=keyword, limit=500, offset=0))
        except Exception:
            continue
        for node in result.get("nodes") or []:
            node_id = _clean_text(node.get("id")) or _clean_text(node.get("globalId"))
            if not node_id:
                continue
            hru_nodes_by_id[node_id] = {
                "id": node_id,
                "name": node.get("name") or "(unnamed)",
                "ifcType": node.get("ifcType") or "",
            }

    if not hru_nodes_by_id:
        return {
            "answer": "No HRU elements were found in the current model.",
            "referenced_ids": [],
            "reasoning": "Deterministic COBie check executed for HRU query.",
        }

    matched: list[dict[str, Any]] = []
    for node in hru_nodes_by_id.values():
        try:
            props = prop_method(job_id, node["id"])
        except Exception:
            props = []
        cobie_props = [
            prop
            for prop in props
            if _clean_text(prop.get("propName", "")).startswith("COBie.")
            and _has_non_empty_cobie_value(prop.get("value"))
        ]
        if cobie_props:
            mark_value = ""
            for prop in props:
                if _clean_text(prop.get("psetName")) == "Identity Data" and _clean_text(prop.get("propName")) == "Mark":
                    mark_value = _clean_text(prop.get("value"))
                    break
            matched.append(
                {
                    "id": node["id"],
                    "name": node["name"],
                    "mark": mark_value,
                }
            )

    matched.sort(key=lambda item: (_clean_text(item["mark"]).lower(), _clean_text(item["name"]).lower(), item["id"]))
    total_hrus = len(hru_nodes_by_id)

    if not matched:
        answer = (
            f"No HRUs with non-empty COBie.* parameters were found. "
            f"HRUs checked: {total_hrus}."
        )
        return {
            "answer": answer,
            "referenced_ids": [],
            "reasoning": "Deterministic COBie check executed for HRU query.",
        }

    lines = [
        f"{len(matched)} of {total_hrus} HRUs have at least one non-empty COBie.* parameter:",
    ]
    for item in matched:
        mark_text = f" | Mark={item['mark']}" if item["mark"] else ""
        lines.append(f"- {item['name']} ({item['id']}){mark_text}")

    return {
        "answer": "\n".join(lines),
        "referenced_ids": [item["id"] for item in matched],
        "reasoning": "Deterministic COBie check executed for HRU query.",
    }


def _is_air_terminal_space_question(question: str) -> bool:
    text = _clean_text(question).lower()
    has_air_terminal = ("air terminal" in text) or ("ifcairterminal" in text)
    if not has_air_terminal:
        return False
    return any(token in text for token in ("connected to", " in ", " room ", " space ", "serve", "serving"))


def _extract_space_target_phrase(question: str) -> str:
    text = _clean_text(question)
    patterns = (
        r"\bconnected to(?:\s+the)?\s+([^?.!,;]+)",
        r"\bin(?:\s+the)?\s+(?:room|space)?\s*([^?.!,;]+)",
        r"\bserving(?:\s+the)?\s+(?:room|space)?\s*([^?.!,;]+)",
        r"\bfor(?:\s+the)?\s+(?:room|space)?\s*([^?.!,;]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        candidate = _clean_text(match.group(1))
        candidate = re.sub(r"^(the|room|space)\s+", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s+", " ", candidate).strip(" .,:;")
        if candidate:
            return candidate
    return ""


def _space_searchable_text(space_node: dict[str, Any], props: list[dict[str, Any]]) -> str:
    values = [_clean_text(space_node.get("name"))]
    for prop in props:
        pset = _clean_text(prop.get("psetName"))
        prop_name = _clean_text(prop.get("propName"))
        value = _clean_text(prop.get("value"))
        if not value:
            continue
        if pset == "Identity Data" and prop_name in {"Name", "Room Name", "Number", "Room Number"}:
            values.append(value)
        if pset == "Pset_SpaceCommon" and prop_name in {"Reference"}:
            values.append(value)
    return " ".join(v for v in values if v)


def _space_matches_target(searchable_text: str, target_phrase: str) -> bool:
    searchable = searchable_text.lower()
    target_tokens = [
        token
        for token in re.findall(r"[A-Za-z0-9]+", target_phrase.lower())
        if token not in _SPACE_TARGET_STOP_WORDS
    ]
    if not target_tokens:
        return False
    return all(token in searchable for token in target_tokens)


def _collect_air_terminals_for_space(job_id: str, space_id: str) -> list[dict[str, str]]:
    store = get_graph_store()
    try:
        neighborhood = store.get_neighbors(job_id, space_id)
    except Exception:
        return []

    nodes_by_id: dict[str, dict[str, Any]] = {}
    for node in neighborhood.get("nodes") or []:
        node_id = _clean_text(node.get("id")) or _clean_text(node.get("globalId"))
        if node_id:
            nodes_by_id[node_id] = node

    terminals_by_id: dict[str, dict[str, str]] = {}
    for edge in neighborhood.get("edges") or []:
        edge_type = _clean_text(edge.get("type"))
        if edge_type not in {"CONTAINED_IN", "SERVES"}:
            continue
        source = _clean_text(edge.get("source"))
        target = _clean_text(edge.get("target"))
        candidate = ""
        if source == space_id and target:
            candidate = target
        elif target == space_id and source:
            candidate = source
        if not candidate:
            continue
        node = nodes_by_id.get(candidate) or {}
        if _clean_text(node.get("ifcType")) != "IfcAirTerminal":
            continue
        terminals_by_id[candidate] = {
            "id": candidate,
            "name": _clean_text(node.get("name")) or "(unnamed)",
        }

    terminals = list(terminals_by_id.values())
    terminals.sort(key=lambda item: (_clean_text(item["name"]).lower(), item["id"]))
    return terminals


def _answer_air_terminals_for_space_question(job_id: str, question: str) -> dict[str, Any] | None:
    if not _is_air_terminal_space_question(question):
        return None

    target_phrase = _extract_space_target_phrase(question)
    if not target_phrase:
        return None

    store = get_graph_store()
    prop_method = getattr(store, "get_element_properties", None)
    if not prop_method:
        return None

    try:
        result = store.query(job_id, GraphQuery(node_type="IfcSpace", limit=500, offset=0))
    except Exception:
        return None

    matched_spaces: list[dict[str, Any]] = []
    for node in result.get("nodes") or []:
        space_id = _clean_text(node.get("id")) or _clean_text(node.get("globalId"))
        if not space_id:
            continue
        try:
            props = prop_method(job_id, space_id)
        except Exception:
            props = []
        searchable = _space_searchable_text(node, props)
        if _space_matches_target(searchable, target_phrase):
            matched_spaces.append(
                {
                    "id": space_id,
                    "name": _clean_text(node.get("name")) or "(unnamed)",
                    "searchable": searchable,
                }
            )

    if not matched_spaces:
        return {
            "answer": f"No space matched '{target_phrase}' in the model.",
            "referenced_ids": [],
            "reasoning": "Deterministic air-terminal-by-space check executed.",
        }

    terminal_by_id: dict[str, dict[str, str]] = {}
    per_space: list[dict[str, Any]] = []
    for space in matched_spaces:
        terminals = _collect_air_terminals_for_space(job_id, space["id"])
        for terminal in terminals:
            terminal_by_id[terminal["id"]] = terminal
        per_space.append(
            {
                "space_id": space["id"],
                "space_name": space["name"],
                "terminals": terminals,
            }
        )

    unique_terminals = list(terminal_by_id.values())
    unique_terminals.sort(key=lambda item: (_clean_text(item["name"]).lower(), item["id"]))

    count_intent = bool(re.search(r"\b(how many|count|number of)\b", question, flags=re.IGNORECASE))
    lines: list[str] = []
    if count_intent:
        lines.append(f"{len(unique_terminals)} air terminals are connected to '{target_phrase}'.")
    else:
        lines.append(f"Air terminals connected to '{target_phrase}': {len(unique_terminals)}")

    for group in per_space:
        lines.append(
            f"- Space {group['space_name']} ({group['space_id']}): {len(group['terminals'])} terminal(s)"
        )

    if unique_terminals:
        lines.append("Terminals:")
        for terminal in unique_terminals[:40]:
            lines.append(f"- {terminal['name']} ({terminal['id']})")
        if len(unique_terminals) > 40:
            lines.append(f"- ... and {len(unique_terminals) - 40} more")

    return {
        "answer": "\n".join(lines),
        "referenced_ids": [item["id"] for item in unique_terminals],
        "reasoning": "Deterministic air-terminal-by-space check executed (space properties + graph relationships).",
    }


def _is_hru_level_count_question(question: str) -> bool:
    text = _clean_text(question).lower()
    if "cobie" in text:
        return False
    has_hru = any(token in text for token in ("hru", "heat recovery unit", "heatrecoveryunit"))
    has_count_intent = any(token in text for token in ("how many", "count", "number of"))
    has_level_intent = "level" in text or bool(re.search(r"\b[LM]\s*\d+\b", text, re.IGNORECASE))
    return has_hru and has_count_intent and has_level_intent


def _extract_target_levels(question: str) -> list[str]:
    targets: list[str] = []

    for match in re.finditer(r"\b(?:level|lvl)\s*(\d+)\b", question, flags=re.IGNORECASE):
        targets.append(f"L{match.group(1)}")

    for match in re.finditer(r"\b(L|M)\s*-?\s*(\d+)\b", question, flags=re.IGNORECASE):
        targets.append(f"{match.group(1).upper()}{match.group(2)}")

    return list(dict.fromkeys(targets))


def _canonical_level(level_value: Any) -> str:
    text = _clean_text(level_value)
    if not text:
        return ""
    upper = text.upper().strip()
    compact = re.sub(r"\s+", "", upper)

    match = re.fullmatch(r"LEVEL(\d+)", compact)
    if match:
        return f"L{match.group(1)}"

    match = re.fullmatch(r"[LM](\d+)", compact)
    if match:
        return f"{compact[0]}{match.group(1)}"

    return upper


def _level_matches_target(level_value: Any, target: str) -> bool:
    canonical = _canonical_level(level_value)
    if not canonical:
        return False
    if canonical == target:
        return True
    return canonical.startswith(f"{target} -") or canonical.startswith(f"{target}-")


def _answer_hru_level_count_question(job_id: str, question: str) -> dict[str, Any] | None:
    if not _is_hru_level_count_question(question):
        return None

    target_levels = _extract_target_levels(question)
    if not target_levels:
        return None

    store = get_graph_store()
    prop_method = getattr(store, "get_element_properties", None)
    if not prop_method:
        return None

    hru_nodes_by_id: dict[str, dict[str, Any]] = {}
    for keyword in ("HeatRecoveryUnit", "Heat Recovery Unit", "HRU"):
        try:
            result = store.query(job_id, GraphQuery(name_contains=keyword, limit=500, offset=0))
        except Exception:
            continue
        for node in result.get("nodes") or []:
            node_id = _clean_text(node.get("id")) or _clean_text(node.get("globalId"))
            if not node_id:
                continue
            hru_nodes_by_id[node_id] = {
                "id": node_id,
                "name": node.get("name") or "(unnamed)",
                "storey": node.get("storey") or "",
            }

    if not hru_nodes_by_id:
        return {
            "answer": "No HRU elements were found in the current model.",
            "referenced_ids": [],
            "reasoning": "Deterministic HRU level count check executed.",
        }

    matched: list[dict[str, Any]] = []
    for node in hru_nodes_by_id.values():
        try:
            props = prop_method(job_id, node["id"])
        except Exception:
            props = []

        level_value = ""
        mark_value = ""
        for prop in props:
            pset = _clean_text(prop.get("psetName"))
            prop_name = _clean_text(prop.get("propName"))
            if pset == "Constraints" and prop_name == "Level" and not level_value:
                level_value = _clean_text(prop.get("value"))
            if pset == "Identity Data" and prop_name == "Mark" and not mark_value:
                mark_value = _clean_text(prop.get("value"))

        if not level_value:
            level_value = _clean_text(node.get("storey"))

        if any(_level_matches_target(level_value, target) for target in target_levels):
            matched.append(
                {
                    "id": node["id"],
                    "name": node["name"],
                    "level": level_value,
                    "mark": mark_value,
                }
            )

    matched.sort(
        key=lambda item: (
            _clean_text(item["level"]).lower(),
            _clean_text(item["mark"]).lower(),
            _clean_text(item["name"]).lower(),
            item["id"],
        )
    )

    target_text = ", ".join(target_levels)
    if not matched:
        return {
            "answer": f"0 HRUs were found on {target_text}.",
            "referenced_ids": [],
            "reasoning": "Deterministic HRU level count check executed (Constraints.Level first, storey fallback).",
        }

    lines = [f"{len(matched)} HRUs were found on {target_text}:"]
    for item in matched:
        mark_text = f" | Mark={item['mark']}" if item["mark"] else ""
        level_text = f" | Level={item['level']}" if item["level"] else ""
        lines.append(f"- {item['name']} ({item['id']}){mark_text}{level_text}")

    return {
        "answer": "\n".join(lines),
        "referenced_ids": [item["id"] for item in matched],
        "reasoning": "Deterministic HRU level count check executed (Constraints.Level first, storey fallback).",
    }


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

    # Property data for top matched nodes
    try:
        prop_method = getattr(store, "get_element_properties", None)
        if prop_method and matched_nodes:
            prop_sections: list[str] = []
            for node in matched_nodes[:_TOP_MATCHES_FOR_PROPS]:
                node_id = node["id"]
                # Skip non-element node ids (materials, systems)
                if node_id.startswith(("mat:", "sys:", "prop:")):
                    continue
                try:
                    props = prop_method(job_id, node_id)
                except Exception:
                    props = []
                if not props:
                    continue
                display_name = name_map.get(node_id, node_id)
                prop_lines = [f"  {display_name} (id={node_id}):"]
                for prop in props[:_MAX_PROPS_PER_NODE]:
                    prop_lines.append(
                        f"    {prop['psetName']}.{prop['propName']} = {prop['value']}"
                    )
                if len(props) > _MAX_PROPS_PER_NODE:
                    prop_lines.append(f"    ... and {len(props) - _MAX_PROPS_PER_NODE} more")
                prop_sections.append("\n".join(prop_lines))
            if prop_sections:
                parts.append("")
                parts.append("=== PROPERTIES (for top matched elements) ===")
                parts.extend(prop_sections)
    except Exception:
        pass  # Non-fatal: properties are supplemental context

    return "\n".join(parts)


SYSTEM_PROMPT = """You are a BIM (Building Information Modeling) assistant for a digital twin application. You help users understand their building model by answering questions about the structure, spaces, materials, systems, and relationships between building elements.

You have access to a graph representation of the IFC building model. The graph contains:
- **Nodes**: Building elements (walls, doors, slabs, columns, etc.), spaces, storeys, materials, and systems.
- **Edges**: Relationships like CONTAINED_IN (element in a space/storey), DECOMPOSES (spatial hierarchy), HAS_MATERIAL, BOUNDED_BY (space boundaries), FEEDS (equipment to terminal), SERVES (terminal to space), IN_SYSTEM, HAS_PROPERTY.
- **Properties**: IFC property sets (psets) and quantity sets attached to elements. These include thermal performance values, dimensions, classification codes, and other technical attributes.

When answering:
1. Use the provided graph context to give accurate, specific answers.
2. Reference specific element names and IDs when relevant.
3. If the data doesn't contain enough information to answer, say so clearly.
4. Keep answers concise but informative.
5. When you mention specific building elements, include their globalId in parentheses so the user can locate them in the 3D viewer.
6. When discussing element properties, reference the property set name and property name (e.g. Pset_WallCommon.ThermalTransmittance)."""


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

    deterministic_terminals = _answer_air_terminals_for_space_question(job_id, latest_question)
    if deterministic_terminals:
        return deterministic_terminals

    deterministic_level = _answer_hru_level_count_question(job_id, latest_question)
    if deterministic_level:
        return deterministic_level

    deterministic = _answer_cobie_hru_question(job_id, latest_question)
    if deterministic:
        return deterministic

    # --- Phase 2: Try Cypher agent first (Neo4j only) ---
    if GRAPH_BACKEND == "neo4j":
        try:
            cypher_result = await cypher_query_with_retry(job_id, latest_question)
            if cypher_result and cypher_result.get("answer"):
                logger.info("Cypher agent answered question for job %s", job_id)
                return cypher_result
        except Exception as exc:
            logger.warning("Cypher agent failed, falling back to keyword path: %s", exc)

    # --- Fallback: keyword-search context path ---
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
