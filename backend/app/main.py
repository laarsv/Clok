"""FastAPI app entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db_migrate import upgrade_to_head
from app.routers import (
    absences, admin, auth, employees, employer, entries, exports, holidays,
    notifications, onboarding, stats, terms,
)
from app.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    upgrade_to_head()
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


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


@app.get("/api/health")
def health():
    return {"status": "ok"}
