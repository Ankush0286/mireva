from app.common.enums import ConnectorType
from app.modules.connectors.models import DataConnector
from app.modules.connectors.providers.ahrefs import AhrefsProvider
from app.modules.connectors.providers.base import BaseConnectorProvider
from app.modules.connectors.providers.google_search_console import (
    GoogleSearchConsoleProvider,
)

PROVIDER_MAP: dict[ConnectorType, type[BaseConnectorProvider]] = {
    ConnectorType.GOOGLE_SEARCH_CONSOLE: GoogleSearchConsoleProvider,
    ConnectorType.AHREFS: AhrefsProvider,
    ConnectorType.DATAFORSEO: AhrefsProvider,
}


def resolve_provider(
    connector: DataConnector,
    credentials: dict[str, str | None],
) -> BaseConnectorProvider:
    """Instantiates the appropriate provider adapter for a DataConnector."""
    provider_cls = PROVIDER_MAP.get(connector.connector_type)
    if not provider_cls:
        raise ValueError(
            f"No provider adapter registered for connector type '{connector.connector_type.value}'"
        )
    return provider_cls(connector, credentials)


__all__ = [
    "BaseConnectorProvider",
    "GoogleSearchConsoleProvider",
    "AhrefsProvider",
    "resolve_provider",
]
