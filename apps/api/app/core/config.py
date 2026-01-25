from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str = "your-secret-key-change-in-production"  # Default for development

    class Config:
        env_file = ".env"

settings = Settings()