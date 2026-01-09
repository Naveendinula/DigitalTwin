# System Map

This document provides a high-level visual map of the Digital Twin system components and their interactions.

## System Overview

```mermaid
graph TD
    subgraph "Client Layer"
        Browser[Web Browser]
    end

    subgraph "Frontend Layer (Port 3000)"
        ReactApp[React Application]
        ThreeJS[Three.js Viewer]
        State[App State]
        
        Browser --> ReactApp
        ReactApp --> ThreeJS
        ReactApp --> State
    end

    subgraph "API Layer (Port 8000)"
        FastAPI[FastAPI Server]
        Router[API Router]
        
        ReactApp -- HTTP/JSON --> FastAPI
        FastAPI --> Router
    end

    subgraph "Processing Layer"
        IFCConv["IfcConvert (Geometry)"]
        MetaExt[Metadata Extractor]
        ECCalc[EC Calculator]
        HvacCore["HVAC/FM Core"]
        SpaceBBox["Space BBox Extractor"]
        Validator["IFC Validator"]
        
        Router --> IFCConv
        Router --> MetaExt
        Router --> ECCalc
        Router --> HvacCore
        Router --> SpaceBBox
        Router --> Validator
        Router --> OccSim["Occupancy Simulator"]
    end

    subgraph "Data Layer"
        IFCFiles[Raw IFC Files]
        GLBFiles[Processed GLB]
        JSONMeta[JSON Metadata]
        ECDB["EC Database (CSV)"]
        HVACJson[HVAC/FM JSON]
        SpaceBBoxJson[Space BBoxes + Transform JSON]
        ValidationJson[Validation JSON]
        
        IFCConv -- Reads --> IFCFiles
        IFCConv -- Writes --> GLBFiles
        
        MetaExt -- Reads --> IFCFiles
        MetaExt -- Writes --> JSONMeta
        
        ECCalc -- Reads --> IFCFiles
        ECCalc -- Reads --> ECDB

        HvacCore -- Reads --> IFCFiles
        HvacCore -- Writes --> HVACJson

        SpaceBBox -- Reads --> IFCFiles
        SpaceBBox -- Writes --> SpaceBBoxJson

        Validator -- Writes --> ValidationJson

        OccSim -- Reads --> SpaceBBoxJson
        OccSim -- Writes --> OccJson[Occupancy JSON]
    end
```

## Directory Structure Map

```mermaid
graph LR
    Root[Project Root]
    
    subgraph Backend
        BE[backend/]
        Main[main.py]
        Core[ec_core.py]
        API[ec_api.py]
        FmCore[fm_hvac_core.py]
        FmAPI[fm_api.py]
        ValCore[ifc_validation.py]
        ValAPI[validation_api.py]
        DB[prac-database.csv]
        Uploads[uploads/]
        Output[output/]
        
        BE --> Main
        BE --> Core
        BE --> API
        BE --> FmCore
        BE --> FmAPI
        BE --> ValCore
        BE --> ValAPI
        OccSim2[occupancy_sim.py]
        BE --> OccSim2
        BE --> DB
        BE --> Uploads
        BE --> Output
    end
    
    subgraph Frontend
        FE[frontend/]
        Src[src/]
        Comps[components/]
        Viewer[Viewer.jsx]
        Panel[EcPanel.jsx]
        HvacPanel[HvacFmPanel.jsx]
        SpaceOverlay[SpaceBboxOverlay.jsx]
        SpaceNav[SpaceNavigator.jsx]
        ValBadge[ValidationBadge.jsx]
        ValModal[ValidationReportModal.jsx]
        
        FE --> Src
        Src --> Comps
        Comps --> Viewer
        Comps --> Panel
        Comps --> HvacPanel
        Comps --> SpaceOverlay
        Comps --> SpaceNav
        Comps --> ValBadge
        Comps --> ValModal
        OccLegend[OccupancyLegend.jsx]
        OccPanel[OccupancyPanel.jsx]
        Comps --> OccLegend
        Comps --> OccPanel
    end
    
    Root --> Backend
    Root --> Frontend
```

## Key Workflows

### 1. File Upload & Processing
```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend API
    participant FS as File System
    participant Conv as IfcConvert
    participant Val as IFC Validator
    
    User->>UI: Upload IFC File
    UI->>API: POST /upload
    API->>FS: Save .ifc file
    API->>Conv: Trigger Conversion
    Conv->>FS: Read .ifc
    Conv->>FS: Write .glb
    API->>Val: Run validation
    Val->>FS: Write validation.json
    API-->>UI: Return Job ID
```

### 2. Embodied Carbon Analysis
```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend API
    participant Core as EC Core
    participant DB as CSV Database
    
    User->>UI: Click "Calculate EC"
    UI->>API: POST /api/ec/calculate
    API->>Core: Run Calculation
    Core->>DB: Load Factors
    Core->>Core: Map Materials & Calculate
    Core-->>API: Return Results
    API-->>UI: JSON Data
    UI->>User: Display Charts & Stats
```

### 3. HVAC/FM Analysis
```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend API
    participant Core as HVAC/FM Core

    User->>UI: Click "Analyze HVAC FM"
    UI->>API: POST /api/fm/hvac/analyze/{job_id}
    API->>Core: Traverse equipment -> terminals -> spaces
    Core-->>API: Cache hvac_fm.json (rooms, system groups)
    UI->>API: GET /api/fm/hvac/{job_id}
    API-->>UI: JSON Data
    UI->>User: Display served spaces and terminals
```

### 4. Space BBox Overlay
```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend API
    participant BBox as Space BBox Extractor

    User->>UI: Toggle "Spaces"
    UI->>API: GET /api/spaces/bboxes/{job_id}
    API->>BBox: Compute bboxes
    BBox-->>API: Cache space_bboxes.json (bbox + transform)
    API-->>UI: JSON Data
    UI->>User: Render translucent space boxes
```

### 5. Live Occupancy Simulation
```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend API
    participant Sim as Occupancy Simulator

    User->>UI: Toggle "Occupancy"
    UI->>API: GET /api/occupancy/{job_id}
    API->>Sim: Generate snapshot (time-based patterns)
    Sim-->>API: Cache occupancy_current.json
    API-->>UI: JSON Data (spaces + totals)
    UI->>User: Render heatmap overlay + legend
    loop Every 2 seconds
        UI->>API: POST /api/occupancy/tick/{job_id}
        API->>Sim: Random walk with mean reversion
        Sim-->>API: Updated snapshot
        API-->>UI: Updated JSON
        UI->>User: Update colors + counts
    end
```

### 6. Validation Report
```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend API
    participant FS as File System

    User->>UI: Open validation report
    UI->>API: GET /validation/{job_id}/summary (badge)
    API->>FS: Read validation.json (cached)
    API-->>UI: Summary
    UI->>API: GET /validation/{job_id} (modal)
    API->>FS: Read validation.json (cached)
    API-->>UI: Full report
```
