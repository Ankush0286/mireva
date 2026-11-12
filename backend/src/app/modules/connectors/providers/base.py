from abc import ABC, abstractmethod
from typing import Any

from app.modules.connectors.models import DataConnector


class BaseConnectorProvider(ABC):
    """
    Abstract interface for external marketing intelligence sources.
    Every provider implements authentication testing and distilled opportunity fetching.
    """

    def __init__(
        self,
        connector: DataConnector,
        credentials: dict[str, str | None],
    ):
        self.connector = connector
        self.credentials = credentials

    @abstractmethod
    async def test_connection(self) -> bool:
        """Verifies API credentials against the external provider."""
        raise NotImplementedError

    @abstractmethod
    async def fetch_opportunities(
        self,
        min_impressions: int = 200,
        limit: int = 20,
        **kwargs: Any,
    ) -> list[dict[str, Any]]:
        """
        Fetches high-signal, distilled marketing opportunities (e.g., striking distance
        keywords, competitor content gaps) rather than raw multi-megabyte metric dumps.
        """
        raise NotImplementedError
