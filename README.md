# Digital Twin

Web BIM viewer and embodied carbon analysis tool (FastAPI backend + React/Three.js frontend).

## Demo (videos)
Videos load from `frontend/public/media/mp4/` with posters in `frontend/public/media/posters/`. Add the encoded clips to those paths and the embeds below will play.

<figure>
  <video controls preload="none" width="720" poster="/media/posters/upload.png">
    <source src="/media/mp4/upload.mp4" type="video/mp4" />
    Your browser does not support the video tag. Download the MP4 from /media/mp4/.
  </video>
  <figcaption><strong>Upload & process</strong> — Upload an IFC, trigger conversion, and see the model load.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720" poster="/media/posters/structure-properties.png">
    <source src="/media/mp4/structure-properties.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>Structure → properties</strong> — Navigate the spatial tree and inspect element properties.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720" poster="/media/posters/focus.png">
    <source src="/media/mp4/focus.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>Focus (F)</strong> — Select elements and snap the camera to them.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720" poster="/media/posters/isolate.png">
    <source src="/media/mp4/isolate.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>Isolate / ghost</strong> — Hide everything else or use the X-ray/ghost view.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720" poster="/media/posters/section-plane.png">
    <source src="/media/mp4/section-plane.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>Section plane</strong> — Create and nudge cut planes to inspect interiors.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720" poster="/media/posters/view-presets.png">
    <source src="/media/mp4/view-presets.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>View presets</strong> — Jump between top/front/side/free camera presets.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720" poster="/media/posters/xray.png">
    <source src="/media/mp4/xray.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>X-Ray</strong> — Toggle transparent rendering to highlight selections.</figcaption>
</figure>

<figure>
  <video controls preload="none" width="720" poster="/media/posters/ec-panel.png">
    <source src="/media/mp4/ec-panel.mp4" type="video/mp4" />
  </video>
  <figcaption><strong>Embodied Carbon panel</strong> — Run EC calculation, review hot spots, and apply overrides.</figcaption>
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
