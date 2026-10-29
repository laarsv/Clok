"""Application configuration loaded from environment variables."""
from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
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

    # Mailversand per SMTP. Mail gilt als eingerichtet, sobald Host, Nutzer und
    # Passwort gesetzt sind, sonst läuft das Backend im Dev-Modus (nur Log).
    # Port 587 = STARTTLS, Port 465 = TLS von Anfang an (SMTP_SECURITY=auto wählt
    # nach Port). Viele Hoster sperren ausgehend 25 und 465, dann 587 nehmen.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_security: Literal["auto", "starttls", "ssl"] = "auto"
    # Absender: reine Adresse oder "Name <adresse>"; leer = SMTP_USER. Der Hoster
    # erlaubt meist nur eigene Adressen.
    email_from: str = "Clok <clok@mail.example.com>"
    email_reply_to: str = ""
    app_base_url: str = "https://clok.example.com"
    vrwb_admin_feedback_url: str = ""
    vrwb_admin_feedback_token: str = ""

    # Google OAuth (Login via Google Workspace). Leer ⇒ Google-Login deaktiviert.
    google_client_id: str = ""
    google_client_secret: str = ""
    # Nur Accounts dieser Workspace-Domain dürfen sich per Google anmelden.
    google_allowed_domain: str = "koenigswege.com"
    # JIT-Provisionierung neuer Google-Nutzer der Domain:
    #   "employer" → als Arbeitgeber (kein Supervisor, direkt aktiv)
    #   "employee" → als Mitarbeiter unter GOOGLE_JIT_SUPERVISOR_EMAIL
    #   ""         → aus: unbekannte Nutzer werden abgewiesen
    google_jit_role: str = ""
    # Nur für google_jit_role="employee": Arbeitgeber (Login-E-Mail), unter den
    # neue Mitarbeiter gehängt werden.
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
        return not (
            self.smtp_host.strip()
            and self.smtp_user.strip()
            and self.smtp_password.get_secret_value()
        )

    @property
    def mail_from(self) -> str:
        """Absender; leer = SMTP_USER."""
        return self.email_from.strip() or self.smtp_user.strip()

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
