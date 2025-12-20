# Digital Twin

Web BIM viewer and embodied carbon analysis tool (FastAPI backend + React/Three.js frontend).

## Demo (videos)
Videos load from `frontend/public/media/mp4/`. Add the encoded clips to that path and the embeds below will play.

<figure>
  <video controls preload="none" width="720">
    <source src="frontend/public/media/mp4/Views.mp4" type="video/mp4" />
    Your browser does not support the video tag.
  </video>
  <figcaption><strong>View Presets</strong> — Seamlessly switch between Top, Front, Side, and Free Orbit views to navigate the model efficiently.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720">
    <source src="frontend/public/media/mp4/Panels.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>Spatial Tree & Properties</strong> — Explore the BIM hierarchy through the structure tree and view metadata for any selected element.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720">
    <source src="frontend/public/media/mp4/xray.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>X-Ray Visualization</strong> — Use ghosted transparency to see through the model and focus on specific systems or components.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720">
    <source src="frontend/public/media/mp4/plane.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>Sectioning Tools</strong> — Define and manipulate section planes with adjustable size and visibility to reveal internal details.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720">
    <source src="frontend/public/media/mp4/embodiedcarbon.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>Carbon Analysis</strong> — Calculate embodied carbon impact, identify high-impact materials, and manage data overrides.</figcaption>
</figure>

## Features (code refs)
- 3D viewer with selection, focus, isolate, section planes, and view presets (`frontend/src/components/Viewer.jsx`, `frontend/src/components/SelectableModelWithVisibility.jsx`).
- Spatial tree and property inspection (`frontend/src/components/StructureTree.jsx`, `frontend/src/components/PropertyPanel.jsx`).
- X-Ray/ghost highlighting (`frontend/src/hooks/useXRayMode.js`).
- Embodied carbon calculation with override UI (`frontend/src/components/EcPanel.jsx`) backed by FastAPI (`backend/ec_api.py`, `backend/ec_core.py`).

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

## Media assets
- Final clips live in `frontend/public/media/mp4/`, posters in `frontend/public/media/posters/`. See `frontend/public/media/README.md` for encoding settings and naming.
- Raw capture takes should be kept in `media_sources/` (ignored) before transcoding.

## Notes
- Backend requires Python 3.10+ and IfcOpenShell with `IfcConvert` available in PATH.
- Keep video files small (H.264, 960x540–1280x720, 800–1500 kbps) to avoid repo bloat.
