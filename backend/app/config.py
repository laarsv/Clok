"""Application configuration loaded from environment variables."""
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720
    timezone: str = "Europe/Berlin"

    postgres_user: str = "clok"
    postgres_password: str = "clok"
    postgres_db: str = "clok"
    postgres_host: str = "db"
    postgres_port: int = 5432

    # Brevo / Mailing
    brevo_api_key: str = ""
    email_from: str = "Clok <clok@mail.example.com>"
    email_reply_to: str = ""
    app_base_url: str = "https://clok.example.com"

    # Google OAuth (Login via Google Workspace). Leer ⇒ Google-Login deaktiviert.
    google_client_id: str = ""
    google_client_secret: str = ""
    # Nur Accounts dieser Workspace-Domain dürfen sich per Google anmelden.
    google_allowed_domain: str = "koenigswege.com"
    # JIT: neu per Google auftauchende Nutzer werden als Mitarbeiter dieses
    # Arbeitgebers (Login-E-Mail) angelegt. Leer ⇒ keine Auto-Anlage (unbekannte
    # Nutzer werden abgewiesen).
    google_jit_supervisor_email: str = ""

    # Onboarding
    employer_invite_ttl_days: int = 14
    public_signup_enabled: bool = False  # vorbereitet, nicht aktiv – siehe docs/onboarding-flow.md §11

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def email_dev_mode(self) -> bool:
        return not self.brevo_api_key.strip()

    @property
    def google_oauth_enabled(self) -> bool:
        return bool(self.google_client_id.strip() and self.google_client_secret.strip())

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.app_base_url.rstrip('/')}/api/auth/google/callback"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
