import asyncio
import json
import logging
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any

from app.modules.connectors.exceptions import (
    ConnectorAuthFailedError,
    ConnectorRateLimitError,
)
from app.modules.connectors.models import DataConnector
from app.modules.connectors.providers.base import BaseConnectorProvider

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GSC_API_BASE = "https://www.googleapis.com/webmasters/v3/sites"


class GoogleSearchConsoleProvider(BaseConnectorProvider):
    """
    Connects to Google Search Console via Search Analytics API.
    Identifies high-impression, low-CTR keywords ranking in positions 4-20.
    """

    def __init__(self, connector: DataConnector, credentials: dict[str, str | None]):
        super().__init__(connector, credentials)
        self.access_token = credentials.get("access_token")
        self.refresh_token = credentials.get("refresh_token")
        self.client_id = credentials.get("client_id")
        self.client_secret = credentials.get("client_secret")

    async def _refresh_access_token_if_needed(self) -> str:
        """Refreshes Google OAuth access token using refresh token if available."""
        if self.access_token and not self.refresh_token:
            return self.access_token

        if not (self.refresh_token and self.client_id and self.client_secret):
            if self.access_token:
                return self.access_token
            raise ConnectorAuthFailedError(
                self.connector.name,
                "Missing OAuth refresh token or client secret for Google Search Console.",
            )

        def _do_refresh() -> str:
            payload = urllib.parse.urlencode({
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
            }).encode("utf-8")

            req = urllib.request.Request(GOOGLE_TOKEN_URL, data=payload, method="POST")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("access_token", "")

        try:
            new_token = await asyncio.to_thread(_do_refresh)
            self.access_token = new_token
            return new_token
        except Exception as exc:
            raise ConnectorAuthFailedError(
                self.connector.name, f"Failed to refresh Google token: {exc}"
            ) from exc

    async def test_connection(self) -> bool:
        """Verifies API access by querying site verification status."""
        token = await self._refresh_access_token_if_needed()
        site_url_encoded = urllib.parse.quote(self.connector.target_identifier, safe="")
        endpoint = f"{GSC_API_BASE}/{site_url_encoded}"

        def _check() -> bool:
            req = urllib.request.Request(endpoint, method="GET")
            req.add_header("Authorization", f"Bearer {token}")
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.status == 200

        try:
            return await asyncio.to_thread(_check)
        except urllib.error.HTTPError as http_err:
            if http_err.code in (401, 403):
                raise ConnectorAuthFailedError(
                    self.connector.name,
                    f"Google API access denied ({http_err.code}). Verify Search Console permissions.",
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
        """
        Pulls Search Analytics for the last 28 days, filters queries ranking in
        positions 4.0-20.0 with high impressions, and ranks by potential value.
        """
        token = await self._refresh_access_token_if_needed()
        site_url_encoded = urllib.parse.quote(self.connector.target_identifier, safe="")
        endpoint = f"{GSC_API_BASE}/{site_url_encoded}/searchAnalytics/query"

        end_date = datetime.now(UTC).date() - timedelta(days=2)
        start_date = end_date - timedelta(days=28)

        body = {
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "dimensions": ["query", "page"],
            "rowLimit": 500,
        }

        def _fetch_rows() -> list[dict[str, Any]]:
            data_bytes = json.dumps(body).encode("utf-8")
            req = urllib.request.Request(endpoint, data=data_bytes, method="POST")
            req.add_header("Authorization", f"Bearer {token}")
            req.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req, timeout=25) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                return result.get("rows", [])

        try:
            raw_rows = await asyncio.to_thread(_fetch_rows)
        except urllib.error.HTTPError as http_err:
            if http_err.code in (401, 403):
                raise ConnectorAuthFailedError(
                    self.connector.name, "Google credentials rejected or expired."
                ) from http_err
            if http_err.code == 429:
                raise ConnectorRateLimitError(self.connector.name) from http_err
            raise

        opportunities: list[dict[str, Any]] = []

        for row in raw_rows:
            keys = row.get("keys", [])
            if len(keys) < 2:
                continue

            query = keys[0]
            page_url = keys[1]
            impressions = int(row.get("impressions", 0))
            clicks = int(row.get("clicks", 0))
            ctr = float(row.get("ctr", 0.0))
            position = round(float(row.get("position", 0.0)), 1)

            # Striking-distance filter: Rank 4 to 20 with decent volume
            if 3.5 <= position <= 20.0 and impressions >= min_impressions:
                # Priority score: Higher impressions + lower position + low CTR = bigger opportunity
                position_weight = max(1.0, 21.0 - position)
                score = round(min(100.0, (impressions / 20.0) * (1.0 - ctr) * (position_weight / 5.0)), 1)

                opportunities.append({
                    "query": query,
                    "page_url": page_url,
                    "impressions": impressions,
                    "clicks": clicks,
                    "ctr": round(ctr, 3),
                    "position": position,
                    "opportunity_type": "striking_distance",
                    "score": score,
                })

        opportunities.sort(key=lambda x: x["score"], reverse=True)
        return opportunities[:limit]
