from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.modules.brand.commands import (
    CreateBrandKitCommand,
    UpdateBrandKitCommand,
)
from app.modules.brand.exceptions import BrandKitNotFoundError
from app.modules.brand.service import BrandService


def test_get_or_create_default_primary_seeds_orlume(db_session: Session):
    service = BrandService(db_session)

    # 1. First call on empty DB automatically seeds default Orlume kit
    kit = service.get_or_create_default_primary()

    assert kit.id is not None
    assert kit.name == "Orlume"
    assert kit.is_primary is True
    assert "https://orlume.site" in (kit.website_url or "")
    assert "punchy" in kit.tone_traits
    assert "delve" in kit.banned_words
    assert len(kit.target_personas) >= 1

    # 2. Subsequent call returns the existing primary kit without duplicating
    kit2 = service.get_or_create_default_primary()
    assert kit2.id == kit.id


def test_create_new_primary_kit_unsets_previous_primary(db_session: Session):
    service = BrandService(db_session)
    primary1 = service.get_or_create_default_primary()
    assert primary1.is_primary is True

    # Create new primary brand kit
    primary2 = service.create_brand_kit(
        CreateBrandKitCommand(
            name="Sub-Brand DevTools",
            tagline="CLI tools for developers",
            is_primary=True,
            tone_traits=["direct", "technical"],
        )
    )

    db_session.refresh(primary1)
    assert primary1.is_primary is False  # Automatically unset!
    assert primary2.is_primary is True


def test_get_by_id_or_raise_not_found(db_session: Session):
    service = BrandService(db_session)
    with pytest.raises(BrandKitNotFoundError):
        service.get_by_id_or_raise(uuid4())


def test_update_brand_kit_fields(db_session: Session):
    service = BrandService(db_session)
    kit = service.get_or_create_default_primary()

    updated = service.update_brand_kit(
        UpdateBrandKitCommand(
            brand_kit_id=kit.id,
            tagline="New Updated Tagline",
            tone_traits=["authoritative", "minimal"],
            banned_words=["synergy", "paradigm"],
            pricing_summary="Free for individuals, $49/mo team",
            key_links=[{"title": "Pricing", "url": "https://orlume.site/pricing"}],
        )
    )

    assert updated.tagline == "New Updated Tagline"
    assert "authoritative" in updated.tone_traits
    assert "synergy" in updated.banned_words
    assert updated.pricing_summary == "Free for individuals, $49/mo team"
    assert len(updated.key_links) == 1


def test_to_prompt_context_compiles_instruction_block(db_session: Session):
    service = BrandService(db_session)
    kit = service.get_or_create_default_primary()

    context_str = kit.to_prompt_context()

    assert "BRAND GROUND TRUTH: ORLUME" in context_str
    assert "https://orlume.site" in context_str
    assert "Tone Guidelines:" in context_str
    assert "Banned Words/Fluff to NEVER use:" in context_str
    assert "delve" in context_str
    assert "Target Buyer Personas:" in context_str
    assert "Core Value Propositions:" in context_str
