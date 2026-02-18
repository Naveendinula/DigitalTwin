"""
Pydantic models for maintenance log API payloads.
"""

from typing import Literal

from pydantic import BaseModel, Field

LogCategory = Literal["inspection", "repair", "replacement", "note", "issue"]
LogPriority = Literal["low", "medium", "high", "critical"]
LogStatus = Literal["open", "in_progress", "resolved", "closed"]


class LogCreate(BaseModel):
    global_id: str = Field(min_length=1, max_length=120)
    element_name: str = Field(default="", max_length=240)
    element_type: str = Field(default="", max_length=120)
    category: LogCategory = "note"
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    priority: LogPriority = "medium"


class LogUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: LogCategory | None = None
    priority: LogPriority | None = None
    status: LogStatus | None = None


class LogResponse(BaseModel):
    id: int
    job_id: str
    global_id: str
    element_name: str
    element_type: str
    category: LogCategory
    title: str
    description: str
    priority: LogPriority
    status: LogStatus
    created_at: str
    updated_at: str
