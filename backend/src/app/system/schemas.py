from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

HealthStatus = Literal["healthy", "warning", "error"]
CoverageStatus = Literal["custom_ready", "native_ready", "missing"]


class SubsystemHealth(BaseModel):
    """Health report for an individual infrastructure subsystem."""

    id: str
    name: str
    status: HealthStatus
    message: str
    latency_ms: float | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class SchedulerJobInfo(BaseModel):
    """Runtime status of a registered APScheduler background job."""

    id: str
    name: str
    next_run_time: datetime | None = None


class RecipeCoverageSlot(BaseModel):
    """Represents a single cell in the Platform x Action Recipe Coverage Matrix."""

    platform: str
    action_type: str
    action_label: str
    status: CoverageStatus
    has_custom_recipe: bool
    has_native_adapter: bool
    recipe_id: UUID | None = None
    recipe_name: str | None = None


class SystemDiagnosticsResponse(BaseModel):
    """Comprehensive system health and readiness payload."""

    overall_status: HealthStatus
    checked_at: datetime
    subsystems: list[SubsystemHealth]
    scheduler_running: bool
    scheduler_jobs: list[SchedulerJobInfo]
    recipe_matrix: list[RecipeCoverageSlot]
    entity_counts: dict[str, int]


class SeedRecipesResponse(BaseModel):
    """Result after idempotently seeding default platform recipes."""

    seeded_count: int
    total_recipes: int
    message: str


class WorkerTriggerResponse(BaseModel):
    """Result after manually invoking a background worker cycle."""

    worker: str
    status: str
    items_processed: int
    message: str
