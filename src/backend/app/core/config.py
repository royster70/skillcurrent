from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:pass@localhost:5432/workforce_ai"
    onet_version: str = "28.1"
    onet_data_path: str = r"C:\Users\royst\Projects\Data\ONet"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
