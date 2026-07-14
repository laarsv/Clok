"""Admin CLI. Subcommands:

    upgrade-db
    bootstrap-admin --username … --email … --password …
    send-test-email --to …
"""
import typer

from app.auth import hash_password
from app.config import get_settings
from app.database import SessionLocal
from app.db_migrate import upgrade_to_head
from app.models import Role, User

cli = typer.Typer(no_args_is_help=True)


@cli.command("upgrade-db")
def cmd_upgrade_db():
    """Alembic-Migrationen bis HEAD ausführen."""
    upgrade_to_head()
    typer.echo("DB ist auf HEAD.")


@cli.command("bootstrap-admin")
def cmd_bootstrap_admin(
    username: str = typer.Option(...),
    email: str = typer.Option(...),
    password: str = typer.Option(...),
    full_name: str = typer.Option(""),
):
    """Legt den ersten Admin an. Idempotent: bricht ab, wenn bereits ein Admin existiert."""
    upgrade_to_head()
    db = SessionLocal()
    try:
        if db.query(User).filter(User.role == Role.ADMIN).first():
            typer.echo("Es existiert bereits ein Admin – Abbruch.")
            raise typer.Exit(code=1)
        user = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            full_name=full_name or None,
            role=Role.ADMIN,
        )
        db.add(user)
        db.commit()
        typer.echo(f"Admin {username!r} angelegt (id={user.id}).")
    finally:
        db.close()


@cli.command("send-test-email")
def cmd_send_test_email(
    to: str = typer.Option(..., "--to", help="Empfänger-Adresse"),
    subject: str = typer.Option("Clok – Test-Mail", "--subject"),
):
    """Schickt eine Test-Mail über den Brevo-Wrapper.
    Nutzt BREVO_API_KEY aus der Container-.env. Im Dev-Modus wird die
    Mail nur ins Log geschrieben."""
    from app.notifications import brevo
    settings = get_settings()
    text = (
        "Test-Mail von Clok (CLI)\n\n"
        f"Absender: {settings.email_from}\n"
        f"App-URL: {settings.app_base_url}\n\n"
        "Wenn du diese Mail liest, ist der Mailversand richtig konfiguriert.\n\n"
        "– Clok\n"
    )
    html = (
        f"<p><strong>Test-Mail von Clok (CLI)</strong></p>"
        f"<p style='color:#888;font-size:14px;'>"
        f"Absender: <code>{settings.email_from}</code><br>"
        f"App-URL: <code>{settings.app_base_url}</code></p>"
        f"<p>Wenn du diese Mail liest, ist der Mailversand richtig konfiguriert.</p>"
        f"<p>– Clok</p>"
    )
    result = brevo.send(to=to, subject=subject, html=html, text=text)
    if result.dev_mode:
        typer.echo("Dev-Modus aktiv (BREVO_API_KEY leer). Mail wurde nur ins Backend-Log geschrieben.")
        return
    if result.ok:
        typer.echo(f"OK – an {to} verschickt. message_id={result.message_id}")
        return
    typer.echo(
        f"FEHLER {result.status_code} {result.error_name}: {result.error_message}",
        err=True,
    )
    raise typer.Exit(code=1)


if __name__ == "__main__":
    cli()
