from uuid import UUID

from sqlalchemy.orm import Session

from app.modules.brand.commands import (
    CreateBrandKitCommand,
    UpdateBrandKitCommand,
)
from app.modules.brand.exceptions import BrandKitNotFoundError
from app.modules.brand.models import BrandKit


def _ensure_uuid(val: UUID | str) -> UUID:
    return val if isinstance(val, UUID) else UUID(str(val))


class BrandService:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, brand_kit_id: UUID | str) -> BrandKit | None:
        target_id = _ensure_uuid(brand_kit_id)
        return self.db.query(BrandKit).filter(BrandKit.id == target_id).first()

    def get_by_id_or_raise(self, brand_kit_id: UUID | str) -> BrandKit:
        kit = self.get_by_id(brand_kit_id)
        if not kit:
            raise BrandKitNotFoundError(brand_kit_id)
        return kit

    def get_primary_brand_kit(self) -> BrandKit | None:
        """Retrieves the active primary Brand Kit."""
        return (
            self.db.query(BrandKit)
            .filter(BrandKit.is_primary.is_(True))
            .order_by(BrandKit.updated_at.desc())
            .first()
        )

    def get_or_create_default_primary(self) -> BrandKit:
        """Returns the primary Brand Kit, creating an empty blank record if none exists."""
        primary = self.get_primary_brand_kit()
        if primary:
            return primary

        # Create completely blank record for the user to configure
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
        self.db.commit()
        self.db.refresh(empty_kit)
        return empty_kit

    def get_active_brand_context(self) -> str:
        """Returns compiled token-efficient prompt string for Pydantic AI injection."""
        kit = self.get_primary_brand_kit()
        return kit.to_prompt_context() if kit else ""

    def create_brand_kit(self, cmd: CreateBrandKitCommand) -> BrandKit:
        if cmd.is_primary:
            self.db.query(BrandKit).update({BrandKit.is_primary: False})

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
        self.db.commit()
        self.db.refresh(kit)
        return kit

    def update_brand_kit(self, cmd: UpdateBrandKitCommand) -> BrandKit:
        kit = self.get_by_id_or_raise(cmd.brand_kit_id)

        if cmd.is_primary is True:
            self.db.query(BrandKit).filter(BrandKit.id != kit.id).update({BrandKit.is_primary: False})
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

        self.db.commit()
        self.db.refresh(kit)
        return kit
