"""Performance baseline tests (ADR-007).

Validates timing middleware, admin health, admin metrics, slow-queries endpoints,
and P95 threshold enforcement.

Run the full suite normally:
    pytest tests/test_performance.py -v

Run P95 threshold tests only (requires a running backend):
    pytest tests/test_performance.py -v -m slow
"""

import pytest
import numpy as np
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app

TEST_DB_URL = "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai"

# Thresholds from ADR-007 (milliseconds, P95)
BASELINE_THRESHOLDS = {
    "/api/v1/sectors": 200,
    "/api/v1/sectors?region=AU": 400,  # AU loads occupation_mix (extra query)
    "/api/v1/sectors/D/occupation-mix": 200,  # Census W12A query (small table)
    "/api/v1/occupations": 500,
    "/api/v1/gdpval/summary": 200,
    "/api/v1/admin/health": 50,
}


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

    @pytest.mark.asyncio
    async def test_request_id_header_present(self, client):
        """Every response must include X-Request-ID correlation header."""
        r = await client.get("/api/v1/admin/health")
        assert r.status_code == 200
        assert "X-Request-ID" in r.headers
        rid = r.headers["X-Request-ID"]
        # Should be a non-empty string (UUID4 format: 36 chars with hyphens)
        assert len(rid) == 36
        assert rid.count("-") == 4

    @pytest.mark.asyncio
    async def test_request_id_propagated_from_client(self, client):
        """If caller supplies X-Request-ID, the same value is echoed back."""
        custom_id = "test-1234-abcd-5678-efgh90123456"
        r = await client.get("/api/v1/admin/health", headers={"X-Request-ID": custom_id})
        assert r.headers["X-Request-ID"] == custom_id


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


class TestAdminSlowQueries:
    @pytest.mark.asyncio
    async def test_slow_queries_returns_valid_structure(self, client):
        """GET /api/v1/admin/slow-queries returns expected structure."""
        r = await client.get("/api/v1/admin/slow-queries")
        assert r.status_code == 200
        data = r.json()
        assert "slow_queries" in data
        assert "limit" in data
        assert isinstance(data["slow_queries"], list)
        assert data["limit"] == 10

    @pytest.mark.asyncio
    async def test_slow_queries_custom_limit(self, client):
        """GET /api/v1/admin/slow-queries?limit=5 respects limit param."""
        r = await client.get("/api/v1/admin/slow-queries?limit=5")
        assert r.status_code == 200
        data = r.json()
        assert data["limit"] == 5


@pytest.mark.slow
class TestP95Thresholds:
    """P95 latency enforcement against ADR-007 baselines.

    Run with: pytest tests/test_performance.py -v -m slow
    Requires the application to be connected to a populated database.
    """

    SAMPLE_COUNT = 5

    @pytest.mark.asyncio
    async def test_p95_sectors(self, client):
        """GET /api/v1/sectors P95 must be under 200 ms."""
        await self._assert_p95(client, "/api/v1/sectors", BASELINE_THRESHOLDS["/api/v1/sectors"])

    @pytest.mark.asyncio
    async def test_p95_occupations(self, client):
        """GET /api/v1/occupations P95 must be under 500 ms."""
        await self._assert_p95(
            client, "/api/v1/occupations", BASELINE_THRESHOLDS["/api/v1/occupations"]
        )

    @pytest.mark.asyncio
    async def test_p95_gdpval_summary(self, client):
        """GET /api/v1/gdpval/summary P95 must be under 200 ms."""
        await self._assert_p95(
            client, "/api/v1/gdpval/summary", BASELINE_THRESHOLDS["/api/v1/gdpval/summary"]
        )

    @pytest.mark.asyncio
    async def test_p95_sectors_au(self, client):
        """GET /api/v1/sectors?region=AU P95 must be under 400 ms (loads occupation_mix)."""
        await self._assert_p95(
            client,
            "/api/v1/sectors?region=AU",
            BASELINE_THRESHOLDS["/api/v1/sectors?region=AU"],
        )

    @pytest.mark.asyncio
    async def test_p95_occupation_mix(self, client):
        """GET /api/v1/sectors/D/occupation-mix P95 must be under 200 ms."""
        await self._assert_p95(
            client,
            "/api/v1/sectors/D/occupation-mix",
            BASELINE_THRESHOLDS["/api/v1/sectors/D/occupation-mix"],
        )

    @pytest.mark.asyncio
    async def test_p95_admin_health(self, client):
        """GET /api/v1/admin/health P95 must be under 50 ms."""
        await self._assert_p95(
            client, "/api/v1/admin/health", BASELINE_THRESHOLDS["/api/v1/admin/health"]
        )

    async def _assert_p95(self, client: AsyncClient, path: str, threshold_ms: float) -> None:
        """Make SAMPLE_COUNT requests, compute P95 from X-Request-Duration-Ms, assert threshold."""
        durations = []
        for _ in range(self.SAMPLE_COUNT):
            r = await client.get(path)
            assert r.status_code == 200, f"Unexpected status {r.status_code} for {path}"
            assert (
                "X-Request-Duration-Ms" in r.headers
            ), f"Missing X-Request-Duration-Ms header on {path}"
            durations.append(float(r.headers["X-Request-Duration-Ms"]))

        p95 = float(np.percentile(durations, 95))
        assert p95 < threshold_ms, (
            f"P95 for {path} is {p95:.1f} ms, exceeds threshold of {threshold_ms} ms. "
            f"All samples: {[f'{d:.1f}' for d in durations]}"
        )
