from uuid import UUID

from app.common.exceptions import (
    AppError,
    AuthenticationFailedError,
    ConflictError,
    NotFoundError,
    RateLimitExceededError,
)


class ConnectorNotFoundError(NotFoundError):
    """Raised when a connector UUID does not exist."""

    def __init__(self, connector_id: UUID | str):
        super().__init__(f"Data connector with ID '{connector_id}' was not found.")
        self.connector_id = connector_id


class ConnectorAlreadyExistsError(ConflictError):
    """Raised when registering an already connected provider and property."""

    def __init__(self, connector_type: str, target: str):
        super().__init__(
            f"Connector '{connector_type}' for target '{target}' is already registered."
        )
        self.connector_type = connector_type
        self.target = target


class ConnectorAuthFailedError(AuthenticationFailedError):
    """Raised when an external API rejects authentication tokens or API keys."""

    def __init__(self, connector_name: str, detail: str = "Invalid credentials"):
        super().__init__(f"Authentication failed for data connector '{connector_name}': {detail}")
        self.connector_name = connector_name


class ConnectorRateLimitError(RateLimitExceededError):
    """Raised when upstream API provider (e.g., Ahrefs, GSC) rate limits queries."""

    def __init__(self, connector_name: str, retry_after: int = 60):
        super().__init__(
            f"Rate limit exceeded on '{connector_name}'. Retry in {retry_after} seconds."
        )
        self.connector_name = connector_name
        self.retry_after = retry_after


class InvalidConnectorConfigError(AppError):
    """Raised when configuration parameters or target identifiers are malformed."""

    def __init__(self, message: str = "Invalid connector configuration provided."):
        super().__init__(message)
