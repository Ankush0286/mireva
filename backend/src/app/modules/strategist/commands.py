from dataclasses import dataclass, field
from typing import Any

from app.common.enums import AutonomyLevel


@dataclass(frozen=True)
class RecordSleepCommand:
    """Command to put the strategist to sleep until the next scheduled cycle."""

    duration_minutes: int
    rationale: str


@dataclass(frozen=True)
class RecordHumanBlockerCommand:
    """Command to pause the strategist and request human operator intervention."""

    urgency: str
    question: str
    context: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ResolveHumanBlockerCommand:
    """Command carrying the human operator's reply to unblock the strategist."""

    reply: str


@dataclass(frozen=True)
class UpdateAutonomyCommand:
    """Command to switch between staged review and full autonomy."""

    autonomy_level: AutonomyLevel
