from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-secret-cambia-esto"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./remember.db"
    secret_key: str = DEV_SECRET
    access_token_minutes: int = 60 * 24 * 7
    # Una o varias URLs del frontend separadas por coma (CORS). La primera se usa en los enlaces de los correos.
    frontend_url: str = "http://localhost:5173"
    cloudinary_url: str | None = None
    max_upload_mb: int = 25
    upload_dir: str = "uploads"

    @field_validator("database_url")
    @classmethod
    def use_psycopg3(cls, v: str) -> str:
        # Railway/Heroku dan "postgres://…" o "postgresql://…"; SQLAlchemy necesita el driver explícito.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_url.split(",") if o.strip()]

    @property
    def public_url(self) -> str:
        return self.origins[0]

    @property
    def is_production(self) -> bool:
        return not self.database_url.startswith("sqlite")


settings = Settings()

if settings.is_production and settings.secret_key == DEV_SECRET:
    raise RuntimeError("Falta la variable SECRET_KEY en producción.")
