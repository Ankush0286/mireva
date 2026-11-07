from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import AutonomyLevel, StrategistStatus


class StrategistStateResponse(BaseModel):
    """Public view of the 24/7 autonomous strategist state."""

    id: UUID
    status: StrategistStatus
    current_step: str | None = None
    next_cycle_at: datetime | None = None
    sleep_rationale: str | None = None
    pending_question: str | None = None
    pending_urgency: str | None = None
    pending_context: dict[str, Any] = Field(default_factory=dict)
    autonomy_level: AutonomyLevel
    session_id: UUID | None = None
    cycle_count: int
    last_cycle_started_at: datetime | None = None
    last_cycle_completed_at: datetime | None = None
    extra_metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateAutonomyRequest(BaseModel):
    """Payload accepted by POST /api/v1/strategist/autonomy"""

    autonomy_level: AutonomyLevel


class HumanReplyRequest(BaseModel):
    """Payload accepted by POST /api/v1/strategist/reply"""

    reply: str = Field(..., min_length=1, max_length=10000)
