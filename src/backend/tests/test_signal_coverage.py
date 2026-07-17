"""Evidence-coverage derivation tests (GitHub #73).

The qualitative confidence word is derived by COUNTING non-null core signals
— never by blending confidence values across sources (CLAUDE.md invariant).
The pure-helper tests below need no database; the endpoint test asserts the
field flows through the live response and agrees with the visible scores.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1.occupations import _signal_coverage
from app.main import app


class TestSignalCoverageDerivation:
    def test_all_three_signals_is_high(self):
        c = _signal_coverage(0.6, 0.3, 0.4, gdpval_count=0)
        assert (c.eloundou, c.microsoft, c.aei) == (True, True, True)
        assert c.signal_count == 3
        assert c.confidence == "high"

    def test_two_signals_is_moderate(self):
        c = _signal_coverage(0.6, None, 0.4, gdpval_count=0)
        assert c.signal_count == 2
        assert c.confidence == "moderate"

    def test_one_or_zero_signals_is_limited(self):
        assert _signal_coverage(0.6, None, None, 0).confidence == "limited"
        assert _signal_coverage(None, None, None, 0).confidence == "limited"
        assert _signal_coverage(None, None, None, 0).signal_count == 0

    def test_gdpval_reported_but_never_counted(self):
        """GDPval is a benchmark corpus, not an exposure signal — it must not
        lift the confidence word."""
        c = _signal_coverage(None, None, None, gdpval_count=5)
        assert c.gdpval is True
        assert c.signal_count == 0
        assert c.confidence == "limited"


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


class TestSignalCoverageEndpoint:
    @pytest.mark.asyncio
    async def test_detail_carries_coverage_consistent_with_scores(self, client):
        """The badge can never disagree with the visible score fields."""
        r = await client.get("/api/v1/occupations/15-1252.00")
        assert r.status_code == 200
        data = r.json()
        cov = data["signal_coverage"]
        assert cov is not None
        assert cov["eloundou"] == (data["eloundou_beta_gpt4"] is not None)
        assert cov["microsoft"] == (data["ms_ai_applicability"] is not None)
        assert cov["aei"] == (data["aei_exposure"] is not None)
        assert cov["gdpval"] == data["gdpval_available"]
        assert cov["signal_count"] == sum((cov["eloundou"], cov["microsoft"], cov["aei"]))
        assert cov["confidence"] in ("high", "moderate", "limited")
