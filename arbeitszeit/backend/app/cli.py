"""Admin CLI for bootstrapping. Usage:

    docker compose exec backend python -m app.cli create-user \
        --username lars --password "..." --admin
"""
import typer

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import BillingMode, User

cli = typer.Typer(no_args_is_help=True)


@cli.command()
def create_user(
    username: str = typer.Option(...),
    password: str = typer.Option(...),
    full_name: str = typer.Option(""),
    admin: bool = typer.Option(False, "--admin"),
    mode: str = typer.Option("salary", help="hourly | salary"),
    rate: float = typer.Option(0.0, help="Stundensatz in EUR (nur bei hourly)"),
    target: float = typer.Option(160.0, help="Soll-Stunden/Monat (nur bei salary)"),
):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == username).first():
            typer.echo(f"User {username!r} existiert bereits.")
            raise typer.Exit(code=1)
        user = User(
            username=username,
            password_hash=hash_password(password),
            full_name=full_name or None,
            is_admin=admin,
            billing_mode=BillingMode(mode),
            hourly_rate_eur=rate,
            monthly_target_hours=target,
        )
        db.add(user)
        db.commit()
        typer.echo(f"User {username!r} angelegt (id={user.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    cli()
