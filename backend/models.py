"""
Shared Pydantic models and enums for backend API responses.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobStage(str, Enum):
    QUEUED = "queued"
    CONVERTING_GLB = "converting_glb"
    EXTRACTING_METADATA = "extracting_metadata"
    EXTRACTING_HIERARCHY = "extracting_hierarchy"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    FAILED = "failed"


class ConversionJob(BaseModel):
    job_id: str
    status: JobStatus
    ifc_filename: str
    ifc_schema: Optional[str] = None
    stage: Optional[JobStage] = None
    glb_url: Optional[str] = None
    metadata_url: Optional[str] = None
    hierarchy_url: Optional[str] = None
    error: Optional[str] = None
    fm_params_filename: Optional[str] = None


class UserModelSummary(BaseModel):
    job_id: str
    ifc_filename: str
    ifc_schema: Optional[str] = None
    status: JobStatus
    created_at: str
    updated_at: Optional[str] = None
    last_opened_at: Optional[str] = None
    has_geometry: bool = False
