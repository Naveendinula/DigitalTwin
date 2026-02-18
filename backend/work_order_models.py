"""
Pydantic models for geometry-native work orders.
"""

from typing import Literal

from pydantic import BaseModel, Field

WOCategory = Literal[
    "inspection",
    "repair",
    "replacement",
    "preventive",
    "corrective",
    "note",
    "issue",
]
WOPriority = Literal["low", "medium", "high", "critical"]
WOStatus = Literal["open", "in_progress", "on_hold", "resolved", "closed"]
ExternalSystem = Literal["upkeep", "fiix", "maximo", "other"]
SyncStatus = Literal["synced", "pending", "conflict"]
SortBy = Literal["updated_at", "created_at", "due_date", "priority", "status", "work_order_no"]
SortOrder = Literal["asc", "desc"]


class WOCreate(BaseModel):
    global_id: str = Field(min_length=1, max_length=120)
    element_name: str = Field(default="", max_length=240)
    element_type: str = Field(default="", max_length=120)
    storey: str = Field(default="", max_length=120)
    category: WOCategory = "note"
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    priority: WOPriority = "medium"
    status: WOStatus = "open"
    assigned_to: str | None = Field(default=None, max_length=120)
    due_date: str | None = None
    estimated_hours: float | None = Field(default=None, ge=0)
    actual_hours: float | None = Field(default=None, ge=0)
    cost: float | None = Field(default=None, ge=0)
    external_system: ExternalSystem | None = None
    external_work_order_id: str | None = Field(default=None, max_length=120)
    external_sync_status: SyncStatus | None = None


class WOUpdate(BaseModel):
    global_id: str | None = Field(default=None, min_length=1, max_length=120)
    element_name: str | None = Field(default=None, max_length=240)
    element_type: str | None = Field(default=None, max_length=120)
    storey: str | None = Field(default=None, max_length=120)
    category: WOCategory | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    priority: WOPriority | None = None
    status: WOStatus | None = None
    assigned_to: str | None = Field(default=None, max_length=120)
    due_date: str | None = None
    completed_at: str | None = None
    estimated_hours: float | None = Field(default=None, ge=0)
    actual_hours: float | None = Field(default=None, ge=0)
    cost: float | None = Field(default=None, ge=0)
    external_system: ExternalSystem | None = None
    external_work_order_id: str | None = Field(default=None, max_length=120)
    external_sync_status: SyncStatus | None = None


class WOResponse(BaseModel):
    id: int
    job_id: str
    work_order_no: str
    global_id: str
    element_name: str
    element_type: str
    storey: str
    category: WOCategory
    title: str
    description: str
    priority: WOPriority
    status: WOStatus
    assigned_to: str | None
    due_date: str | None
    completed_at: str | None
    estimated_hours: float | None
    actual_hours: float | None
    cost: float | None
    external_system: ExternalSystem | None
    external_work_order_id: str | None
    external_sync_status: SyncStatus | None
    external_synced_at: str | None
    created_at: str
    updated_at: str


class WOSummary(BaseModel):
    status: dict[str, int]
    priority: dict[str, int]
    category: dict[str, int]
    overdue: int
    total: int
