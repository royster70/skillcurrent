"""Tests for FR-8.8 pipeline status API and orchestrator."""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    """Async HTTP client wired to a real test DB session."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    TEST_DB_URL = "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai"
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


class TestPipelineStatusAPI:
    @pytest.mark.asyncio
    async def test_pipeline_status_returns_200(self, client):
        response = await client.get("/api/v1/admin/pipeline/status")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_pipeline_status_has_required_fields(self, client):
        response = await client.get("/api/v1/admin/pipeline/status")
        data = response.json()
        assert "overall_status" in data
        assert "stages" in data
        assert "checked_at" in data
        assert data["overall_status"] in ("healthy", "degraded", "no_runs")

    @pytest.mark.asyncio
    async def test_pipeline_dag_returns_200(self, client):
        response = await client.get("/api/v1/admin/pipeline/dag")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_pipeline_dag_has_onet_as_first_stage(self, client):
        response = await client.get("/api/v1/admin/pipeline/dag")
        stages = response.json()["stages"]
        assert stages[0]["name"] == "onet"
        assert stages[0]["depends_on"] == []


class TestPipelineOrchestrator:
    @pytest.mark.asyncio
    async def test_dry_run_completes_successfully(self):
        from scripts.run_pipeline import run_pipeline

        results = await run_pipeline(stages="all", dry_run=True)
        assert results["overall_status"] == "success"
        assert len(results["stages"]) > 0
        assert all(s["status"] == "skipped" for s in results["stages"])

    @pytest.mark.asyncio
    async def test_dry_run_tier1_only(self):
        from scripts.run_pipeline import run_pipeline

        results = await run_pipeline(stages="tier1", dry_run=True)
        stage_names = [s["name"] for s in results["stages"]]
        # Optional AU stages should not be present
        assert "ingest_abs" not in stage_names
        assert "compute_profiles_au" not in stage_names

    @pytest.mark.asyncio
    async def test_dag_has_all_expected_stages(self):
        from scripts.run_pipeline import _build_pipeline_dag

        stages = _build_pipeline_dag()
        names = [s.name for s in stages]
        assert "onet" in names
        assert "compute_drift" in names
        assert "compute_profiles_us" in names
