# Web App Documentation

This document describes the frontend web app for the Digital Twin viewer, how it is structured, and how it interacts with the backend.

## Overview

The web app is a React + Three.js viewer for IFC models. It handles upload, renders a 3D model, and provides tools for selection, isolation, section planes, and domain panels (embodied carbon and HVAC/FM).

Primary entry points:
- App orchestration: `frontend/src/App.jsx`
- App bootstrap: `frontend/src/main.jsx`
- Viewer rendering: `frontend/src/components/Viewer.jsx`
- Model selection/visibility: `frontend/src/components/SelectableModelWithVisibility.jsx`
- Upload flow: `frontend/src/components/UploadPanel.jsx`

## Local Development

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

## Architecture at a Glance

`App.jsx` acts as a thin orchestrator:
- Initializes viewer controllers and app state.
- Wires event handlers to UI components.
- Renders the top-level layout.

Key extracted UI blocks:
- Header: `frontend/src/components/AppHeader.jsx`
- Viewer shell (toolbar, viewer, overlays, panels): `frontend/src/components/ViewerShell.jsx`
- Left panel: `frontend/src/components/StructureTree.jsx`
- Right panel: `frontend/src/components/PropertyPanel.jsx`

Key hooks:
- Viewer lifecycle + scene wiring: `frontend/src/hooks/useViewerScene.js`
- Selection/isolation logic: `frontend/src/hooks/useViewerSelection.js`
- Section plane picking: `frontend/src/hooks/useSectionPick.js`
- Space overlay state/toasts: `frontend/src/hooks/useSpaceOverlay.js`
- Floating panels (EC/HVAC) stacking: `frontend/src/hooks/useFloatingPanels.js`
- Keyboard shortcuts: `frontend/src/hooks/useKeyboardShortcuts.js`

## Core Data Flow

1) Upload IFC
- UploadPanel posts the IFC to `POST /upload` and polls job status with `GET /job/{job_id}`.
- When complete, it provides model URLs: `glbUrl`, `metadataUrl`, `hierarchyUrl`, plus `jobId`.

2) Viewer load
- `SelectableModelWithVisibility.jsx` loads the GLB and registers the scene with visibility/selection/section/X-ray/camera hooks.
- `StructureTree.jsx` uses the hierarchy URL to populate the spatial tree.
- `PropertyPanel.jsx` uses the metadata URL to display properties.

3) User interaction
- Tree selection focuses the camera and optionally applies X-ray.
- Viewer selection updates the property panel and maintains focus history.
- Isolation can either hide non-selected objects or ghost them (X-ray).

4) Domain panels
- Embodied carbon: `frontend/src/components/EcPanel.jsx` calls `POST /api/ec/calculate/{job_id}`.
- HVAC/FM: `frontend/src/components/HvacFmPanel.jsx` calls `POST /api/fm/hvac/analyze/{job_id}` then `GET /api/fm/hvac/{job_id}`.

5) Space overlay
- `frontend/src/components/SpaceBboxOverlay.jsx` requests `GET /api/spaces/bboxes/{job_id}` and renders translucent room boxes.
- `SpaceNavigator.jsx` lets users step through spaces when no subset is highlighted.

## Viewer Interaction Model

Selection and isolation are coordinated in `useViewerSelection.js`:
- Normal: no selection, all visible.
- Focus: selection active, camera can focus on selected elements.
- Isolate: hide or ghost non-selected elements (X-ray).

Camera/view controls:
- Preset views are managed by `useViewMode.js`.
- Section plane tools are managed by `useSectionMode.js`.

## Keyboard Shortcuts

Defined in `frontend/src/hooks/useKeyboardShortcuts.js`:
- `Esc`: clear selection and X-ray.
- `F`: focus the camera on current selection.
- `1-7`: view presets (free, top, front, right, left, back, bottom).

## Backend API Usage

The frontend expects a backend running at `http://localhost:8000`. The base URL is currently hardcoded in these files:
- `frontend/src/components/UploadPanel.jsx`
- `frontend/src/components/EcPanel.jsx`
- `frontend/src/components/HvacFmPanel.jsx`
- `frontend/src/components/SpaceBboxOverlay.jsx`

Endpoints used:
- `POST /upload`
- `GET /job/{job_id}`
- `POST /api/ec/calculate/{job_id}`
- `POST /api/fm/hvac/analyze/{job_id}`
- `GET /api/fm/hvac/{job_id}`
- `GET /api/spaces/bboxes/{job_id}`

## File Map (Frontend)

App composition:
- `frontend/src/App.jsx`
- `frontend/src/components/AppHeader.jsx`
- `frontend/src/components/ViewerShell.jsx`

Viewer and UI:
- `frontend/src/components/Viewer.jsx`
- `frontend/src/components/SelectableModelWithVisibility.jsx`
- `frontend/src/components/ViewerToolbar.jsx`
- `frontend/src/components/SectionPlanePanel.jsx`
- `frontend/src/components/SectionPlaneHelper.jsx`
- `frontend/src/components/StructureTree.jsx`
- `frontend/src/components/PropertyPanel.jsx`
- `frontend/src/components/KeyboardHints.jsx`
- `frontend/src/components/AxisViewWidget.jsx`

Domain panels and overlays:
- `frontend/src/components/EcPanel.jsx`
- `frontend/src/components/HvacFmPanel.jsx`
- `frontend/src/components/SpaceBboxOverlay.jsx`
- `frontend/src/components/SpaceNavigator.jsx`

Hooks and utilities:
- `frontend/src/hooks/useViewerScene.js`
- `frontend/src/hooks/useViewerSelection.js`
- `frontend/src/hooks/useSectionPick.js`
- `frontend/src/hooks/useSectionMode.js`
- `frontend/src/hooks/useXRayMode.js`
- `frontend/src/hooks/useViewMode.js`
- `frontend/src/hooks/useCameraFocus.js`
- `frontend/src/utils/cameraUtils.js`
- `frontend/src/utils/colorUtils.js`

## Troubleshooting

- Ensure the backend is running at `http://localhost:8000` and can serve upload + job endpoints.
- Large IFCs can take several minutes to process; UploadPanel has a 30 minute timeout.
- If view presets or section planes behave unexpectedly, check `useViewMode.js` and `useSectionMode.js`.

## Manual Sanity Checklist

1) Upload IFC and wait for processing to complete.
2) Select elements in the tree and verify camera focus + property panel updates.
3) Toggle isolate vs. X-ray focus and ensure visibility behaves correctly.
4) Use view presets (1-7) and the `F` shortcut.
5) Enable section mode, pick a plane, and adjust size/visibility.
6) Open EC and HVAC panels and run analysis.
7) Toggle space overlay and cycle spaces with the navigator.
