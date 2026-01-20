# Digital Twin

Web BIM viewer and embodied carbon analysis tool (FastAPI backend + React/Three.js frontend).

Web app documentation: `docs/WEB_APP.md`.
Architecture docs: `ARCHITECTURE.md` and `SYSTEM_MAP.md`.

## Refactor Notes (App.jsx)
- `frontend/src/App.jsx` is now a thin orchestrator that wires hooks and UI shells.
- Viewer lifecycle, selection/isolation, space overlay, and floating panels are handled by hooks in `frontend/src/hooks/`.
- Major UI blocks are composed via `frontend/src/components/ViewerShell.jsx` and `frontend/src/components/AppHeader.jsx`.

## Demo (videos)

- **Upload + Structure + Properties** - Upload an IFC model, explore the structure panel (including tools like X‑ray and isolation to focus on specific parts), and view detailed element information in the properties panel as you click items in the model or tree.
  


https://github.com/user-attachments/assets/5caacdaf-e5f5-4609-9d76-c7590edba9b3


- **Views + Section Tools** — Use the view buttons to jump between standard camera angles, then activate the section tools to cut through the model and reveal interior details by adjusting the section planes.




https://github.com/user-attachments/assets/9c3861dc-4bb2-4867-a476-722d60ca3815




- **Embodied Carbon Calculator** — Run the carbon analysis to estimate material impacts, highlight high‑impact components, and apply overrides when you have better material data.



https://github.com/user-attachments/assets/e25e34d2-4185-449d-afad-c4aa15fcf472



- **Spaces Overlay** — Turn on the spaces feature to see translucent room boxes, then step through spaces to quickly locate and understand areas within the building.



https://github.com/user-attachments/assets/04fcfb27-0578-4980-8f95-00eed78bf4fb




- **HVAC/FM Analysis** —  Run the HVAC/FM analysis to review served systems and terminals, use filters to narrow results, and click items to highlight related elements in the model.



https://github.com/user-attachments/assets/3f89bbb1-c049-4563-ae02-9d0836781753


- **Occupancy Simulation** —  Show the simulated people flow and room usage over time, which helps teams validate space planning and spot potential congestion or underused areas before making real‑world changes.




https://github.com/user-attachments/assets/0e63b918-75be-4829-ab4d-d15c80d37fd1




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
