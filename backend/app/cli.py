"""Admin CLI. Subcommands:

    upgrade-db
    bootstrap-admin --username … --email … --password …
"""
import typer

from app.auth import hash_password
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


if __name__ == "__main__":
    cli()
