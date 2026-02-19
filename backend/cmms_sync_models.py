"""
Pydantic models for CMMS sync settings and webhook payloads.
"""

from typing import Literal

from pydantic import BaseModel, Field

from work_order_models import WOCategory, WOPriority, WOStatus

SyncSystem = Literal["mock", "upkeep", "fiix", "maximo", "other"]
SyncState = Literal["synced", "pending", "conflict"]


class CMMSSettingsUpdate(BaseModel):
    enabled: bool = False
    system: SyncSystem = "mock"
    base_url: str = Field(default="", max_length=300)
    api_key: str | None = Field(default=None, max_length=500)
    webhook_secret: str | None = Field(default=None, max_length=500)


class CMMSSettingsResponse(BaseModel):
    enabled: bool
    system: SyncSystem
    base_url: str
    has_api_key: bool
    has_webhook_secret: bool
    updated_at: str | None = None


class CMMSWebhookPayload(BaseModel):
    job_id: str | None = Field(default=None, max_length=120)
    external_work_order_id: str = Field(min_length=1, max_length=120)
    status: WOStatus | None = None
    priority: WOPriority | None = None
    category: WOCategory | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    assigned_to: str | None = Field(default=None, max_length=120)
    due_date: str | None = None
    external_sync_status: SyncState | None = None
