from uuid import UUID

from app.common.exceptions import AppError, ConflictError, NotFoundError


class StrategistStateNotFoundError(NotFoundError):
    """Raised when the strategist state or its dedicated ChatSession does not exist."""

    def __init__(self, identifier: UUID | str = "primary"):
        super().__init__(f"Autonomous strategist state '{identifier}' was not found.")
        self.identifier = identifier


class StrategistAlreadyRunningError(ConflictError):
    """Raised when attempting to trigger a new cycle while a cycle is already running."""

    def __init__(self) -> None:
        super().__init__(
            "Autonomous strategist is already executing an active cycle. Please wait for it to finish."
        )


class StrategistNotWaitingForHumanError(ConflictError):
    """Raised when submitting a human reply when the strategist has no pending blocker."""

    def __init__(self, current_status: str):
        super().__init__(
            f"Strategist is currently '{current_status}' and is not waiting for human input."
        )
        self.current_status = current_status


class InvalidSleepDurationError(AppError):
    """Raised when an invalid sleep duration is requested."""

    def __init__(self, duration_minutes: int):
        super().__init__(
            f"Invalid sleep duration ({duration_minutes}m). Must be between 30 and 180 minutes."
        )
        self.duration_minutes = duration_minutes
