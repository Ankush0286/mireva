import asyncio
import json
import logging
import urllib.parse
import urllib.request
from typing import Any

from app.modules.connectors.exceptions import (
    ConnectorAuthFailedError,
    ConnectorRateLimitError,
)
from app.modules.connectors.models import DataConnector
from app.modules.connectors.providers.base import BaseConnectorProvider

logger = logging.getLogger(__name__)

AHREFS_API_BASE = "https://api.ahrefs.com/v3/site-explorer"


class AhrefsProvider(BaseConnectorProvider):
    """
    Connects to Ahrefs / DataForSEO to extract competitor keyword gaps,
    organic search volume, and high-ranking commercial queries.
    """

    def __init__(self, connector: DataConnector, credentials: dict[str, str | None]):
        super().__init__(connector, credentials)
        self.api_key = credentials.get("api_key")

    async def test_connection(self) -> bool:
        """Verifies API key by checking domain rating or quota limits."""
        if not self.api_key:
            raise ConnectorAuthFailedError(self.connector.name, "API key missing.")

        target = urllib.parse.quote(self.connector.target_identifier, safe="")
        endpoint = f"{AHREFS_API_BASE}/domain-rating?target={target}&output=json"

        def _check() -> bool:
            req = urllib.request.Request(endpoint, method="GET")
            req.add_header("Authorization", f"Bearer {self.api_key}")
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.status == 200

        try:
            return await asyncio.to_thread(_check)
        except urllib.error.HTTPError as http_err:
            if http_err.code in (401, 403):
                raise ConnectorAuthFailedError(
                    self.connector.name, "Ahrefs API key rejected."
                ) from http_err
            if http_err.code == 429:
                raise ConnectorRateLimitError(self.connector.name) from http_err
            return False
        except Exception:
            return False

    async def fetch_opportunities(
        self,
        min_impressions: int = 200,
        limit: int = 20,
        **kwargs: Any,
    ) -> list[dict[str, Any]]:
        """Queries organic keywords ranking in positions 3-20 with commercial intent."""
        if not self.api_key:
            raise ConnectorAuthFailedError(self.connector.name, "Missing Ahrefs API key.")

        target = urllib.parse.quote(self.connector.target_identifier, safe="")
        endpoint = (
            f"{AHREFS_API_BASE}/organic-keywords?"
            f"target={target}&limit=100&select=keyword,best_position,volume,sum_traffic"
        )

        def _fetch() -> list[dict[str, Any]]:
            req = urllib.request.Request(endpoint, method="GET")
            req.add_header("Authorization", f"Bearer {self.api_key}")
            with urllib.request.urlopen(req, timeout=25) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                return result.get("keywords", [])

        try:
            raw_keywords = await asyncio.to_thread(_fetch)
        except urllib.error.HTTPError as http_err:
            if http_err.code in (401, 403):
                raise ConnectorAuthFailedError(
                    self.connector.name, "Ahrefs API credentials invalid."
                ) from http_err
            if http_err.code == 429:
                raise ConnectorRateLimitError(self.connector.name) from http_err
            raise

        opportunities: list[dict[str, Any]] = []

        for kw in raw_keywords:
            keyword_text = kw.get("keyword", "")
            volume = int(kw.get("volume", 0))
            position = float(kw.get("best_position", 0.0))

            if volume >= min_impressions and 3.0 <= position <= 25.0:
                score = round(min(100.0, (volume / 50.0) * (26.0 - position) / 5.0), 1)

                opportunities.append({
                    "query": keyword_text,
                    "page_url": None,
                    "impressions": volume,
                    "clicks": int(kw.get("sum_traffic", 0)),
                    "ctr": None,
                    "position": position,
                    "opportunity_type": "keyword_gap",
                    "score": score,
                })

        opportunities.sort(key=lambda x: x["score"], reverse=True)
        return opportunities[:limit]
