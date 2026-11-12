from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    """Application settings configured via environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # App Environment
    APP_NAME: str = "Mireva"
    DEBUG: bool = False

    # Database Configuration (Supabase / PostgreSQL)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

    # Database Connection Pool Settings
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 5

    # AI Model Gateways & Security
    OPENROUTER_API_KEY: SecretStr = SecretStr("")
    FIREWORKS_API_KEY: SecretStr = SecretStr("")
    SECRET_KEY: SecretStr = SecretStr("default-dev-secret-key-32-bytes!")


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance parsed once at startup."""
    return Settings()


settings = get_settings()