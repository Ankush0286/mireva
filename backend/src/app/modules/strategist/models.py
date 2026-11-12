from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.base_models import AuditBase
from app.common.enums import AutonomyLevel, StrategistStatus
from app.modules.copilot.models import ChatSession


class StrategistState(AuditBase):
    """
    Singleton persistence entity tracking the 24/7 background agent's state,
    active model, scheduled sleep timers, and autonomy policies.
    """

    __tablename__ = "strategist_state"

    status: Mapped[StrategistStatus] = mapped_column(
        SAEnum(StrategistStatus, native_enum=False),
        default=StrategistStatus.IDLE,
        nullable=False,
        index=True,
    )
    current_step: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Active LLM Model Identifier (e.g. nvidia/nemotron-3-ultra-550b-a55b:free)
    model_id: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Sleep & Scheduling
    next_cycle_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    sleep_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Human-in-the-Loop Intervention Gate
    pending_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_urgency: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pending_context: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )

    # Autonomy Policy
    autonomy_level: Mapped[AutonomyLevel] = mapped_column(
        SAEnum(AutonomyLevel, native_enum=False),
        default=AutonomyLevel.STAGED_REVIEW,
        nullable=False,
    )

    # Dedicated ChatSession preserving the monologue and tool execution traces
    session_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Telemetry
    cycle_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_cycle_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_cycle_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )

    # Relationships
    session: Mapped[ChatSession | None] = relationship("ChatSession")

    def is_due_to_wake(self) -> bool:
        if self.status != StrategistStatus.SLEEPING or not self.next_cycle_at:
            return False
        wake_at = (
            self.next_cycle_at.replace(tzinfo=UTC)
            if self.next_cycle_at.tzinfo is None
            else self.next_cycle_at
        )
        return datetime.now(UTC) >= wake_at
