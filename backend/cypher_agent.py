"""
Text-to-Cypher agent for BIM graph queries.

Two-step pipeline:
  1. Generate Cypher from a natural-language question using the LLM.
  2. Execute the Cypher against Neo4j via the existing driver.
  3. (Optional) Repair & retry on syntax errors or empty results.
  4. Synthesise a natural-language answer from the query results.

Falls back to ``None`` so the caller can use the keyword-search path.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from config import (
    GRAPH_BACKEND,
    NEO4J_DATABASE,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
)
from neo4j_client import get_neo4j_driver
from graph_store import get_graph_store

logger = logging.getLogger(__name__)

_MAX_RETRIES = 2
_CYPHER_RESULT_LIMIT = 60

# Known BIM_REL .type values that LLMs commonly emit as relationship labels
_KNOWN_REL_TYPES = {
    "CONTAINED_IN", "DECOMPOSES", "HAS_MATERIAL", "BOUNDED_BY",
    "FEEDS", "SERVES", "IN_SYSTEM",
}

# ---------------------------------------------------------------------------
# Schema description (built dynamically per-job)
# ---------------------------------------------------------------------------

_STATIC_SCHEMA = """\
NODE LABELS:
  :BIMNode — Building elements, spaces, storeys, materials, systems.
    Properties: job_id, id, globalId, label, ifcType, name, storey, materials[]
  :BIMProp — IFC property-set values attached to elements.
    Properties: job_id, id, psetName, propName, value, valueType, parentId

RELATIONSHIP TYPES:
  (:BIMNode)-[:BIM_REL {type}]->(:BIMNode)
    type values: CONTAINED_IN, DECOMPOSES, HAS_MATERIAL, BOUNDED_BY,
                 FEEDS, SERVES, IN_SYSTEM
  (:BIMNode)-[:HAS_PROP]->(:BIMProp)

IMPORTANT RULES:
  - ALWAYS filter by job_id = $job_id on every node and relationship.
  - Use toLower() for case-insensitive string matching.
  - For relationship type filtering use r.type (it is a property on :BIM_REL).
  - LIMIT results to {limit} unless user explicitly asks for a count.
  - Return globalId, name, ifcType for element results.
  - For property queries, traverse (:BIMNode)-[:HAS_PROP]->(:BIMProp).
  - Do NOT use relationship type names as Neo4j relationship labels —
    they are all stored as :BIM_REL with a .type property, EXCEPT :HAS_PROP
    which is its own relationship label.
  - Always use $job_id as a parameter, never hard-code the job id value.\
"""


def _build_schema_prompt(job_id: str) -> str:
    """Build the schema section including live stats for the current model."""
    store = get_graph_store()
    try:
        stats = store.get_stats(job_id)
    except Exception:
        stats = {}

    lines = [_STATIC_SCHEMA.replace("{limit}", str(_CYPHER_RESULT_LIMIT))]

    storeys = stats.get("storeys") or []
    if storeys:
        lines.append(f"\nAVAILABLE STOREYS: {', '.join(storeys)}")

    node_types = stats.get("node_types") or {}
    if node_types:
        types_str = ", ".join(f"{k} ({v})" for k, v in list(node_types.items())[:30])
        lines.append(f"NODE ifcType DISTRIBUTION: {types_str}")

    materials = stats.get("materials") or []
    if materials:
        lines.append(f"MATERIALS (sample): {', '.join(materials[:25])}")

    # Property name sample from property_stats if available
    try:
        prop_stats_method = getattr(store, "get_property_stats", None)
        if prop_stats_method:
            prop_stats = prop_stats_method(job_id)
            pset_names = list((prop_stats.get("pset_counts") or {}).keys())[:15]
            prop_names = list((prop_stats.get("property_name_counts") or {}).keys())[:20]
            if pset_names:
                lines.append(f"PROPERTY SET NAMES (sample): {', '.join(pset_names)}")
            if prop_names:
                lines.append(f"PROPERTY NAMES (sample): {', '.join(prop_names)}")
    except Exception:
        pass

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Few-shot examples
# ---------------------------------------------------------------------------

_FEW_SHOT_EXAMPLES = """\
Q: How many walls are in the model?
Cypher:
MATCH (n:BIMNode {job_id: $job_id})
WHERE toLower(n.ifcType) = 'ifcwall'
RETURN count(n) AS wall_count

Q: List all doors on the ground floor.
Cypher:
MATCH (n:BIMNode {job_id: $job_id})
WHERE toLower(n.ifcType) = 'ifcdoor'
  AND toLower(coalesce(n.storey, '')) CONTAINS 'ground'
RETURN n.globalId AS globalId, n.name AS name, n.storey AS storey
LIMIT 50

Q: What materials does wall "W1" use?
Cypher:
MATCH (n:BIMNode {job_id: $job_id})-[r:BIM_REL {job_id: $job_id}]->(m:BIMNode {job_id: $job_id})
WHERE toLower(n.name) CONTAINS 'w1'
  AND r.type = 'HAS_MATERIAL'
RETURN n.name AS element, m.name AS material

Q: What is the thermal transmittance of wall "W1"?
Cypher:
MATCH (n:BIMNode {job_id: $job_id})-[:HAS_PROP]->(p:BIMProp {job_id: $job_id})
WHERE toLower(n.name) CONTAINS 'w1'
  AND toLower(p.propName) CONTAINS 'thermaltransmittance'
RETURN n.name AS element, p.psetName AS pset, p.propName AS property, p.value AS value

Q: Which spaces are served by equipment "AHU-01"?
Cypher:
MATCH (eq:BIMNode {job_id: $job_id})-[r1:BIM_REL {job_id: $job_id}]->(t:BIMNode {job_id: $job_id})-[r2:BIM_REL {job_id: $job_id}]->(sp:BIMNode {job_id: $job_id})
WHERE toLower(eq.name) CONTAINS 'ahu-01'
  AND r1.type = 'FEEDS'
  AND r2.type = 'SERVES'
RETURN sp.globalId AS globalId, sp.name AS space_name, sp.storey AS storey

Q: Show all properties of element "Basic Wall:Generic - 200mm".
Cypher:
MATCH (n:BIMNode {job_id: $job_id})-[:HAS_PROP]->(p:BIMProp {job_id: $job_id})
WHERE toLower(n.name) CONTAINS 'generic - 200mm'
RETURN p.psetName AS pset, p.propName AS property, p.value AS value, p.valueType AS type
ORDER BY p.psetName, p.propName
LIMIT 60

Q: How many elements are on each storey?
Cypher:
MATCH (n:BIMNode {job_id: $job_id})
WHERE n.storey IS NOT NULL
  AND NOT n.ifcType IN ['Material', 'IfcSystem', 'Property']
RETURN n.storey AS storey, count(n) AS element_count
ORDER BY element_count DESC

Q: Find all elements that contain the material "concrete".
Cypher:
MATCH (n:BIMNode {job_id: $job_id})-[r:BIM_REL {job_id: $job_id}]->(m:BIMNode {job_id: $job_id})
WHERE r.type = 'HAS_MATERIAL'
  AND toLower(m.name) CONTAINS 'concrete'
RETURN n.globalId AS globalId, n.name AS name, n.ifcType AS type, m.name AS material
LIMIT 50
"""


# ---------------------------------------------------------------------------
# LLM helper (shared thin wrapper)
# ---------------------------------------------------------------------------

async def _llm_call(system: str, user: str) -> str | None:
    """Single-shot LLM call via OpenRouter. Returns content or None."""
    if not OPENROUTER_API_KEY:
        return None
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(OPENROUTER_BASE_URL, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        return content.strip()
    except Exception as exc:
        logger.warning("Cypher agent LLM call failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Step A — Generate Cypher
# ---------------------------------------------------------------------------

_CYPHER_SYSTEM_TEMPLATE = """\
You are a Cypher query generator for a BIM (Building Information Model) \
knowledge graph stored in Neo4j.

{schema}

EXAMPLES:
{examples}

INSTRUCTIONS:
- Output ONLY a single valid Cypher query — no explanation, no markdown fences.
- Use $job_id as a parameter everywhere job_id is needed.
- Never hard-code a job_id value.
- If the question cannot be answered with the schema, output: NO_QUERY
"""


def _extract_cypher(raw: str) -> str | None:
    """Pull a Cypher statement out of the LLM response."""
    text = raw.strip()
    if not text or text.upper() == "NO_QUERY":
        return None

    # Strip markdown code fences if present
    fence_match = re.search(r"```(?:cypher)?\s*\n?(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()

    # Basic sanity — must contain MATCH or RETURN
    upper = text.upper()
    if "MATCH" not in upper and "RETURN" not in upper and "CALL" not in upper:
        return None

    return text


async def generate_cypher(job_id: str, question: str) -> str | None:
    """Ask the LLM to produce a Cypher query for *question*."""
    schema = _build_schema_prompt(job_id)
    system = _CYPHER_SYSTEM_TEMPLATE.format(schema=schema, examples=_FEW_SHOT_EXAMPLES)
    raw = await _llm_call(system, question)
    if not raw:
        return None
    cypher = _extract_cypher(raw)
    if cypher:
        cypher = _sanitize_cypher(cypher)
    return cypher


# ---------------------------------------------------------------------------
# Pre-execution auto-correction
# ---------------------------------------------------------------------------

def _sanitize_cypher(cypher: str) -> str:
    """Fix common LLM mistakes in generated Cypher without an LLM round-trip.

    Fixes applied:
    1. Relationship-type-as-label: ``[:CONTAINED_IN]`` → ``[:BIM_REL {type: 'CONTAINED_IN'}]``
    2. Missing ``job_id`` on :BIM_REL — injects ``{job_id: $job_id}`` if absent.
    3. Strip LIMIT from count-only queries (avoids misleading counts).
    """
    fixed = cypher

    # 1. Fix relationship labels that should be :BIM_REL {type: '...'}
    for rel_type in _KNOWN_REL_TYPES:
        # Pattern: -[:CONTAINED_IN]-> or -[r:CONTAINED_IN]->
        # Replace with: -[:BIM_REL {type: 'CONTAINED_IN'}]-> or -[r:BIM_REL {type: 'CONTAINED_IN'}]->
        pattern = re.compile(
            r"\[(" + r"[a-zA-Z_]\w*" + r")?" + r"\s*:\s*" + re.escape(rel_type) + r"\s*\]",
            re.IGNORECASE,
        )
        def _rel_replacer(m: re.Match, _rt: str = rel_type) -> str:
            alias = m.group(1) or ""
            alias_prefix = f"{alias}:" if alias else ":"
            return f"[{alias_prefix}BIM_REL {{type: '{_rt}', job_id: $job_id}}]"
        fixed = pattern.sub(_rel_replacer, fixed)

    # 2. Inject job_id on bare :BIM_REL that lacks it
    fixed = re.sub(
        r"\[([a-zA-Z_]\w*)?\s*:\s*BIM_REL\s*\]",
        lambda m: f"[{m.group(1) + ':' if m.group(1) else ':'}BIM_REL {{job_id: $job_id}}]",
        fixed,
    )

    # 3. Strip LIMIT on pure count queries
    if re.search(r"RETURN\s+count\s*\(", fixed, re.IGNORECASE) and not re.search(
        r"RETURN.*,", fixed, re.IGNORECASE
    ):
        fixed = re.sub(r"\bLIMIT\s+\d+\s*$", "", fixed, flags=re.IGNORECASE).rstrip()

    if fixed != cypher:
        logger.info("Cypher sanitized: %s → %s", cypher[:120], fixed[:120])

    return fixed


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

def _validate_cypher_labels(job_id: str, cypher: str) -> list[str]:
    """Check that node labels and property names in the Cypher exist in the schema.

    Returns a list of warning strings (empty = all good).
    """
    warnings: list[str] = []
    upper = cypher.upper()

    # Check node labels — only :BIMNode, :BIMProp are valid
    label_matches = re.findall(r":\s*([A-Z][A-Za-z]+)\b", cypher)
    valid_labels = {"BIMNode", "BIMProp", "BIM_REL", "HAS_PROP"}
    for label in label_matches:
        if label not in valid_labels and label.upper() not in {"BIMNODE", "BIMPROP", "BIM_REL", "HAS_PROP"}:
            warnings.append(f"Unknown label :{label} — valid labels are :BIMNode and :BIMProp")

    # Check that $job_id appears (required for scoping)
    if "$job_id" not in cypher and "$JOB_ID" not in upper:
        warnings.append("Missing $job_id parameter — all queries must be scoped by job_id")

    return warnings


# ---------------------------------------------------------------------------
# Step B — Execute Cypher safely
# ---------------------------------------------------------------------------

def _execute_cypher(job_id: str, cypher: str) -> list[dict[str, Any]]:
    """Run a read-only Cypher query scoped to *job_id*. Returns rows as dicts."""
    if GRAPH_BACKEND != "neo4j":
        return []

    driver = get_neo4j_driver()
    if not driver:
        return []

    # Safety: reject obviously dangerous statements
    upper = cypher.upper()
    for keyword in ("DELETE", "DETACH", "CREATE", "MERGE", "SET ", "REMOVE"):
        if keyword in upper:
            logger.warning("Cypher agent rejected mutating query: %s", cypher[:200])
            return []

    try:
        with driver.session(database=NEO4J_DATABASE) as session:
            result = session.run(cypher, job_id=job_id)
            rows = [record.data() for record in result]
        return rows[:_CYPHER_RESULT_LIMIT]
    except Exception as exc:
        logger.warning("Cypher execution error: %s — query: %s", exc, cypher[:300])
        raise


# ---------------------------------------------------------------------------
# Step C — Repair
# ---------------------------------------------------------------------------

_REPAIR_SYSTEM = """\
You are a Cypher query repair assistant. The previous query failed or \
returned no results. Fix the query based on the error and schema.

{schema}

COMMON MISTAKES TO FIX:
- Using relationship type names (CONTAINED_IN, HAS_MATERIAL, etc.) as Neo4j \
relationship labels — they MUST be :BIM_REL with a .type property instead.
- Missing job_id filter on nodes or relationships.
- Wrong property names — check against the valid property names listed above.
- Case sensitivity — use toLower() for string comparisons.
- Missing LIMIT on queries that return many rows.

{hints}

RULES:
- Output ONLY the corrected Cypher query, nothing else.
- Use $job_id as a parameter.
- If the query cannot be fixed, output: NO_QUERY
"""


def _build_repair_hints(job_id: str, failed_cypher: str) -> str:
    """Build targeted hints about what might be wrong."""
    hints: list[str] = []

    # Detect relationship-type-as-label mistake
    for rel_type in _KNOWN_REL_TYPES:
        pattern = re.compile(r"\[\w*:\s*" + re.escape(rel_type) + r"\s*\]", re.IGNORECASE)
        if pattern.search(failed_cypher):
            hints.append(
                f"HINT: You used [:{rel_type}] as a relationship label. "
                f"Use [:BIM_REL {{type: '{rel_type}', job_id: $job_id}}] instead."
            )

    # Check for unknown labels
    label_warnings = _validate_cypher_labels(job_id, failed_cypher)
    for w in label_warnings:
        hints.append(f"HINT: {w}")

    return "\n".join(hints) if hints else "No specific hints."


async def _repair_cypher(
    job_id: str,
    question: str,
    failed_cypher: str,
    error: str,
) -> str | None:
    """Ask the LLM to fix a broken Cypher query with schema-enriched hints."""
    schema = _build_schema_prompt(job_id)
    hints = _build_repair_hints(job_id, failed_cypher)
    system = _REPAIR_SYSTEM.format(schema=schema, hints=hints)
    user_msg = (
        f"Original question: {question}\n\n"
        f"Failed Cypher:\n{failed_cypher}\n\n"
        f"Error: {error}\n\n"
        "Please output the corrected Cypher query."
    )
    raw = await _llm_call(system, user_msg)
    if not raw:
        return None
    repaired = _extract_cypher(raw)
    if repaired:
        repaired = _sanitize_cypher(repaired)
    return repaired


# ---------------------------------------------------------------------------
# Step D — Synthesise answer
# ---------------------------------------------------------------------------

_ANSWER_SYSTEM = """\
You are a BIM (Building Information Modeling) assistant. You have just \
executed a Cypher query against a building model's knowledge graph and \
received the results below.

Compose a clear, concise natural-language answer for the user.
- Reference element names and globalIds when available.
- If the results are empty, say you could not find matching data.
- Include globalIds in parentheses so users can locate elements in the 3D viewer.
- When discussing properties, mention the property set and property name.\
"""


async def _synthesise_answer(
    question: str,
    cypher: str,
    rows: list[dict[str, Any]],
) -> str:
    """Produce a human answer from Cypher results."""
    results_text = json.dumps(rows[:_CYPHER_RESULT_LIMIT], indent=2, default=str)
    user_msg = (
        f"User question: {question}\n\n"
        f"Cypher query executed:\n{cypher}\n\n"
        f"Query results ({len(rows)} rows):\n{results_text}"
    )
    answer = await _llm_call(_ANSWER_SYSTEM, user_msg)
    return answer or "(No answer could be generated from the query results.)"


# ---------------------------------------------------------------------------
# Public API — query with retry
# ---------------------------------------------------------------------------

async def cypher_query_with_retry(
    job_id: str,
    question: str,
) -> dict[str, Any] | None:
    """
    End-to-end: question → Cypher → execute → (repair loop) → answer.

    Returns a dict with ``answer``, ``referenced_ids``, ``reasoning``,
    ``cypher`` — or ``None`` if the pipeline cannot handle the question
    (so the caller should fall back to keyword search).
    """
    if GRAPH_BACKEND != "neo4j":
        return None

    cypher = await generate_cypher(job_id, question)
    if not cypher:
        return None

    # --- Structured attempt tracking ---
    attempts: list[dict[str, str]] = []
    rows: list[dict[str, Any]] = []
    last_error: str = ""
    final_cypher = cypher

    # Pre-execution schema validation warnings
    schema_warnings = _validate_cypher_labels(job_id, cypher)
    if schema_warnings:
        logger.info("Schema warnings for generated Cypher: %s", schema_warnings)

    for attempt in range(_MAX_RETRIES + 1):
        attempt_info: dict[str, str] = {"attempt": str(attempt + 1), "cypher": final_cypher}
        try:
            rows = _execute_cypher(job_id, final_cypher)
            if rows:
                attempt_info["status"] = f"success ({len(rows)} rows)"
                attempts.append(attempt_info)
                break
            last_error = "Query returned 0 rows."
            attempt_info["status"] = "empty"
        except Exception as exc:
            last_error = str(exc)
            attempt_info["status"] = f"error: {last_error[:200]}"

        attempts.append(attempt_info)

        if attempt < _MAX_RETRIES:
            repaired = await _repair_cypher(job_id, question, final_cypher, last_error)
            if repaired and repaired != final_cypher:
                logger.info(
                    "Cypher repair attempt %d: %s → %s",
                    attempt + 1,
                    final_cypher[:120],
                    repaired[:120],
                )
                final_cypher = repaired
            else:
                break  # No useful repair, stop retrying

    answer = await _synthesise_answer(question, final_cypher, rows)

    # Extract globalIds from the result rows
    referenced_ids = _extract_ids_from_rows(rows, job_id)

    # Build reasoning with full attempt chain
    reasoning = _build_reasoning(attempts, schema_warnings)

    return {
        "answer": answer,
        "referenced_ids": referenced_ids,
        "reasoning": reasoning,
        "cypher": final_cypher,
    }


def _build_reasoning(attempts: list[dict[str, str]], warnings: list[str]) -> str:
    """Format the attempt chain into a human-readable reasoning string."""
    parts: list[str] = []

    if warnings:
        parts.append("Schema warnings: " + "; ".join(warnings))

    for att in attempts:
        num = att["attempt"]
        status = att.get("status", "unknown")
        cypher = att["cypher"]
        if len(attempts) == 1 and status.startswith("success"):
            parts.append(f"Cypher: {cypher}")
        else:
            parts.append(f"Attempt {num} [{status}]: {cypher}")

    return "\n".join(parts)


def _extract_ids_from_rows(rows: list[dict[str, Any]], job_id: str) -> list[str]:
    """Pull globalId values from query result rows."""
    candidates: list[str] = []
    for row in rows:
        for key, value in row.items():
            if not isinstance(value, str):
                continue
            # IFC GlobalIds are 22-char base-64 strings
            if re.fullmatch(r"[0-9A-Za-z_$]{22}", value):
                candidates.append(value)

    if not candidates:
        return []

    # Validate against the graph store
    unique = list(dict.fromkeys(candidates))
    store = get_graph_store()
    try:
        return store.get_existing_node_ids(job_id, unique)
    except Exception:
        return unique[:20]
