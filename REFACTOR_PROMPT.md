# Production Refactoring Prompt — DigitalTwin

> Paste this into your AI coding agent or use it as a brief for a senior engineer.

---

## Context

You are a senior full-stack engineer tasked with refactoring a **web-based BIM (Building Information Modeling) viewer and embodied-carbon analysis tool** from prototype quality to production-grade code. The stack is **FastAPI (Python)** on the backend and **React + Three.js (Vite)** on the frontend. The app lets users upload `.ifc` files, converts them to GLB/JSON for 3D visualization, and runs domain analyses (embodied carbon, HVAC/FM, graph relationships).

The codebase works — but it was built fast, and it shows. Your job is to refactor it incrementally, keeping the app functional at every step. Prioritize **simplicity, separation of concerns, and eliminating duplication** above all else.

---

## Codebase Audit — What's Wrong

### BACKEND

#### 1. `main.py` is a 928-line monolith
- **Pydantic models** (`ConversionJob`, `UserModelSummary`, `JobStatus`, `JobStage`) are defined inline alongside routes.
- **Background task logic** (`process_ifc_file`, ~130 lines) orchestrates GLB conversion, metadata extraction, hierarchy extraction, graph building, and FM sidecar merging — all in one function that mutates an in-memory `jobs` dict AND writes to the DB simultaneously.
- **URL-building helpers** (`_build_protected_file_url`, `_build_authenticated_file_url`) are nearly identical and the pattern is repeated ~6 times.
- **In-memory job store** (`jobs: dict = {}`) has no persistence across restarts, no eviction, and no multi-process support.
- 5 nested `try/except` blocks in `process_ifc_file` with `print()` logging instead of structured logging.

**Action:** Split into `models.py` (Pydantic schemas), `tasks.py` (background processing), `url_helpers.py` (URL builders). Move the in-memory `jobs` dict to a proper store (Redis or at minimum the existing SQLite DB).

#### 2. `_clean_text()` is copy-pasted in 5 files
Found in: `fm_hvac_core.py`, `fm_api.py`, `graph_builder.py`, `graph_api.py`, and `ifc_metadata_extractor.py` (as `convert_value`).

**Action:** Extract to a single `backend/utils.py` and import everywhere.

#### 3. `_extract_space_identifiers()` is duplicated verbatim (~30 lines)
Exists in both `fm_hvac_core.py` and `fm_api.py`.

**Action:** Move to shared utils.

#### 4. IFC file lookup pattern duplicated
`glob.glob(str(UPLOAD_DIR / f"{job_id}_*.ifc"))` appears in `ec_api.py`, `fm_api.py`, and elsewhere.

**Action:** Single `find_ifc_for_job(job_id)` helper in a shared module.

#### 5. `fm_api.py` is 3 routers jammed into 1 file (625 lines)
- HVAC analysis routes
- Space bounding-box computation (~200 lines of numpy geometry code)
- Occupancy simulation endpoints (~100 lines)
- Contains geometry processing (`_extract_floor_footprint`, `_apply_transform_to_footprint`) that belongs in `domain/geometry.py`.

**Action:** Split into `fm_api.py` (HVAC only), `occupancy_api.py`, and move geometry code to `domain/geometry.py`.

#### 6. `ec_core.py` — god function + CSV column hack
- `compute_ec_from_ifc()` is ~200 lines: loads IFC, loads CSV, merges, applies 3 types of overrides, computes stats, builds response. Should be a pipeline of small functions.
- `load_ec_db()` remaps CSV columns because headers are misaligned: `ec_db["MaterialClass"] = db_raw["MaterialName"]`, etc. **Fix the CSV source file instead.**
- No caching — re-reads CSV and re-opens IFC on every call.

**Action:** Break into `load_ifc_elements()`, `match_materials()`, `apply_overrides()`, `compute_statistics()`. Fix `prac-database.csv` headers. Add result caching to `output/{job_id}/`.

#### 7. `fm_hvac_core.py` — 30 bare `except Exception` blocks
- `_traverse_terminals()` is ~120 lines with 4 different neighbor-discovery methods, each in its own `try/except`.
- `_collect_equipment()` has 3 nearly identical loops with `seen` checks and `_is_terminal` guards.

**Action:** Extract neighbor-discovery strategy into small functions. Replace bare excepts with specific exceptions + logging.

#### 8. `graph_builder.build_graph()` has a bug
- Declares return type `-> dict[str, int]` but **never returns anything**. The caller in `main.py` reads `graph_stats['nodes']` from `None`.

**Action:** Fix the return statement.

#### 9. `db.py` — no connection pooling, no migrations
- `get_db()` creates a new `aiosqlite.connect()` on every call. No pool.
- Schema is a 122-line raw SQL string blob with 7 tables. No migration framework.
- Migration logic, column backfilling, and connection factory all mixed together.
- No repository/data-access layer — callers write raw SQL directly.

**Action:** Add connection pooling (or at minimum a singleton pattern). Consider introducing a thin repository layer so route handlers don't contain SQL. Evaluate adding Alembic for migrations.

#### 10. `print()` logging everywhere — zero structured logging
Every backend file uses `print()` for diagnostics. No log levels, no correlation IDs, no structured output.

**Action:** Replace all `print()` with Python `logging` module. Configure a project-wide logger with JSON output in production.

#### 11. `requirements.txt` — unpinned, missing deps
- All `>=` constraints, no lock file. Builds are not reproducible.
- `numpy` is imported by `fm_api.py` but not listed.
- No dev dependencies (pytest, mypy, ruff, black).

**Action:** Pin versions, add `numpy`, add dev deps section or switch to `pyproject.toml`.

#### 12. Security issues
- CORS `allow_methods=["*"]`, `allow_headers=["*"]` — overly broad.
- File access tokens passed in URL query strings (`?t=`) — appear in server access logs.
- Internal exception types/messages exposed to clients in error responses.
- No rate limiting on any endpoint.

**Action:** Restrict CORS methods to `GET, POST, OPTIONS`. Move tokens to headers. Sanitize error responses. Add basic rate limiting.

---

### FRONTEND

#### 13. `App.jsx` — god component (494 lines, 20+ state variables, 15 hooks)
- `ViewerApp` is the single orchestrator for the entire app.
- Builds a `viewer` prop bag with **23 properties** drilled through `ViewerShell` — classic prop-drilling smell.
- Panel resize logic (~30 lines of raw `mousemove`/`mouseup` DOM events) lives directly in the component body.
- Hooks like `useViewerScene` take 15+ setter functions as arguments.

**Action:** Introduce a `ViewerContext` (React Context) to replace prop drilling. Extract panel resize into a `usePanelResize` hook. Break `ViewerApp` into smaller composed components.

#### 14. No TypeScript, no PropTypes, no type checking
- 31 components, 15 hooks, 7 utility files — all untyped `.jsx`.
- No IDE-level type safety, no contract enforcement between components.

**Action:** Add `tsconfig.json`, start converting new/modified files to `.tsx`. At minimum, add JSDoc types to all hook return values and component props.

#### 15. No testing infrastructure
- Zero test files. No Vitest, no Jest, no React Testing Library config.

**Action:** Add Vitest + React Testing Library. Write tests for hooks first (pure logic, easiest to test), then critical components.

#### 16. No ESLint or Prettier
- No code formatting or linting enforced.

**Action:** Add ESLint (with React plugin) and Prettier configs.

#### 17. Outdated dependencies
- `three@^0.159.0` — current stable is 0.170+.
- `@react-three/fiber` force-pinned to `8.18.0` with `overrides` — indicates a compat hack.

**Action:** Audit and update three.js ecosystem packages together.

---

## Refactoring Plan — Execute in This Order

Each phase should be a **separate PR** that leaves the app fully functional.

### Phase 1: Eliminate Duplication (Low risk, high value)
1. Create `backend/utils.py` — move `_clean_text()`, `_extract_space_identifiers()`, `find_ifc_for_job()`.
2. Update all 5+ files that duplicate these functions to import from `utils.py`.
3. Run the app, verify nothing broke.

### Phase 2: Split the Backend Monoliths
4. Extract Pydantic models from `main.py` → `backend/models.py`.
5. Extract `process_ifc_file()` → `backend/tasks.py`.
6. Extract URL helpers → `backend/url_helpers.py`.
7. Split `fm_api.py` → keep HVAC routes, create `occupancy_api.py`, move geometry to `domain/geometry.py`.
8. Fix `graph_builder.build_graph()` return bug.

### Phase 3: Replace print() with logging
9. Configure `logging` in `main.py` startup.
10. Find-and-replace all `print()` calls across the backend with appropriate log levels.

### Phase 4: Fix Data Layer
11. Fix `prac-database.csv` column headers. Remove the remapping hack in `ec_core.py`.
12. Add connection pooling to `db.py`.
13. Break `ec_core.compute_ec_from_ifc()` into pipeline stages.
14. Add result caching — check `output/{job_id}/ec_results.json` before recomputing.

### Phase 5: Frontend State Management
15. Create `ViewerContext` to replace the 23-prop bag drilling pattern.
16. Extract `usePanelResize` hook from `App.jsx`.
17. Break `ViewerApp` into composed sub-components.

### Phase 6: Tooling & Safety
18. Pin backend dependencies. Add `numpy`. Add dev deps.
19. Add `tsconfig.json` + ESLint + Prettier to frontend.
20. Add Vitest config + first tests for 2-3 critical hooks.
21. Tighten CORS, sanitize error responses, add basic rate limiting.

---

## Rules of Engagement
- **One change at a time.** Each refactor should be small, testable, and reversible.
- **Keep the app running.** After every file move or rename, verify the import chain works.
- **No new features.** This is purely structural improvement.
- **Match existing style.** Inline styles on frontend, pathlib on backend, no new paradigms unless discussed.
- **Document as you go.** Update `ARCHITECTURE.md` when module boundaries change.
