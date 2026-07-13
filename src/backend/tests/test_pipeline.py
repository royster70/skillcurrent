"""Tests for FR-8.8 pipeline status API and orchestrator."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    """Async HTTP client wired to a real test DB session."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

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

    @pytest.mark.asyncio
    async def test_dag_has_new_census_stages(self):
        """The two stages added when the scaffold was wired (FR-8.8)."""
        from scripts.run_pipeline import _build_pipeline_dag

        names = [s.name for s in _build_pipeline_dag()]
        assert "ingest_census_w13" in names
        assert "ingest_census_subdivision_occ" in names

    @pytest.mark.asyncio
    async def test_every_stage_has_a_real_callable(self):
        """No stage may be left as a no-op scaffold placeholder."""
        from scripts.run_pipeline import _build_pipeline_dag

        for stage in _build_pipeline_dag():
            assert callable(stage.fn), stage.name
            # The retired scaffold used a shared `_noop`; ensure it's gone.
            assert getattr(stage.fn, "__name__", "") != "_noop"


class TestPipelineNonDryRun:
    """Non-dry-run orchestration behaviour.

    These inject a fake DAG so the *real* run_pipeline execution path is
    exercised (stage invocation, row reporting, abort semantics, correlation
    binding) without a multi-hundred-thousand-row rebuild.
    """

    @pytest.mark.asyncio
    async def test_stages_execute_and_report_rows(self, monkeypatch):
        from scripts import run_pipeline as rp

        order: list[str] = []

        async def fake_a() -> int:
            order.append("a")
            return 10

        async def fake_b() -> int:
            order.append("b")
            return 5

        def fake_dag():
            return [
                rp.PipelineStage("a", fake_a, description="first"),
                rp.PipelineStage("b", fake_b, depends_on=["a"], description="second"),
            ]

        monkeypatch.setattr(rp, "_build_pipeline_dag", fake_dag)
        results = await rp.run_pipeline(stages="all", dry_run=False)

        assert results["overall_status"] == "success"
        assert order == ["a", "b"]
        assert [s["status"] for s in results["stages"]] == ["success", "success"]
        assert [s["rows_affected"] for s in results["stages"]] == [10, 5]
        assert results["pipeline_run_id"]  # UUID4 present
        assert all("duration_ms" in s for s in results["stages"])

    @pytest.mark.asyncio
    async def test_non_optional_failure_aborts_run(self, monkeypatch):
        from scripts import run_pipeline as rp

        ran_after = False

        async def boom() -> int:
            raise RuntimeError("kaboom")

        async def after() -> int:
            nonlocal ran_after
            ran_after = True
            return 1

        def fake_dag():
            return [rp.PipelineStage("x", boom), rp.PipelineStage("y", after)]

        monkeypatch.setattr(rp, "_build_pipeline_dag", fake_dag)
        results = await rp.run_pipeline(stages="all", dry_run=False)

        assert results["overall_status"] == "failed"
        assert results["stages"][0]["status"] == "failed"
        assert "kaboom" in results["stages"][0]["error"]
        assert len(results["stages"]) == 1  # aborted before "y"
        assert ran_after is False

    @pytest.mark.asyncio
    async def test_optional_failure_does_not_abort(self, monkeypatch):
        from scripts import run_pipeline as rp

        async def boom() -> int:
            raise RuntimeError("optional-oops")

        async def after() -> int:
            return 3

        def fake_dag():
            return [
                rp.PipelineStage("opt", boom, optional=True),
                rp.PipelineStage("y", after),
            ]

        monkeypatch.setattr(rp, "_build_pipeline_dag", fake_dag)
        results = await rp.run_pipeline(stages="all", dry_run=False)

        # Overall reflects the failure, but the run continued past the optional stage.
        assert results["overall_status"] == "failed"
        assert len(results["stages"]) == 2
        assert results["stages"][0]["status"] == "failed"
        assert results["stages"][1]["status"] == "success"

    @pytest.mark.asyncio
    async def test_pipeline_run_id_is_bound_during_stage(self, monkeypatch):
        """ADR-007 Phase 3 Rule 2: the batch key is visible to running stages."""
        from app.core.correlation import pipeline_run_id_var
        from scripts import run_pipeline as rp

        seen: dict[str, str] = {}

        async def capture() -> int:
            seen["id"] = pipeline_run_id_var.get("")
            return 1

        def fake_dag():
            return [rp.PipelineStage("c", capture)]

        monkeypatch.setattr(rp, "_build_pipeline_dag", fake_dag)
        results = await rp.run_pipeline(stages="all", dry_run=False)

        assert seen["id"] == results["pipeline_run_id"] != ""
        # ContextVar is reset after the run — no leakage into the caller.
        assert pipeline_run_id_var.get("") == ""

    @pytest.mark.slow
    @pytest.mark.asyncio
    async def test_real_stage_writes_rows(self, monkeypatch):
        """End-to-end: orchestrator drives a real script run() against the DB.

        Uses ingest_crosswalk — a self-contained, network-free, 21-row stage —
        to prove the run() refactor and orchestrator wiring load real data.
        Marked slow because it mutates the configured database.
        """
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import create_async_engine

        from app.core.config import settings
        from scripts import run_pipeline as rp

        def fake_dag():
            from functools import partial

            return [rp.PipelineStage("ingest_crosswalk", partial(rp._call, "ingest_crosswalk"))]

        monkeypatch.setattr(rp, "_build_pipeline_dag", fake_dag)
        results = await rp.run_pipeline(stages="all", dry_run=False)

        assert results["overall_status"] == "success"
        assert results["stages"][0]["rows_affected"] == 21

        engine = create_async_engine(settings.database_url)
        try:
            async with engine.connect() as conn:
                count = (
                    await conn.execute(text("SELECT COUNT(*) FROM industry_crosswalk"))
                ).scalar()
        finally:
            await engine.dispose()
        assert count == 21
