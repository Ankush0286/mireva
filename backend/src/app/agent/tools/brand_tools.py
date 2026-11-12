from typing import Any

from pydantic_ai import RunContext

from app.agent.llm import AgentDeps, marketing_agent
from app.modules.brand.service import BrandService


@marketing_agent.tool
async def get_brand_knowledge(
    ctx: RunContext[AgentDeps],
    section: str | None = None,
) -> dict[str, Any]:
    """
    Fetches the company's official Brand Kit ground truth.
    Call this tool before drafting social posts, campaigns, cold DMs, or planning
    outreach to ensure authentic messaging, accurate positioning, and adherence to
    voice & tone guidelines.

    Optional section filter: 'tone', 'personas', 'value_props', 'battlecards', 'all'
    """
    async with ctx.deps.db_session_scope() as db:
        service = BrandService(db)
        kit = await service.get_or_create_default_primary()

        clean_sec = (section or "all").lower().strip()

        if clean_sec in ("tone", "voice"):
            return {
                "brand_name": kit.name,
                "tone_traits": kit.tone_traits,
                "banned_words_never_use": kit.banned_words,
                "preferred_phrases": kit.preferred_phrases,
                "emoji_policy": kit.emoji_policy,
            }

        if clean_sec in ("personas", "audience"):
            return {
                "brand_name": kit.name,
                "target_personas": kit.target_personas,
                "industry": kit.industry,
            }

        if clean_sec in ("battlecards", "competitors"):
            return {
                "brand_name": kit.name,
                "competitor_advantages": kit.competitor_advantages,
                "pricing_reference": kit.pricing_summary,
            }

        return {
            "brand_name": kit.name,
            "tagline": kit.tagline,
            "website_url": kit.website_url,
            "industry": kit.industry,
            "core_description": kit.description,
            "tone_traits": kit.tone_traits,
            "banned_words_never_use": kit.banned_words,
            "preferred_phrases": kit.preferred_phrases,
            "target_personas": kit.target_personas,
            "value_propositions": kit.value_props,
            "competitor_advantages": kit.competitor_advantages,
            "pricing_reference": kit.pricing_summary,
            "key_links": kit.key_links,
        }
