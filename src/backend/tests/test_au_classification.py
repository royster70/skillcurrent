"""Evaluation tests for AU company classification with subdivision context.

Tests the enriched Haiku classification against known multi-sector
companies. Each test case defines:
  - company name
  - expected_primary: must appear in results
  - expected_any: at least one of these should appear (for multi-sector)
  - not_expected: should NOT appear (tests specificity)
  - single_sector_asx: expected flag from ASX lookup

These tests require ANTHROPIC_AUTH_TOKEN in .env (Haiku API calls).
Skip with: pytest -m "not llm"

Cost: ~$0.001 per test case (Haiku), ~$0.01 for the full suite.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


# -- Test case definitions --

EVAL_CASES = [
    {
        "name": "AGL Energy",
        "description": "Diversified energy: generation, retail, gas, telco",
        "expected_primary": ["D"],
        "expected_any": ["G", "J"],  # retail energy customers or telco
        "not_expected": ["B"],  # not mining
        "single_sector_asx": True,
    },
    {
        "name": "AusNet Services",
        "description": "Pure infrastructure: electricity distribution & transmission",
        "expected_primary": ["D"],
        "expected_any": [],  # should be single-sector
        "max_sectors": 2,  # should not expand into many sectors
        "not_expected": ["G", "J"],  # not retail, not telco
    },
    {
        "name": "Wesfarmers",
        "description": "Conglomerate: Bunnings, Kmart, Officeworks, chemicals, industrial",
        "expected_primary": ["G"],  # retail dominates
        "expected_any": ["C", "F"],  # manufacturing or wholesale
        "not_expected": ["Q"],  # not health care
        "single_sector_asx": True,
    },
    {
        "name": "Woolworths Group",
        "description": "Supermarkets + pubs (ALH/Endeavour) + financial services",
        "expected_primary": ["G"],  # retail dominates
        "expected_any": ["H", "K"],  # hospitality or financial services
        "not_expected": ["B"],  # not mining
        "single_sector_asx": True,
    },
    {
        "name": "Telstra",
        "description": "Telco + enterprise IT + health tech + media",
        "expected_primary": ["J"],  # telecoms
        "expected_any": [],  # J alone is acceptable
        "not_expected": ["B", "A"],  # not mining or agriculture
        "single_sector_asx": True,
    },
    {
        "name": "Qantas Airways",
        "description": "Airline + loyalty program + freight + Jetstar",
        "expected_primary": ["I"],  # transport
        "expected_any": [],  # I alone is acceptable but G (loyalty/retail) is a bonus
        "not_expected": ["B", "C"],  # not mining or manufacturing
        "single_sector_asx": True,
    },
    {
        "name": "CSL Limited",
        "description": "Pharma manufacturing + biotech R&D + plasma collection",
        "expected_primary": ["C"],  # manufacturing
        "expected_any": ["Q"],  # health care
        "not_expected": ["G"],  # not retail
    },
    {
        "name": "Macquarie Group",
        "description": "Investment bank + infrastructure + green energy + asset management",
        "expected_primary": ["K"],  # financial services
        "expected_any": [],  # K alone is acceptable but D (energy) is a bonus
        "not_expected": ["A", "G"],  # not agriculture or retail
    },
    {
        "name": "Origin Energy",
        "description": "Energy generation + retail energy + LNG (sold APLNG stake 2024)",
        "expected_primary": ["D"],  # utilities
        "expected_any": ["B", "J"],  # mining/gas extraction OR telco/digital
        "not_expected": ["P"],  # not education
        "single_sector_asx": True,
    },
    {
        "name": "Transurban",
        "description": "Toll road operator — pure infrastructure",
        "expected_primary": ["I"],  # transport
        "expected_any": [],  # should stay focused
        "max_sectors": 2,
        "not_expected": ["G", "C"],  # not retail, not manufacturing
        "single_sector_asx": True,
    },
]


@pytest.fixture
async def client():
    """Async HTTP client with fresh DB engine (avoids event loop conflicts)."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.db.session import get_db

    engine = create_async_engine(
        "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai",
        echo=False,
    )
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


# -- Search flag tests (no LLM call needed) --


class TestSearchFlags:
    """Test single_sector_asx flag on ASX search results."""

    @pytest.mark.asyncio
    async def test_agl_flagged_single_sector(self, client: AsyncClient) -> None:
        r = await client.get("/api/v1/companies/search?q=AGL&region=AU")
        assert r.status_code == 200
        results = r.json()["results"]
        agl = next((r for r in results if "AGL" in r["company_name"].upper()), None)
        assert agl is not None
        assert agl["single_sector_asx"] is True
        assert agl["sector_codes"] == ["D"]

    @pytest.mark.asyncio
    async def test_bhp_not_flagged(self, client: AsyncClient) -> None:
        r = await client.get("/api/v1/companies/search?q=BHP&region=AU")
        assert r.status_code == 200
        results = r.json()["results"]
        bhp = next((r for r in results if "BHP" in r["company_name"].upper()), None)
        assert bhp is not None
        assert bhp["single_sector_asx"] is False
        assert len(bhp["sector_codes"]) >= 2

    @pytest.mark.asyncio
    async def test_csl_not_flagged(self, client: AsyncClient) -> None:
        r = await client.get("/api/v1/companies/search?q=CSL&region=AU")
        results = r.json()["results"]
        csl = next((r for r in results if "CSL" in r["company_name"].upper()), None)
        assert csl is not None
        assert csl["single_sector_asx"] is False

    @pytest.mark.asyncio
    async def test_wesfarmers_flagged_single(self, client: AsyncClient) -> None:
        r = await client.get("/api/v1/companies/search?q=Wesfarmers&region=AU")
        results = r.json()["results"]
        wes = results[0]
        assert wes["single_sector_asx"] is True


# -- Workforce profile tests (no LLM call needed) --


class TestWorkforceProfile:
    """Test workforce profile loads for classify results."""

    @pytest.mark.asyncio
    async def test_sector_d_profile_has_8_groups(self, client: AsyncClient) -> None:
        """Workforce profile for a D-only company should have 8 occupation groups."""
        r = await client.get("/api/v1/sectors/D/occupation-mix")
        assert r.status_code == 200
        data = r.json()
        assert len(data["mix"]) == 8
        total_pct = sum(e["share_pct"] for e in data["mix"])
        assert 99.0 <= total_pct <= 101.0

    @pytest.mark.asyncio
    async def test_composite_profile_blends(self, client: AsyncClient) -> None:
        """Composite D+G profile should differ from D-only."""
        r_d = await client.get("/api/v1/sectors/D/occupation-mix")
        r_dg = await client.get("/api/v1/sectors/composite?codes=D,G&region=AU")
        d_only = r_d.json()["mix"]
        composite = r_dg.json().get("occupation_mix", [])
        assert composite  # should exist for AU
        # D+G composite should have more Sales Workers than D alone
        d_sales = next((e["share_pct"] for e in d_only if "Sales" in e["major_group_name"]), 0)
        comp_sales = next(
            (e["share_pct"] for e in composite if "Sales" in e["major_group_name"]),
            0,
        )
        assert comp_sales > d_sales  # Retail Trade (G) has ~41% Sales Workers


# -- LLM classification tests (requires API key, costs ~$0.01) --


class TestLLMClassification:
    """Test Haiku classification with subdivision-enriched prompts.

    These tests call the Anthropic API. Skip with: pytest -m 'not llm'
    """

    @pytest.mark.llm
    @pytest.mark.asyncio
    @pytest.mark.parametrize("case", EVAL_CASES, ids=[c["name"] for c in EVAL_CASES])
    async def test_classification_accuracy(self, client: AsyncClient, case: dict) -> None:
        """Evaluate classification accuracy for each company.

        Note: If a cached result exists, it will be returned. To force fresh
        classification, clear the cache manually before running.
        """
        r = await client.post(
            "/api/v1/companies/classify",
            json={"name": case["name"], "region": "AU"},
        )

        if r.status_code in (502, 503):
            pytest.skip(f"Anthropic API unavailable ({r.status_code})")

        assert r.status_code == 200, f"Classify failed: {r.text}"
        data = r.json()
        codes = data["sector_codes"]

        # Primary sector must be present
        for primary in case["expected_primary"]:
            assert primary in codes, (
                f"{case['name']}: expected primary sector {primary} " f"but got {codes}"
            )

        # At least one of the expected_any should be present
        if case.get("expected_any"):
            found_any = [c for c in case["expected_any"] if c in codes]
            assert found_any, (
                f"{case['name']}: expected at least one of "
                f"{case['expected_any']} but got {codes}"
            )

        # Not-expected sectors should be absent
        for bad in case.get("not_expected", []):
            assert bad not in codes, f"{case['name']}: unexpected sector {bad} in {codes}"

        # Max sectors constraint (for focused companies)
        if "max_sectors" in case:
            assert len(codes) <= case["max_sectors"], (
                f"{case['name']}: expected at most {case['max_sectors']} "
                f"sectors but got {len(codes)}: {codes}"
            )

        # AU classifications should have workforce_profile
        assert (
            data.get("workforce_profile") is not None
        ), f"{case['name']}: missing workforce_profile"
        assert len(data["workforce_profile"]) > 0

    @pytest.mark.llm
    @pytest.mark.asyncio
    async def test_agl_vs_ausnet_differentiation(self, client: AsyncClient) -> None:
        """AGL should classify to more sectors than AusNet."""
        r_agl = await client.post(
            "/api/v1/companies/classify",
            json={"name": "AGL Energy", "region": "AU"},
        )
        r_aus = await client.post(
            "/api/v1/companies/classify",
            json={"name": "AusNet Services", "region": "AU"},
        )

        if r_agl.status_code in (502, 503):
            pytest.skip(f"Anthropic API unavailable ({r_agl.status_code})")

        agl_codes = r_agl.json()["sector_codes"]
        aus_codes = r_aus.json()["sector_codes"]

        # AGL should be more diversified
        assert len(agl_codes) > len(aus_codes), (
            f"AGL ({agl_codes}) should have more sectors than " f"AusNet ({aus_codes})"
        )
        # Both should include D
        assert "D" in agl_codes
        assert "D" in aus_codes


# -- Subdivision data quality tests --


class TestSubdivisionData:
    """Verify ANZSIC subdivision data quality."""

    @pytest.mark.asyncio
    async def test_subdivision_count(self, client: AsyncClient) -> None:
        """Should have 214 subdivisions across 19 divisions."""
        from sqlalchemy import text as sa_text
        from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession, create_async_engine

        engine = create_async_engine(
            "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai"
        )
        S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with S() as s:
            r = await s.execute(
                sa_text("SELECT COUNT(*) FROM anzsic_subdivisions WHERE release_year = 2025")
            )
            assert r.scalar() == 214

            r2 = await s.execute(
                sa_text(
                    "SELECT COUNT(DISTINCT anzsic_division_code) "
                    "FROM anzsic_subdivisions WHERE release_year = 2025"
                )
            )
            assert r2.scalar() == 19
        await engine.dispose()

    @pytest.mark.asyncio
    async def test_electricity_subdivisions(self, client: AsyncClient) -> None:
        """Division D should have generation, distribution, and gas sub-sectors."""
        from sqlalchemy import text as sa_text
        from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession, create_async_engine

        engine = create_async_engine(
            "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai"
        )
        S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with S() as s:
            r = await s.execute(
                sa_text(
                    "SELECT subdivision_name FROM anzsic_subdivisions "
                    "WHERE anzsic_division_code = 'D' ORDER BY employment DESC"
                )
            )
            names = [row[0] for row in r.fetchall()]
            assert any("Generation" in n for n in names)
            assert any("Distribution" in n for n in names)
            assert any("Gas" in n for n in names)
        await engine.dispose()
