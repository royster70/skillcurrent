from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/workforce_ai"
    onet_version: str = "28.1"
    onet_data_path: str = r"C:\Users\royst\Projects\Data\ONet"
    anthropic_auth_token: str = ""  # Set ANTHROPIC_AUTH_TOKEN in .env for AI classification
    pipeline_auto_run: bool = False
    pipeline_schedule_cron: str = "0 2 * * 0"  # Sunday 2am

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


def get_settings() -> "Settings":
    return Settings()


settings = Settings()
