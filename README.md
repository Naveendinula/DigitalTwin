# Digital Twin Platform (BIM + FM)

Web-based Digital Twin platform for BIM visualization, relationship querying, FM operations, and sustainability workflows.

This project combines:
- IFC processing and geometry conversion
- Interactive 3D model navigation
- Graph-powered BIM relationship querying
- HVAC/FM operational analysis
- Work-order management with CMMS sync
- Embodied carbon and occupancy workflows
- Authenticated, job-scoped multi-user access

Documentation:
- Architecture: `ARCHITECTURE.md`
- System map: `SYSTEM_MAP.md`
- Web app notes: `docs/WEB_APP.md`

## Why This Project Matters

Most BIM tools are either authoring-heavy or disconnected from day-to-day facilities operations. This platform is built to bridge that gap:
- **For FM teams:** convert model data into actionable work-order and service-impact workflows.
- **For Digital Twin teams:** query building relationships as a graph (systems, spaces, equipment, materials).
- **For sustainability teams:** quantify embodied carbon at element level with override controls.

## What's New (Recent Additions)

- **Graph Query Layer (Phase 1-5):**
  - Builds a relationship graph per job (`graph.json`) during IFC processing.
  - Syncs graph data into Neo4j and serves graph API/LLM queries from the graph-store backend (Neo4j by default).
  - Graph API endpoints for stats, neighbors, shortest paths, and structured traversal queries.
  - New Graph Query panel with list + optional network visualization (`reagraph`).
- **Work Orders + CMMS Sync:**
  - Geometry-native work order module with CRUD, summary, and COBie-style export (CSV/JSON).
  - CMMS sync settings and push/pull/webhook endpoints (adapter model).
- **Model Reopen + Dedupe:**
  - Reopen previously processed models without re-upload.
  - File-hash dedupe for identical IFC uploads.
- **Security & Access Hardening:**
  - Cookie-based JWT auth with refresh-token rotation and CSRF protection.
  - Job ownership enforcement across job-scoped endpoints.
  - Protected file access via job-scoped tokenized URLs.
- **Stability Improvements:**
  - R3F/Reagraph compatibility pinning for graph visualization.
  - X-ray safety fixes to avoid applying material swaps to non-IFC overlay text meshes.

## Feature Highlights

### 1. BIM Ingestion and 3D Viewing
- Upload IFC, convert to GLB, extract metadata and spatial hierarchy.
- Navigate with orbit/pan/zoom, isolate model regions, section-cut the building, and inspect element properties.

### 2. Graph-Powered BIM Query
- Traverse relationships such as `FEEDS`, `SERVES`, `IN_SYSTEM`, `CONTAINED_IN`, `HAS_MATERIAL`.
- Query by IFC type, storey, material, name, related node, relationship type, and hop depth.
- Optional graph view for visual network exploration.

### 3. HVAC/FM Operational Intelligence
- Analyze equipment-to-terminal-to-space service chains.
- Inspect physically connected terminals separately from inferred system-associated terminals.
- Link selected results directly back to model highlighting.

### 4. Work Orders and CMMS Integration
- Create, update, prioritize, assign, and close work orders tied to model elements.
- Export in CSV/JSON using COBie-compatible column naming.
- Push/pull work-order sync with CMMS adapters and webhook ingestion.

### 5. Embodied Carbon and Occupancy
- Calculate embodied carbon from BIM-derived quantities and material mappings.
- Apply material/type/element-level overrides for calibration.
- Visualize occupancy snapshots and space heatmaps for operational scenario analysis.

## Architecture at a Glance

### Backend (`FastAPI`, Python)
- IFC conversion and extraction pipeline (`IfcOpenShell`, `IfcConvert`)
- Graph build artifact (`networkx`) + graph query backend (`neo4j` default, `networkx` optional)
- HVAC/FM, EC, validation, occupancy, work orders, CMMS sync
- SQLite for auth/session audit + FM operation records

### Frontend (`React`, `Vite`, `Three.js`, `R3F`)
- 3D viewer and interaction tools
- Floating operational panels (EC, HVAC/FM, Graph Query, Work Orders, IDS, Occupancy)
- Auth-aware API usage and selection-linked workflows

### Job Artifacts
Per processed model/job (`backend/output/{job_id}/`), key artifacts include:
- `model.glb`
- `metadata.json`
- `hierarchy.json`
- `graph.json`
- `hvac_fm.json`
- `space_bboxes.json`
- `fm_merge_report.json` (when sidecar merge used)

## API Snapshot

Core job/model:
- `POST /upload`
- `GET /job/{job_id}`
- `GET /jobs`
- `GET /models`
- `POST /models/{job_id}/open`
- `DELETE /job/{job_id}`

Graph:
- `GET /api/graph/{job_id}/stats`
- `GET /api/graph/{job_id}/neighbors/{global_id}`
- `GET /api/graph/{job_id}/path/{source_id}/{target_id}`
- `POST /api/graph/{job_id}/query`
- `GET /api/graph/{job_id}/subgraph`

HVAC/FM + Spaces + Occupancy:
- `POST /api/fm/hvac/analyze/{job_id}`
- `GET /api/fm/hvac/{job_id}`
- `GET /api/spaces/bboxes/{job_id}`
- `GET /api/occupancy/{job_id}`
- `POST /api/occupancy/tick/{job_id}`
- `POST /api/occupancy/reset/{job_id}`

Work Orders + CMMS:
- `GET /api/work-orders/{job_id}`
- `GET /api/work-orders/{job_id}/summary`
- `POST /api/work-orders/{job_id}`
- `PATCH /api/work-orders/{job_id}/{wo_id}`
- `DELETE /api/work-orders/{job_id}/{wo_id}`
- `GET /api/work-orders/{job_id}/export?format=csv|json`
- `GET /api/cmms/settings`
- `PUT /api/cmms/settings`
- `POST /api/work-orders/{job_id}/{wo_id}/sync/push`
- `POST /api/work-orders/{job_id}/{wo_id}/sync/pull`
- `POST /api/cmms/webhooks/{system}`

Auth:
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`

## 5-Minute Demo Script (Snowdon Towers Sample HVAC 2)

1. Upload/open the Snowdon IFC.
2. Run HVAC/FM analysis and inspect equipment impact.
3. Open Graph Query panel:
   - Query `Name Contains = Heat Recovery Unit`
   - Use one HRU `GlobalId` in `Related To`, set `Edge = FEEDS`, `Depth = 1`
   - Clear `Name Contains` and run to see fed terminals
4. Switch to Work Orders panel and create a geometry-linked work order.
5. Export work orders (CSV) and show CMMS settings tab.
6. Toggle occupancy and space overlays to demonstrate operational context.

## Local Development

Backend (from `backend/`):
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Windows shortcut (from `backend/`):
```powershell
.\start_backend.cmd
```

Frontend (from `frontend/`):
```bash
npm install
npm run dev
```

## Demo Videos

- Upload + Structure + Properties  
  https://github.com/user-attachments/assets/5caacdaf-e5f5-4609-9d76-c7590edba9b3
- Views + Section Tools  
  https://github.com/user-attachments/assets/9c3861dc-4bb2-4867-a476-722d60ca3815
- Embodied Carbon  
  https://github.com/user-attachments/assets/e25e34d2-4185-449d-afad-c4aa15fcf472
- Spaces Overlay  
  https://github.com/user-attachments/assets/04fcfb27-0578-4980-8f95-00eed78bf4fb
- HVAC/FM Analysis  
  https://github.com/user-attachments/assets/3f89bbb1-c049-4563-ae02-9d0836781753
- Occupancy Simulation  
  https://github.com/user-attachments/assets/0e63b918-75be-4829-ab4d-d15c80d37fd1

## Notes

- Backend target: Python 3.10+.
- IFC processing requires IfcOpenShell and `IfcConvert` available.
- For full feature detail and internal flow diagrams, see `ARCHITECTURE.md`.

