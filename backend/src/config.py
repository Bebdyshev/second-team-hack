import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator


load_dotenv()


class Settings(BaseModel):
    app_name: str = "Smart Home Resource Monitoring API"
    app_version: str = "0.1.0"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    enable_docs: bool = True
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    postgres_url: str = "postgresql+psycopg2://monitor:monitor@localhost:5432/monitoring_db"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if not isinstance(value, str) or not value.strip():
            return []
        return [origin.strip() for origin in value.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "Smart Home Resource Monitoring API"),
        app_version=os.getenv("APP_VERSION", "0.1.0"),
        environment=os.getenv("ENVIRONMENT", "development"),
        api_v1_prefix=os.getenv("API_V1_PREFIX", "/api/v1"),
        enable_docs=os.getenv("ENABLE_DOCS", "true").lower() == "true",
        cors_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000"),
        postgres_url=os.getenv(
            "POSTGRES_URL",
            "postgresql+psycopg2://monitor:monitor@localhost:5432/monitoring_db",
        ),
    )