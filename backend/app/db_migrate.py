"""Convenience-Wrapper um Alembic, idempotent aufrufbar."""
from pathlib import Path

from alembic import command
from alembic.config import Config


def _alembic_cfg() -> Config:
    backend_dir = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    return cfg


def upgrade_to_head() -> None:
    command.upgrade(_alembic_cfg(), "head")
