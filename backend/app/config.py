from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Финансовая статистика"
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/finance_dashboard"
    )
    frontend_url: str = "http://127.0.0.1:3101"
    frontend_port: int = 3101
    start_frontend: bool = True
    backend_host: str = "127.0.0.1"
    backend_port: int = 8001

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
