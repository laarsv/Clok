"""FastAPI app entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, entries, exports, stats

# Rohfassung: Tabellen direkt anlegen. Später durch Alembic ersetzen.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Clok", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # für lokale Entwicklung; produktiv einschränken
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(entries.router)
app.include_router(stats.router)
app.include_router(exports.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
