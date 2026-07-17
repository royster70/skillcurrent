"""AU occupation endpoint tests (GitHub #73/#78 — first OSCA serving surface).

Runs against the seeded local DB (same convention as test_api.py). Asserts
the CLAUDE.md invariants structurally: osca_version stamped, main tasks
descriptor-only (bare text, no exposure attached), competencies from exactly
one ANZSCO key, coverage basis distinct from US signal counting.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.db.session import get_db

    test_db_url = "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai"
    engine = create_async_engine(test_db_url, echo=False)
    test_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def get_test_db():
        async with test_session() as session:
            yield session

    app.dependency_overrides[get_db] = get_test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
    await engine.dispose()


class TestAuOccupationIndex:
    @pytest.mark.asyncio
    async def test_index_lists_exposure_backed_osca_codes(self, client):
        r = await client.get("/api/v1/au/occupations")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        assert data["total"] == len(data["occupations"])
        assert data["osca_version"] == "2024.1.0"
        first = data["occupations"][0]
        assert first["osca_code"]
        assert first["title"]
        # soc_codes exist for at least some rows (4-digit ANZSCO concordance)
        assert any(len(o["soc_codes"]) > 0 for o in data["occupations"])


class TestAuOccupationDetail:
    @pytest.mark.asyncio
    async def test_detail_carries_the_full_au_reading(self, client):
        # Any exposure-backed code from the index — no hardcoded fixture.
        idx = (await client.get("/api/v1/au/occupations")).json()
        code = idx["occupations"][0]["osca_code"]

        r = await client.get(f"/api/v1/au/occupations/{code}")
        assert r.status_code == 200
        data = r.json()
        assert data["osca_code"] == code
        assert data["title"]
        # Invariant: osca_version stamped on every OSCA-derived payload
        assert data["osca_version"] == "2024.1.0"
        # Exposure rollup present for an exposure-backed code, basis stated
        exp = data["exposure"]
        assert exp is not None
        assert exp["task_count"] and exp["task_count"] > 0
        assert "0.60" in exp["confidence_basis"]  # bridge floor stated, never re-derived
        # Invariant: main tasks are descriptor-only — bare strings, nothing
        # numeric attached for exposure to hide in
        assert all(isinstance(t, str) for t in data["main_tasks"])

    @pytest.mark.asyncio
    async def test_competencies_come_from_exactly_one_anzsco_key(self, client):
        idx = (await client.get("/api/v1/au/occupations")).json()
        # Find a code that actually has competencies
        for entry in idx["occupations"][:50]:
            data = (await client.get(f"/api/v1/au/occupations/{entry['osca_code']}")).json()
            if data["competencies"]:
                assert data["competency_source_anzsco"] is not None
                # ASC v3.0 defines 10 core competencies — one source key can
                # never yield more (averaging across keys would)
                assert len(data["competencies"]) <= 10
                names = [c["name"] for c in data["competencies"]]
                assert len(names) == len(set(names))
                return
        pytest.fail("no OSCA code with competencies found in the first 50")

    @pytest.mark.asyncio
    async def test_unknown_osca_404s(self, client):
        r = await client.get("/api/v1/au/occupations/000000")
        assert r.status_code == 404
