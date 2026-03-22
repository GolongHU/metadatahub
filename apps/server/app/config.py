from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://metadatahub:metadatahub@localhost:5432/metadatahub"
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret_key: str = "change-me-in-production-use-256-bit-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # AI — Anthropic (default) or any OpenAI-compatible provider
    anthropic_api_key: str = ""
    ai_model: str = "claude-sonnet-4-20250514"
    ai_base_url: str = ""   # e.g. https://api.moonshot.cn/v1 for Kimi
    ai_api_key: str = ""    # used when ai_base_url is set

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173"

    # Uploads
    upload_dir: str = "uploads"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


settings = Settings()
