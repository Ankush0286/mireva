from typing import Any

from sqlalchemy import JSON, Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base_models import AuditBase


class BrandKit(AuditBase):
    """
    Central ground-truth knowledge repository defining the company's product,
    tone of voice, target buyer personas, value propositions, and positioning.
    Injected dynamically into the AI Copilot on demand via tools.
    """

    __tablename__ = "brand_kits"

    # Core Identity (Starts completely blank)
    name: Mapped[str] = mapped_column(String(150), default="", nullable=False, index=True)
    tagline: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Primary flag (used by default across all autonomous workers)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Tone of Voice Guidelines (Empty defaults)
    tone_traits: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    banned_words: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    preferred_phrases: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    emoji_policy: Mapped[str] = mapped_column(
        String(50),
        default="minimal",
        nullable=False,
    )

    # Target Audience & Buyer Personas
    target_personas: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    # Value Propositions & Feature Battlecards
    value_props: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    competitor_advantages: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    pricing_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Essential Reference Links (Pricing, Docs, Booking)
    key_links: Mapped[list[dict[str, str]]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )

    extra_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )

    def to_prompt_context(self) -> str:
        """
        Compiles configured brand guidelines into a concise, token-efficient
        instruction block for the AI agent.
        """
        if not self.name.strip():
            return "No official Brand Kit configured yet."

        lines = [
            f"=== BRAND GROUND TRUTH: {self.name.upper()} ===",
            f"Tagline: {self.tagline or 'N/A'}",
            f"Website: {self.website_url or 'N/A'}",
            f"Industry: {self.industry or 'N/A'}",
            f"Core Description: {self.description or 'N/A'}",
            "",
            f"Tone Guidelines: {', '.join(self.tone_traits) if self.tone_traits else 'Authentic, concise, direct'}",
            f"Banned Words/Fluff to NEVER use: {', '.join(self.banned_words) if self.banned_words else 'None'}",
            f"Emoji Policy: {self.emoji_policy}",
        ]

        if self.preferred_phrases:
            lines.append(f"Preferred Phrases: {', '.join(self.preferred_phrases)}")

        if self.target_personas:
            lines.append("\nTarget Buyer Personas:")
            for p in self.target_personas[:4]:
                title = p.get("title", "Persona")
                pains = ", ".join(p.get("pain_points", []))
                pitch = p.get("pitch_angle", "")
                lines.append(f"- {title}: Pain points: [{pains}]. Pitch angle: '{pitch}'")

        if self.value_props:
            lines.append("\nCore Value Propositions:")
            for vp in self.value_props[:4]:
                f_name = vp.get("feature", "")
                b_name = vp.get("benefit", "")
                lines.append(f"- {f_name} -> {b_name}")

        if self.competitor_advantages:
            lines.append("\nCompetitor Battlecards & Why We Win:")
            for comp in self.competitor_advantages[:3]:
                c_name = comp.get("competitor", "Competitor")
                adv = comp.get("why_we_win", "")
                lines.append(f"- vs {c_name}: {adv}")

        if self.pricing_summary:
            lines.append(f"\nPricing Reference: {self.pricing_summary}")

        if self.key_links:
            links_str = ", ".join(
                [
                    f"{link.get('title')}: {link.get('url')}"
                    for link in self.key_links
                    if link.get("url")
                ]
            )
            if links_str:
                lines.append(f"Key Reference Links: {links_str}")

        lines.append("==================================================")
        return "\n".join(lines)
