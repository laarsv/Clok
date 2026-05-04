"""FastAPI app entry point."""
import asyncio
import logging
import time
from contextlib import asynccontextmanager


# uvicorn konfiguriert nur seine eigenen Logger ('uvicorn', 'uvicorn.error',
# 'uvicorn.access'), der Root-Logger bleibt auf Python-Default (WARNING,
# keine Handler). Damit unsere INFO-Logs (clok.lifespan, app.scheduler,
# alembic.runtime.migration, …) erscheinen, müssen wir den Root einmal
# selbst konfigurieren – BEVOR die App-Imports laufen, damit alle Logger,
# die in den Imports erstellt werden, die richtige Hierarchie sehen.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# basicConfig ist no-op, wenn Root schon Handler hat. setLevel auf einzelnen
# Loggern wirkt unabhängig davon und fängt diesen Fall ab.
for _name in ("clok", "app", "alembic"):
    logging.getLogger(_name).setLevel(logging.INFO)


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db_migrate import upgrade_to_head
from app.routers import (
    absences, admin, audit, auth, balance_adjustments, employees, employer,
    entries, exports, holidays, notifications, onboarding, stats, terms,
)
from app.scheduler import start_scheduler, stop_scheduler

log = logging.getLogger("clok.lifespan")


async def _run_with_timeout(name: str, sync_fn, timeout: float) -> None:
    """Führt eine synchrone Funktion in einem Thread aus, mit Timeout und
    Fehlertoleranz. Backend-Start darf nicht von externen Diensten oder
    blockierenden Calls abhängen – im Zweifel wird der Schritt geloggt
    und übersprungen, statt den ganzen Boot zu hängen."""
    t0 = time.monotonic()
    try:
        await asyncio.wait_for(asyncio.to_thread(sync_fn), timeout=timeout)
        log.info("Lifespan: %s ok in %.2fs", name, time.monotonic() - t0)
    except asyncio.TimeoutError:
        log.error(
            "Lifespan: %s hat nach %.0fs nicht geantwortet – Schritt übersprungen",
            name, timeout,
        )
    except Exception:
        log.exception("Lifespan: %s fehlgeschlagen – Backend startet trotzdem", name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    log.info(
        "Lifespan startup beginning (app_base_url=%s, email_dev_mode=%s)",
        settings.app_base_url, settings.email_dev_mode,
    )

    await _run_with_timeout("alembic upgrade head", upgrade_to_head, timeout=120.0)
    await _run_with_timeout("scheduler start", start_scheduler, timeout=10.0)

    log.info("Lifespan startup complete")
    try:
        yield
    finally:
        log.info("Lifespan shutdown")
        try:
            stop_scheduler()
        except Exception:
            log.exception("Scheduler shutdown failed")


app = FastAPI(title="Clok", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # für lokale Entwicklung; produktiv einschränken
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(entries.router)
app.include_router(absences.router)
app.include_router(stats.router)
app.include_router(exports.router)
app.include_router(holidays.router)
app.include_router(notifications.router)
app.include_router(employees.router)
app.include_router(employer.router)
app.include_router(onboarding.router)
app.include_router(terms.router)
app.include_router(admin.router)
app.include_router(balance_adjustments.router)
app.include_router(audit.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
