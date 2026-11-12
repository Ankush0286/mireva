from typing import Any

from pydantic_ai import RunContext

from app.agent.llm import AgentDeps, marketing_agent
from app.common.enums import ConnectorType
from app.common.exceptions import AppError
from app.modules.connectors.service import ConnectorService


@marketing_agent.tool
async def list_marketing_data_sources(
    ctx: RunContext[AgentDeps],
    active_only: bool = True,
) -> list[dict[str, Any]]:
    """
    Lists all connected external marketing data sources (Google Search Console,
    Ahrefs, GA4, PostHog, etc.) and their health status.
    """
    async with ctx.deps.db_session_scope() as db:
        service = ConnectorService(db)
        connectors = await service.list_connectors(active_only=active_only)

        return [
            {
                "id": str(c.id),
                "name": c.name,
                "provider": c.connector_type.value,
                "target": c.target_identifier,
                "status": c.status.value,
                "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
            }
            for c in connectors
        ]


@marketing_agent.tool
async def get_search_console_opportunities(
    ctx: RunContext[AgentDeps],
    min_impressions: int = 200,
    limit: int = 10,
    site_url: str | None = None,
) -> list[dict[str, Any]]:
    """
    Pulls high-impression, low-CTR keywords from Google Search Console ranking
    between positions 4 and 20 (striking-distance content opportunities).
    """
    try:
        async with ctx.deps.db_session_scope() as db:
            service = ConnectorService(db)
            connectors = await service.list_connectors(
                connector_type=ConnectorType.GOOGLE_SEARCH_CONSOLE, active_only=True
            )

            if not connectors:
                return [
                    {"warning": "No active Google Search Console connector found in workspace."}
                ]

            target_connector = connectors[0]
            if site_url:
                for c in connectors:
                    if site_url.lower() in c.target_identifier.lower():
                        target_connector = c
                        break

            opportunities = await service.fetch_opportunities(
                connector_id=target_connector.id,
                min_impressions=min_impressions,
                limit=limit,
            )

            return [opp.model_dump() for opp in opportunities]
    except (AppError, Exception) as exc:
        return [{"error": str(exc)}]


@marketing_agent.tool
async def get_competitor_keyword_gaps(
    ctx: RunContext[AgentDeps],
    competitor_domain: str | None = None,
    min_volume: int = 250,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Queries SEO intelligence (Ahrefs / DataForSEO) for competitor organic keywords
    with commercial intent.
    """
    try:
        async with ctx.deps.db_session_scope() as db:
            service = ConnectorService(db)
            connectors = await service.list_connectors(
                connector_type=ConnectorType.AHREFS, active_only=True
            )

            if not connectors:
                connectors = await service.list_connectors(
                    connector_type=ConnectorType.DATAFORSEO, active_only=True
                )

            if not connectors:
                return [
                    {"warning": "No active Ahrefs or DataForSEO connector configured in workspace."}
                ]

            target_connector = connectors[0]
            if competitor_domain:
                for c in connectors:
                    if competitor_domain.lower() in c.target_identifier.lower():
                        target_connector = c
                        break

            gaps = await service.fetch_opportunities(
                connector_id=target_connector.id,
                min_impressions=min_volume,
                limit=limit,
            )

            return [item.model_dump() for item in gaps]
    except (AppError, Exception) as exc:
        return [{"error": str(exc)}]
