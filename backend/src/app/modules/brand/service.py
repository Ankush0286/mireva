from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.brand.commands import (
    CreateBrandKitCommand,
    UpdateBrandKitCommand,
)
from app.modules.brand.exceptions import BrandKitNotFoundError
from app.modules.brand.models import BrandKit


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class BrandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, brand_kit_id: UUID | str) -> BrandKit | None:
        target_id = _ensure_uuid(brand_kit_id)
        stmt = select(BrandKit).where(BrandKit.id == target_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_id_or_raise(self, brand_kit_id: UUID | str) -> BrandKit:
        kit = await self.get_by_id(brand_kit_id)
        if not kit:
            raise BrandKitNotFoundError(brand_kit_id)
        return kit

    async def get_primary_brand_kit(self) -> BrandKit | None:
        stmt = (
            select(BrandKit)
            .where(BrandKit.is_primary.is_(True))
            .order_by(BrandKit.updated_at.desc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_or_create_default_primary(self) -> BrandKit:
        primary = await self.get_primary_brand_kit()
        if primary:
            return primary

        empty_kit = BrandKit(
            name="",
            tagline="",
            description="",
            website_url="",
            industry="",
            is_primary=True,
            tone_traits=[],
            banned_words=[],
            preferred_phrases=[],
            emoji_policy="minimal",
            target_personas=[],
            value_props=[],
            competitor_advantages=[],
            pricing_summary="",
            key_links=[],
        )
        self.db.add(empty_kit)
        await self.db.commit()
        await self.db.refresh(empty_kit)
        return empty_kit

    async def get_active_brand_context(self) -> str:
        kit = await self.get_primary_brand_kit()
        return kit.to_prompt_context() if kit else ""

    async def create_brand_kit(self, cmd: CreateBrandKitCommand) -> BrandKit:
        if cmd.is_primary:
            await self.db.execute(update(BrandKit).values(is_primary=False))

        kit = BrandKit(
            name=cmd.name.strip(),
            tagline=cmd.tagline,
            description=cmd.description,
            website_url=cmd.website_url,
            industry=cmd.industry,
            is_primary=cmd.is_primary,
            tone_traits=cmd.tone_traits,
            banned_words=cmd.banned_words,
            preferred_phrases=cmd.preferred_phrases,
            emoji_policy=cmd.emoji_policy,
            target_personas=cmd.target_personas,
            value_props=cmd.value_props,
            competitor_advantages=cmd.competitor_advantages,
            pricing_summary=cmd.pricing_summary,
            key_links=cmd.key_links,
            extra_metadata=cmd.extra_metadata,
        )
        self.db.add(kit)
        await self.db.commit()
        await self.db.refresh(kit)
        return kit

    async def update_brand_kit(self, cmd: UpdateBrandKitCommand) -> BrandKit:
        kit = await self.get_by_id_or_raise(cmd.brand_kit_id)

        if cmd.is_primary is True:
            await self.db.execute(
                update(BrandKit).where(BrandKit.id != kit.id).values(is_primary=False)
            )
            kit.is_primary = True

        if cmd.name is not None:
            kit.name = cmd.name.strip()
        if cmd.tagline is not None:
            kit.tagline = cmd.tagline
        if cmd.description is not None:
            kit.description = cmd.description
        if cmd.website_url is not None:
            kit.website_url = cmd.website_url
        if cmd.industry is not None:
            kit.industry = cmd.industry
        if cmd.tone_traits is not None:
            kit.tone_traits = cmd.tone_traits
        if cmd.banned_words is not None:
            kit.banned_words = cmd.banned_words
        if cmd.preferred_phrases is not None:
            kit.preferred_phrases = cmd.preferred_phrases
        if cmd.emoji_policy is not None:
            kit.emoji_policy = cmd.emoji_policy
        if cmd.target_personas is not None:
            kit.target_personas = cmd.target_personas
        if cmd.value_props is not None:
            kit.value_props = cmd.value_props
        if cmd.competitor_advantages is not None:
            kit.competitor_advantages = cmd.competitor_advantages
        if cmd.pricing_summary is not None:
            kit.pricing_summary = cmd.pricing_summary
        if cmd.key_links is not None:
            kit.key_links = cmd.key_links
        if cmd.extra_metadata is not None:
            kit.extra_metadata = cmd.extra_metadata

        await self.db.commit()
        await self.db.refresh(kit)
        return kit
