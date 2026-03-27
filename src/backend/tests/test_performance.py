"""Performance baseline tests (ADR-007).

Validates timing middleware, admin health, and admin metrics endpoints.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app

TEST_DB_URL = "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai"


@pytest.fixture
async def client():
    """Async HTTP client with test DB override."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    test_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def get_test_db():
        async with test_session() as session:
            yield session

    from app.db.session import get_db

    app.dependency_overrides[get_db] = get_test_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


class TestTimingMiddleware:
    @pytest.mark.asyncio
    async def test_duration_header_present(self, client):
        """Every response must include X-Request-Duration-Ms header."""
        r = await client.get("/health")
        assert r.status_code == 200
        assert "X-Request-Duration-Ms" in r.headers
        duration = float(r.headers["X-Request-Duration-Ms"])
        assert duration >= 0

    @pytest.mark.asyncio
    async def test_duration_header_on_api_routes(self, client):
        """API routes also get the timing header."""
        r = await client.get("/api/v1/admin/health")
        assert "X-Request-Duration-Ms" in r.headers
        duration = float(r.headers["X-Request-Duration-Ms"])
        assert duration >= 0


class TestAdminHealth:
    @pytest.mark.asyncio
    async def test_health_returns_200(self, client):
        """GET /api/v1/admin/health returns healthy status."""
        r = await client.get("/api/v1/admin/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data


class TestAdminMetrics:
    @pytest.mark.asyncio
    async def test_metrics_returns_valid_structure(self, client):
        """GET /api/v1/admin/metrics returns expected metric fields."""
        r = await client.get("/api/v1/admin/metrics")
        assert r.status_code == 200
        data = r.json()
        assert "request_count" in data
        assert "avg_duration_ms" in data
        assert "max_duration_ms" in data
        assert "slowest_endpoints" in data
        assert isinstance(data["slowest_endpoints"], list)
