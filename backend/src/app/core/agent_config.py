import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ModelConfig:
    id: str
    name: str
    description: str
    badge: str | None = None


@dataclass(frozen=True)
class AgentSettings:
    """Runtime configuration for LLM orchestration and Pydantic AI."""

    DEFAULT_MODEL: str = os.getenv("AGENT_MODEL", "deepseek/deepseek-v4-flash-0731")
    REASONING_MODEL: str = os.getenv("AGENT_REASONING_MODEL", "deepseek/deepseek-v4.1-flash")

    AVAILABLE_MODELS: tuple[ModelConfig, ...] = (
        ModelConfig(
            id="deepseek/deepseek-v4-flash-0731",
            name="DeepSeek V4 Flash",
            description="Fast autonomous tool execution & copywriting",
            badge="DEFAULT",
        ),
        ModelConfig(
            id="deepseek/deepseek-v4.1-flash",
            name="DeepSeek V4.1 Flash",
            description="Next-gen agentic reasoning & native multimodal",
            badge="FAST",
        ),
        ModelConfig(
            id="deepseek/deepseek-v4-pro-0813",
            name="DeepSeek V4 Pro",
            description="Deep chain-of-thought strategy & complex reasoning",
            badge="PRO",
        ),
        ModelConfig(
            id="anthropic/claude-3.5-sonnet",
            name="Claude 3.5 Sonnet",
            description="High-nuance brand strategy & long-form threads",
            badge="PRO",
        ),
        ModelConfig(
            id="openai/gpt-4o",
            name="GPT-4o",
            description="Multi-channel campaign reasoning",
        ),
    )


agent_settings = AgentSettings()
