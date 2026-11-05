from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.modules.brand.commands import (
    CreateBrandKitCommand,
    UpdateBrandKitCommand,
)
from app.modules.brand.exceptions import BrandKitNotFoundError
from app.modules.brand.service import BrandService


def test_get_or_create_default_primary_seeds_empty_kit(db_session: Session):
    service = BrandService(db_session)

    # 1. First call on empty DB creates a completely blank primary kit
    kit = service.get_or_create_default_primary()

    assert kit.id is not None
    assert kit.name == ""
    assert kit.is_primary is True
    assert kit.tagline == ""
    assert kit.description == ""
    assert kit.tone_traits == []
    assert kit.banned_words == []
    assert kit.target_personas == []
    assert kit.value_props == []

    # 2. Subsequent call returns existing primary kit without duplicating
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
            name="Custom Brand",
            tagline="New Updated Tagline",
            tone_traits=["authoritative", "minimal"],
            banned_words=["synergy", "paradigm"],
            pricing_summary="Free for individuals, $49/mo team",
            key_links=[{"title": "Pricing", "url": "https://example.com/pricing"}],
        )
    )

    assert updated.name == "Custom Brand"
    assert updated.tagline == "New Updated Tagline"
    assert "authoritative" in updated.tone_traits
    assert "synergy" in updated.banned_words
    assert updated.pricing_summary == "Free for individuals, $49/mo team"
    assert len(updated.key_links) == 1


def test_to_prompt_context_with_empty_and_populated_kit(db_session: Session):
    service = BrandService(db_session)
    empty_kit = service.get_or_create_default_primary()

    # 1. Empty kit returns safe unconfigured notice
    assert empty_kit.to_prompt_context() == "No official Brand Kit configured yet."

    # 2. Populated kit compiles into structured instruction block
    service.update_brand_kit(
        UpdateBrandKitCommand(
            brand_kit_id=empty_kit.id,
            name="Acme AI",
            tagline="Autonomous marketing agent",
            website_url="https://acme.ai",
            tone_traits=["punchy", "direct"],
            banned_words=["delve", "leverage"],
            target_personas=[
                {"title": "Solo Founders", "pain_points": ["No time"], "pitch_angle": "Automate now"}
            ],
            key_links=[{"title": "Docs", "url": "https://acme.ai/docs"}],
        )
    )

    db_session.refresh(empty_kit)
    context_str = empty_kit.to_prompt_context()

    assert "BRAND GROUND TRUTH: ACME AI" in context_str
    assert "https://acme.ai" in context_str
    assert "punchy, direct" in context_str
    assert "delve, leverage" in context_str
    assert "Solo Founders" in context_str
    assert "Docs: https://acme.ai/docs" in context_str
