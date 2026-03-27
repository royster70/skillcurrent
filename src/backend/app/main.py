from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.middleware.timing import TimingMiddleware
from app.services.pipeline_scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Workforce AI Impact Analysis Platform",
    description="Tier 1 Industry Intelligence — AI exposure analysis by occupation and industry",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Request timing (ADR-007) — always adds X-Request-Duration-Ms header
app.add_middleware(TimingMiddleware)

app.include_router(api_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
