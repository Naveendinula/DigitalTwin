# AI Agent Instructions for DigitalTwin

This repository is a web-based BIM viewer and embodied carbon analysis tool. It uses a **FastAPI** backend for IFC processing and a **React + Three.js** frontend for visualization.

## 🏗 Architecture Overview

- **Pattern:** Job-based async processing.
  1.  **Upload:** User uploads `.ifc` -> Backend returns `job_id`.
  2.  **Process:** Backend converts IFC to GLB (geometry) and JSON (metadata) in background.
  3.  **Poll:** Frontend polls `/job/{job_id}` until status is "completed".
  4.  **Visualize:** Frontend fetches generated GLB and JSON files from `backend/output/{job_id}/`.
- **Backend:** Python (FastAPI), `IfcOpenShell` (processing), `pandas` (analysis).
- **Frontend:** React (Vite), `@react-three/fiber` (3D), standard HTML/DOM overlays.

## 📂 Key Directories & Files

- **Backend (`backend/`)**
  - `main.py`: App entry point & API routes.
  - `ec_core.py`: Embodied Carbon calculation logic.
  - `fm_hvac_core.py`: HVAC/FM analysis logic (Equipment -> Terminals -> Spaces).
  - `ifc_converter.py`: Wrapper for `IfcConvert` (geometry conversion).
  - `output/`: **CRITICAL**. Stores all processed artifacts (`model.glb`, `metadata.json`, `hvac_fm.json`) organized by `job_id`.
  - `prac-database.csv`: Source of truth for material carbon factors.

- **Frontend (`frontend/src/`)**
  - `components/Viewer.jsx`: Main 3D canvas.
  - `components/SelectableModelWithVisibility.jsx`: Handles model loading, selection, and X-ray modes.
  - `hooks/`: Contains complex viewer logic (`useSelection.js`, `useXRayMode.js`, `useSpaceOverlay.js`).
  - `components/EcPanel.jsx` & `HvacFmPanel.jsx`: Domain-specific analysis UIs.

## 🚀 Development Workflows

- **Backend Run:**
  ```bash
  cd backend
  # Ensure venv is active
  uvicorn main:app --reload --host 0.0.0.0 --port 8000
  ```
- **Frontend Run:**
  ```bash
  cd frontend
  npm run dev
  ```
- **Testing:** Currently relies on **manual verification**. No automated test suite exists.
- **Dependencies:** `IfcConvert` executable must be in the system PATH for geometry conversion to work.

## 🎨 Coding Conventions

### Frontend Styling
- **Pattern:** **Inline Styles + Injected `<style>` Tags**.
- **Do NOT use:** Tailwind, CSS Modules, or external `.css` files (except global resets).
- **Example:** Define a `styles` object in the component and inject dynamic styles (like `:hover` or `@keyframes`) using `document.createElement('style')` (see `EcPanel.jsx`).
- **Aesthetic:** "Arctic Zen" (clean, minimal, Apple-like).

### 3D Interaction (React Three Fiber)
- Use **Hooks** for state management (`useThree`, `useFrame`).
- **Selection/Visibility:** Managed via custom hooks (`useViewerSelection.js`) that manipulate material properties (opacity, color) rather than adding/removing objects from the scene.
- **X-Ray Mode:** Implemented by swapping materials or adjusting opacity/depthTest, not by post-processing.

### Backend Processing
- **File I/O:** Always use `pathlib` for paths.
- **Caching:** Check if analysis results (e.g., `hvac_fm.json`) exist in `output/{job_id}/` before re-calculating.
- **Error Handling:** Return standard HTTP errors from FastAPI; frontend expects JSON error responses.

## 🔗 Integration Points

- **Material Mapping:** `backend/domain/materials.py` maps IFC materials to `prac-database.csv`.
- **Spatial Hierarchy:** `backend/ifc_spatial_hierarchy.py` extracts the tree structure used by `StructureTree.jsx`.
- **Space Overlays:** `backend/fm_api.py` serves pre-calculated bounding boxes for rooms.
