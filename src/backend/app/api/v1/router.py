"""Tier 1 API router — aggregates all v1 endpoint modules."""

from fastapi import APIRouter

from app.api.v1.datasets import router as datasets_router
from app.api.v1.drift import router as drift_router
from app.api.v1.gdpval import router as gdpval_router
from app.api.v1.occupations import router as occupations_router
from app.api.v1.search import router as search_router
from app.api.v1.task_matrix import router as task_matrix_router
from app.api.v1.sector_priorities import router as sector_priorities_router
from app.api.v1.sectors import router as sectors_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(datasets_router)
api_router.include_router(search_router)
api_router.include_router(sectors_router)
api_router.include_router(sector_priorities_router)
api_router.include_router(occupations_router)
api_router.include_router(task_matrix_router)
api_router.include_router(drift_router)
api_router.include_router(gdpval_router)
