# Digital Twin Backend

FastAPI server for IFC file processing.

## Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Requirements

- Python 3.10+
- IfcOpenShell with IfcConvert CLI tool
- See requirements.txt for Python packages

## Running the Server

```bash
# Development mode with auto-reload
python main.py

# Or using uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

### POST /upload
Upload an IFC file for processing.

```bash
curl -X POST "http://localhost:8000/upload" \
  -F "file=@model.ifc"
```

Response:
```json
{
  "job_id": "a1b2c3d4",
  "status": "pending",
  "ifc_filename": "model.ifc",
  "glb_url": null,
  "metadata_url": null,
  "hierarchy_url": null
}
```

### GET /job/{job_id}
Check job status.

```bash
curl "http://localhost:8000/job/a1b2c3d4"
```

Response (when complete):
```json
{
  "job_id": "a1b2c3d4",
  "status": "completed",
  "ifc_filename": "model.ifc",
  "glb_url": "/files/a1b2c3d4/model.glb",
  "metadata_url": "/files/a1b2c3d4/metadata.json",
  "hierarchy_url": "/files/a1b2c3d4/hierarchy.json"
}
```

### GET /jobs
List all jobs.

### DELETE /job/{job_id}
Delete a job and its files.

### GET /health
Health check.

## File Structure

```
backend/
├── main.py                    # FastAPI server
├── ifc_converter.py           # IFC to GLB conversion
├── ifc_metadata_extractor.py  # Metadata extraction
├── ifc_spatial_hierarchy.py   # Hierarchy extraction
├── requirements.txt           # Python dependencies
├── uploads/                   # Uploaded IFC files
└── output/                    # Generated GLB/JSON files
    └── {job_id}/
        ├── model.glb
        ├── metadata.json
        └── hierarchy.json
```
