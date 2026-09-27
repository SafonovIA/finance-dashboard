from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_env: Literal["development", "production"] = "development"
    app_name: str = "Финансовая статистика"
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/finance_dashboard"
    )
    frontend_url: str = "http://127.0.0.1:3101"
    frontend_port: int = 3101
    start_frontend: bool = True
    backend_host: str = "127.0.0.1"
    backend_port: int = 8001
    public_base_url: str = "http://127.0.0.1:8001"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_sender: str = ""
    smtp_use_ssl: bool = False

    @model_validator(mode="after")
    def validate_production(self):
        if self.app_env == "production":
            public = urlsplit(self.public_base_url)
            frontend = urlsplit(self.frontend_url)
            if public.scheme != "https" or not public.hostname:
                raise ValueError("PUBLIC_BASE_URL must be an HTTPS URL in production")
            if self.start_frontend:
                raise ValueError("START_FRONTEND must be false in production")
            if frontend.scheme != "http" or frontend.hostname not in {"127.0.0.1", "localhost", "::1"}:
                raise ValueError("FRONTEND_URL must point to a local frontend in production")
            if not self.smtp_host or not self.smtp_sender or not self.smtp_username or not self.smtp_password:
                raise ValueError("SMTP credentials are required in production")
        return self

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
