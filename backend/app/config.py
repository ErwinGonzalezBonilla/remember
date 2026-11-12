import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-secret-cambia-esto"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./rehomi.db"
    secret_key: str = DEV_SECRET
    access_token_minutes: int = 60 * 24 * 7
    # Una o varias URLs del frontend separadas por coma (CORS). La primera se usa en los enlaces de los correos.
    frontend_url: str = "http://localhost:5173"
    cloudinary_url: str | None = None
    max_upload_mb: int = 25
    upload_dir: str = "uploads"

    # Cloudflare R2 (archivos privados con URLs firmadas). Con las cuatro primeras, se usa R2.
    r2_account_id: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket: str | None = None
    r2_url_ttl: int = 21600  # segundos que es válida, como mínimo, una URL para ver un archivo (6 h)

    # Correo: Resend (RESEND_API_KEY) o un servidor SMTP. Sin ninguno, los correos se escriben en el log (desarrollo).
    resend_api_key: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 465
    smtp_user: str | None = None
    smtp_password: str | None = None
    mail_from: str = "REHOMI <onboarding@resend.dev>"
    # Clave que Vercel Cron envía como "Authorization: Bearer …" a /api/cron/*
    cron_secret: str | None = None

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
    def uses_blob(self) -> bool:
        """Vercel Blob conectado al proyecto (Vercel añade estas variables al conectar el store)."""
        return bool(os.getenv("BLOB_STORE_ID") or os.getenv("BLOB_READ_WRITE_TOKEN"))

    @property
    def uses_r2(self) -> bool:
        return bool(self.r2_account_id and self.r2_access_key_id and self.r2_secret_access_key and self.r2_bucket)

    @property
    def on_vercel(self) -> bool:
        """En Vercel cada petición admite como mucho 4,5 MB (sin R2, las subidas pasan por aquí)."""
        return bool(os.getenv("VERCEL"))

    @property
    def mail_enabled(self) -> bool:
        return bool(self.resend_api_key or (self.smtp_host and self.smtp_user and self.smtp_password))

    @property
    def is_production(self) -> bool:
        return not self.database_url.startswith("sqlite")


settings = Settings()

if settings.is_production and settings.secret_key == DEV_SECRET:
    raise RuntimeError("Falta la variable SECRET_KEY en producción.")
