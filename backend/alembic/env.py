"""Alembic environment. Liest die DB-URL aus app.config.Settings.

WICHTIG: alembic.ini hat eine [loggers]-Sektion, die wir hier
**nicht** über fileConfig laden. Grund: fileConfig würde den
Root-Logger auf WARN setzen (Wert aus der ini) und damit alle INFO-
Logs von uvicorn/clok/app stumm schalten – inkl. „Application
startup complete." und Lifespan-Stage-Markern. Alembic-eigene Logs
funktionieren auch ohne ini-Konfiguration über die normale
Logger-Hierarchie.
"""
from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.database import Base
from app import models  # noqa: F401  – sorgt dafür, dass alle Tabellen registriert sind

config = context.config

config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
