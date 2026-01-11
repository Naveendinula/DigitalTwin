# Digital Twin

Web BIM viewer and embodied carbon analysis tool (FastAPI backend + React/Three.js frontend).

Web app documentation: `docs/WEB_APP.md`.
Architecture docs: `ARCHITECTURE.md` and `SYSTEM_MAP.md`.

## Refactor Notes (App.jsx)
- `frontend/src/App.jsx` is now a thin orchestrator that wires hooks and UI shells.
- Viewer lifecycle, selection/isolation, space overlay, and floating panels are handled by hooks in `frontend/src/hooks/`.
- Major UI blocks are composed via `frontend/src/components/ViewerShell.jsx` and `frontend/src/components/AppHeader.jsx`.

## Demo (videos)

- **View Presets** — Seamlessly switch between Top, Front, Side, and Free Orbit views to navigate the model efficiently.

  

https://github.com/user-attachments/assets/fd9dc671-8727-4203-ad1a-35b3a2dcab0b


- **Spatial Tree & Properties** — Browse the BIM hierarchy in the structure tree and inspect metadata for any selected element.



https://github.com/user-attachments/assets/d86d45f3-8f72-48b9-bc86-1c71edf0c468


- **X-Ray Visualization** — Toggle ghosted transparency to see through the model and focus on specific components.


https://github.com/user-attachments/assets/dac63ecb-087d-411e-8207-ea8177473f0a



- **Sectioning Tools** — Create and adjust section planes (size, position, visibility) to reveal internal details.



https://github.com/user-attachments/assets/ca7e57e8-f8cd-462f-93fc-4dc9269db3f9


- **Carbon Analysis** — Compute embodied carbon, surface high-impact materials, and apply data overrides when needed.




https://github.com/user-attachments/assets/13ed555d-da2b-4b52-ab9b-3861132c5abe




## Features (code refs)
- 3D viewer with selection, focus, isolate, section planes, and view presets (`frontend/src/components/Viewer.jsx`, `frontend/src/components/SelectableModelWithVisibility.jsx`).
- Spatial tree and property inspection (`frontend/src/components/StructureTree.jsx`, `frontend/src/components/PropertyPanel.jsx`).
- X-Ray/ghost highlighting with wireframe and ghosted solid modes (`frontend/src/hooks/useXRayMode.js`, `frontend/src/App.jsx`).
- Embodied carbon calculation with override UI (`frontend/src/components/EcPanel.jsx`) backed by FastAPI (`backend/ec_api.py`, `backend/ec_core.py`).
- HVAC/FM analysis panel with served terminals/spaces, filters, and selection-driven highlights (`frontend/src/components/HvacFmPanel.jsx`) backed by FastAPI (`backend/fm_api.py`, `backend/fm_hvac_core.py`).
- Space bbox overlay toggle and navigator for translucent room boxes (`frontend/src/components/SpaceBboxOverlay.jsx`, `frontend/src/components/SpaceNavigator.jsx`, `backend/fm_api.py`).
- Live occupancy simulation with time-based patterns and heatmap visualization (`frontend/src/components/OccupancyPanel.jsx`, `frontend/src/components/OccupancyLegend.jsx`, `backend/occupancy_sim.py`).

## Run locally
Backend (from `backend/`):
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend (from `frontend/`):
```bash
npm install
npm run dev
```

## API (backend)
- `POST /upload` — upload an IFC for processing.
- `GET /job/{job_id}` — check job status and output URLs.
- `GET /jobs` — list jobs.
- `DELETE /job/{job_id}` — delete a job.
- `GET /health` — health check.
- `POST /api/ec/calculate/{job_id}` — compute embodied carbon for an uploaded IFC (supports overrides).
- `POST /api/fm/hvac/analyze/{job_id}` – run HVAC/FM analysis and cache results.
- `GET /api/fm/hvac/{job_id}` – fetch cached HVAC/FM analysis JSON.
- `GET /api/spaces/bboxes/{job_id}` – fetch cached space bounding boxes for overlay rendering.
- `GET /api/occupancy/{job_id}` – get current occupancy snapshot for all spaces.
- `POST /api/occupancy/tick/{job_id}` – advance occupancy simulation by one tick.
- `POST /api/occupancy/reset/{job_id}` – reset occupancy simulation to fresh state.

Notes:
- HVAC/FM output includes served spaces with `room_no`, `room_name`, and grouped system names when available.
- Space bbox output includes local `bbox` plus a `transform` matrix for model-aligned overlays.
- Occupancy simulation uses absolute headcount as canonical data; percentage is derived for UX display.

## Media assets
- Final clips live in `frontend/public/media/mp4/`, posters in `frontend/public/media/posters/`. See `frontend/public/media/README.md` for encoding settings and naming.
- Raw capture takes should be kept in `media_sources/` (ignored) before transcoding.

## Notes
- Backend requires Python 3.10+ and IfcOpenShell with `IfcConvert` available in PATH.
- Keep video files small (H.264, 960x540–1280x720, 800–1500 kbps) to avoid repo bloat.
