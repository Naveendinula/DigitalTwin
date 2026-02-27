"""
Shared graph query models.
"""

from pydantic import BaseModel, Field


class GraphQuery(BaseModel):
    # Node filters
    node_type: str | None = None
    storey: str | None = None
    material: str | None = None
    name_contains: str | None = None

    # Property filters (Phase 6)
    property_name: str | None = None
    property_value: str | None = None

    # Relationship traversal
    related_to: str | None = None
    relationship: str | None = None
    max_depth: int = Field(default=1, ge=1, le=4)

    # Pagination
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
