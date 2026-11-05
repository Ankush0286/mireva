from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class CreateBrandKitCommand:
    name: str
    tagline: str | None = None
    description: str | None = None
    website_url: str | None = None
    industry: str | None = None
    is_primary: bool = True
    tone_traits: list[str] = field(default_factory=lambda: ["punchy", "authentic", "direct", "no-fluff"])
    banned_words: list[str] = field(default_factory=lambda: ["delve", "leverage", "game-changer", "unleash"])
    preferred_phrases: list[str] = field(default_factory=list)
    emoji_policy: str = "minimal"
    target_personas: list[dict[str, Any]] = field(default_factory=list)
    value_props: list[dict[str, Any]] = field(default_factory=list)
    competitor_advantages: list[dict[str, Any]] = field(default_factory=list)
    pricing_summary: str | None = None
    key_links: list[dict[str, str]] = field(default_factory=list)
    extra_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class UpdateBrandKitCommand:
    brand_kit_id: UUID
    name: str | None = None
    tagline: str | None = None
    description: str | None = None
    website_url: str | None = None
    industry: str | None = None
    is_primary: bool | None = None
    tone_traits: list[str] | None = None
    banned_words: list[str] | None = None
    preferred_phrases: list[str] | None = None
    emoji_policy: str | None = None
    target_personas: list[dict[str, Any]] | None = None
    value_props: list[dict[str, Any]] | None = None
    competitor_advantages: list[dict[str, Any]] | None = None
    pricing_summary: str | None = None
    key_links: list[dict[str, str]] | None = None
    extra_metadata: dict[str, Any] | None = None
