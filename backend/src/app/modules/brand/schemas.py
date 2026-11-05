from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.brand.commands import (
    CreateBrandKitCommand,
    UpdateBrandKitCommand,
)


class BrandKitCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=150, examples=["Orlume"])
    tagline: str | None = Field(None, max_length=255, examples=["AI Website Builder & Autonomous Marketing Agent"])
    description: str | None = Field(None, max_length=5000)
    website_url: str | None = Field(None, max_length=255, examples=["https://orlume.site"])
    industry: str | None = Field(None, max_length=100, examples=["Developer Tools / SaaS"])
    is_primary: bool = Field(default=True)
    tone_traits: list[str] = Field(default_factory=lambda: ["punchy", "authentic", "direct", "no-fluff"])
    banned_words: list[str] = Field(default_factory=lambda: ["delve", "leverage", "game-changer", "unleash"])
    preferred_phrases: list[str] = Field(default_factory=list)
    emoji_policy: str = Field(default="minimal")
    target_personas: list[dict[str, Any]] = Field(default_factory=list)
    value_props: list[dict[str, Any]] = Field(default_factory=list)
    competitor_advantages: list[dict[str, Any]] = Field(default_factory=list)
    pricing_summary: str | None = Field(None, max_length=1000)
    key_links: list[dict[str, str]] = Field(default_factory=list)
    extra_metadata: dict[str, Any] = Field(default_factory=dict)

    def to_command(self) -> CreateBrandKitCommand:
        return CreateBrandKitCommand(**self.model_dump())


class BrandKitUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=150)
    tagline: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=5000)
    website_url: str | None = Field(None, max_length=255)
    industry: str | None = Field(None, max_length=100)
    is_primary: bool | None = None
    tone_traits: list[str] | None = None
    banned_words: list[str] | None = None
    preferred_phrases: list[str] | None = None
    emoji_policy: str | None = None
    target_personas: list[dict[str, Any]] | None = None
    value_props: list[dict[str, Any]] | None = None
    competitor_advantages: list[dict[str, Any]] | None = None
    pricing_summary: str | None = Field(None, max_length=1000)
    key_links: list[dict[str, str]] | None = None
    extra_metadata: dict[str, Any] | None = None

    def to_command(self, brand_kit_id: UUID) -> UpdateBrandKitCommand:
        return UpdateBrandKitCommand(
            brand_kit_id=brand_kit_id,
            **self.model_dump(exclude_unset=True),
        )


class BrandKitResponse(BaseModel):
    id: UUID
    name: str
    tagline: str | None = None
    description: str | None = None
    website_url: str | None = None
    industry: str | None = None
    is_primary: bool
    tone_traits: list[str]
    banned_words: list[str]
    preferred_phrases: list[str]
    emoji_policy: str
    target_personas: list[dict[str, Any]]
    value_props: list[dict[str, Any]]
    competitor_advantages: list[dict[str, Any]]
    pricing_summary: str | None = None
    key_links: list[dict[str, str]]
    extra_metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
