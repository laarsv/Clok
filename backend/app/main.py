"""FastAPI app entry point."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db_migrate import upgrade_to_head
from app.routers import auth, entries, exports, stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    upgrade_to_head()
    yield


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
app.include_router(stats.router)
app.include_router(exports.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
