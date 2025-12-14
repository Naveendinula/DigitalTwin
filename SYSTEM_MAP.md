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
        
        Router --> IFCConv
        Router --> MetaExt
        Router --> ECCalc
    end

    subgraph "Data Layer"
        IFCFiles[Raw IFC Files]
        GLBFiles[Processed GLB]
        JSONMeta[JSON Metadata]
        ECDB["EC Database (CSV)"]
        
        IFCConv -- Reads --> IFCFiles
        IFCConv -- Writes --> GLBFiles
        
        MetaExt -- Reads --> IFCFiles
        MetaExt -- Writes --> JSONMeta
        
        ECCalc -- Reads --> IFCFiles
        ECCalc -- Reads --> ECDB
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
        DB[prac-database.csv]
        Uploads[uploads/]
        Output[output/]
        
        BE --> Main
        BE --> Core
        BE --> API
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
        
        FE --> Src
        Src --> Comps
        Comps --> Viewer
        Comps --> Panel
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
    
    User->>UI: Upload IFC File
    UI->>API: POST /upload
    API->>FS: Save .ifc file
    API->>Conv: Trigger Conversion
    Conv->>FS: Read .ifc
    Conv->>FS: Write .glb
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
