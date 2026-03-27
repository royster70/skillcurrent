from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/workforce_ai"
    onet_version: str = "28.1"
    onet_data_path: str = r"C:\Users\royst\Projects\Data\ONet"
    anthropic_auth_token: str = ""  # Set ANTHROPIC_AUTH_TOKEN in .env for AI classification
    enable_request_logging: bool = False  # Log API requests to api_request_log (ADR-007)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
