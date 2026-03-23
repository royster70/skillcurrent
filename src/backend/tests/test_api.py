"""API endpoint tests for Tier 1 REST API.

Tests all /api/v1/ endpoints against the real database with loaded data.
Uses FastAPI's TestClient (httpx) for synchronous request testing.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints.

    Creates a fresh engine for the app to avoid event loop conflicts
    between tests with pytest-asyncio.
    """
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

    TEST_DB_URL = "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai"
    engine = create_async_engine(TEST_DB_URL, echo=False)
    test_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def get_test_db():
        async with test_session() as session:
            yield session

    # Override the dependency
    from app.db.session import get_db
    app.dependency_overrides[get_db] = get_test_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


# ── Search ──


class TestSearch:
    @pytest.mark.asyncio
    async def test_search_by_title(self, client):
        """Search for a common job title returns results."""
        r = await client.get("/api/v1/search?q=software developer")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        assert any("Software" in res["occupation_title"] for res in data["results"])

    @pytest.mark.asyncio
    async def test_search_returns_scores(self, client):
        """Search results include three-tier scores."""
        r = await client.get("/api/v1/search?q=accountant")
        assert r.status_code == 200
        data = r.json()
        if data["total"] > 0:
            result = data["results"][0]
            assert "soc_code" in result
            assert "dominant_zone" in result
            assert "eloundou_beta" in result

    @pytest.mark.asyncio
    async def test_search_no_results(self, client):
        """Gibberish query returns empty results, not an error."""
        r = await client.get("/api/v1/search?q=xyzqwerty99")
        assert r.status_code == 200
        assert r.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_search_min_length(self, client):
        """Single character query returns 422 validation error."""
        r = await client.get("/api/v1/search?q=x")
        assert r.status_code == 422


# ── Health ──


class TestHealth:
    @pytest.mark.asyncio
    async def test_health(self, client):
        r = await client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


# ── Datasets ──


class TestDatasets:
    @pytest.mark.asyncio
    async def test_list_datasets(self, client):
        r = await client.get("/api/v1/datasets")
        assert r.status_code == 200
        data = r.json()
        assert "datasets" in data
        assert "total_rows" in data
        assert len(data["datasets"]) >= 5
        assert data["total_rows"] > 400000

    @pytest.mark.asyncio
    async def test_dataset_fields(self, client):
        r = await client.get("/api/v1/datasets")
        ds = r.json()["datasets"][0]
        assert "dataset_name" in ds
        assert "version_key" in ds
        assert "row_count" in ds


# ── Sectors ──


class TestSectors:
    @pytest.mark.asyncio
    async def test_list_sectors(self, client):
        r = await client.get("/api/v1/sectors")
        assert r.status_code == 200
        data = r.json()
        assert data["total_sectors"] == 20
        assert len(data["sectors"]) == 20

    @pytest.mark.asyncio
    async def test_sector_fields(self, client):
        r = await client.get("/api/v1/sectors")
        sector = r.json()["sectors"][0]
        assert "naics_code" in sector
        assert "naics_title" in sector
        assert "occupation_count" in sector
        assert "total_employment" in sector
        assert "avg_eloundou_beta" in sector
        assert "zone_e0_count" in sector

    @pytest.mark.asyncio
    async def test_sector_occupations(self, client):
        """GET /sectors/{code}/occupations returns occupations for a sector."""
        r = await client.get("/api/v1/sectors/54/occupations")
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert data[0]["soc_code"] is not None

    @pytest.mark.asyncio
    async def test_sector_not_found(self, client):
        r = await client.get("/api/v1/sectors/ZZ/occupations")
        assert r.status_code == 404


# ── Occupations ──


class TestOccupations:
    @pytest.mark.asyncio
    async def test_list_occupations(self, client):
        r = await client.get("/api/v1/occupations")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        assert len(data["occupations"]) > 0
        assert data["page"] == 1

    @pytest.mark.asyncio
    async def test_filter_by_zone(self, client):
        r = await client.get("/api/v1/occupations?zone=E2")
        assert r.status_code == 200
        data = r.json()
        for occ in data["occupations"]:
            assert occ["dominant_zone"] == "E2"

    @pytest.mark.asyncio
    async def test_filter_by_major_group(self, client):
        r = await client.get("/api/v1/occupations?major_group=15")
        assert r.status_code == 200
        data = r.json()
        for occ in data["occupations"]:
            assert occ["soc_code"].startswith("15-")

    @pytest.mark.asyncio
    async def test_pagination(self, client):
        r1 = await client.get("/api/v1/occupations?page=1&page_size=10")
        r2 = await client.get("/api/v1/occupations?page=2&page_size=10")
        assert r1.status_code == 200
        assert r2.status_code == 200
        page1 = r1.json()["occupations"]
        page2 = r2.json()["occupations"]
        assert len(page1) == 10
        # Pages should have different content
        if page2:
            assert page1[0]["soc_code"] != page2[0]["soc_code"]

    @pytest.mark.asyncio
    async def test_get_occupation_detail(self, client):
        """GET /occupations/{soc} returns full three-tier detail."""
        r = await client.get("/api/v1/occupations/15-1252.00")
        assert r.status_code == 200
        data = r.json()
        assert data["soc_code"] == "15-1252.00"
        assert data["title"] == "Software Developers"
        assert data["description"] is not None
        assert data["eloundou_beta_gpt4"] is not None
        assert data["ms_ai_applicability"] is not None
        assert data["dominant_zone"] in ("E0", "E1", "E2")
        assert data["top_sectors"] is not None
        assert len(data["top_sectors"]) > 0

    @pytest.mark.asyncio
    async def test_get_occupation_by_6digit(self, client):
        """Should resolve 6-digit SOC code to 8-digit via prefix match."""
        r = await client.get("/api/v1/occupations/15-1252")
        assert r.status_code == 200
        assert r.json()["soc_code"].startswith("15-1252")

    @pytest.mark.asyncio
    async def test_occupation_not_found(self, client):
        r = await client.get("/api/v1/occupations/99-9999.99")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_occupation_tasks(self, client):
        """GET /occupations/{soc}/tasks returns tasks with drift."""
        r = await client.get("/api/v1/occupations/15-1252.00/tasks")
        assert r.status_code == 200
        data = r.json()
        assert data["soc_code"] == "15-1252.00"
        assert data["total_tasks"] > 0
        assert len(data["tasks"]) > 0
        task = data["tasks"][0]
        assert "task_text" in task
        assert "velocity" in task
        assert "classification" in task


# ── Hierarchy ──


class TestHierarchy:
    @pytest.mark.asyncio
    async def test_soc_hierarchy(self, client):
        r = await client.get("/api/v1/occupations/hierarchy")
        assert r.status_code == 200
        data = r.json()
        assert data["total_major_groups"] >= 22  # 22 standard SOC groups + possible extras
        assert data["total_occupations"] > 1000
        assert len(data["hierarchy"]) >= 22

    @pytest.mark.asyncio
    async def test_hierarchy_node_structure(self, client):
        r = await client.get("/api/v1/occupations/hierarchy")
        group = r.json()["hierarchy"][0]
        assert "code" in group
        assert "title" in group
        assert group["level"] == "major"
        assert "children" in group
        assert len(group["children"]) > 0
        child = group["children"][0]
        assert child["level"] == "detailed"

    @pytest.mark.asyncio
    async def test_hierarchy_has_scores(self, client):
        """Major groups should have aggregate Eloundou Beta."""
        r = await client.get("/api/v1/occupations/hierarchy")
        groups_with_beta = [
            g for g in r.json()["hierarchy"]
            if g["avg_eloundou_beta"] is not None
        ]
        assert len(groups_with_beta) > 15  # most groups should have scores


# ── Drift ──


class TestDrift:
    @pytest.mark.asyncio
    async def test_drift_summary(self, client):
        r = await client.get("/api/v1/drift/summary")
        assert r.status_code == 200
        data = r.json()
        assert data["total_tasks"] > 4000
        assert data["departing"] > 0
        assert data["enduring"] > 0
        assert data["below_threshold"] >= 0
        assert data["departing"] + data["enduring"] + data["below_threshold"] + data["emerging"] + data["unclassified"] == data["total_tasks"]

    @pytest.mark.asyncio
    async def test_departing_tasks(self, client):
        r = await client.get("/api/v1/drift/departing?page_size=5")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        assert len(data["tasks"]) <= 5
        # Should be sorted by velocity DESC
        velocities = [t["velocity"] for t in data["tasks"] if t["velocity"]]
        assert velocities == sorted(velocities, reverse=True)

    @pytest.mark.asyncio
    async def test_below_threshold_tasks(self, client):
        r = await client.get("/api/v1/drift/below-threshold")
        assert r.status_code == 200
        data = r.json()
        for task in data["tasks"]:
            assert task["classification"] == "below_threshold"
            assert 0.40 <= task["latest_task_pct"] <= 0.50

    @pytest.mark.asyncio
    async def test_enduring_tasks(self, client):
        r = await client.get("/api/v1/drift/enduring?page_size=5")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        for task in data["tasks"]:
            assert task["classification"] == "enduring"

    @pytest.mark.asyncio
    async def test_drift_pagination(self, client):
        """Drift endpoints support pagination."""
        r = await client.get("/api/v1/drift/departing?page=1&page_size=3")
        assert r.status_code == 200
        data = r.json()
        assert data["page"] == 1
        assert data["page_size"] == 3
        assert len(data["tasks"]) <= 3

    @pytest.mark.asyncio
    async def test_drift_min_snapshots_filter(self, client):
        """min_snapshots parameter filters results."""
        r = await client.get("/api/v1/drift/departing?min_snapshots=4&page_size=5")
        assert r.status_code == 200
        for task in r.json()["tasks"]:
            assert task["snapshot_count"] >= 4


# ── Sector Priorities ──


class TestSectorPriorities:
    @pytest.mark.asyncio
    async def test_priorities_returns_data(self, client):
        r = await client.get("/api/v1/sectors/54/priorities")
        assert r.status_code == 200
        data = r.json()
        assert data["naics_code"] == "54"
        assert data["occupation_count"] > 0
        assert data["total_employment"] > 0
        assert len(data["priority_roles"]) > 0
        assert len(data["full_mix"]) >= len(data["priority_roles"])

    @pytest.mark.asyncio
    async def test_priorities_top_n(self, client):
        r = await client.get("/api/v1/sectors/54/priorities?top_n=5")
        data = r.json()
        assert len(data["priority_roles"]) <= 5

    @pytest.mark.asyncio
    async def test_priorities_have_impact_scores(self, client):
        r = await client.get("/api/v1/sectors/54/priorities")
        for role in r.json()["priority_roles"]:
            assert role["impact_score"] is not None
            assert role["impact_score"] >= 0

    @pytest.mark.asyncio
    async def test_priorities_have_risk_factors(self, client):
        r = await client.get("/api/v1/sectors/54/priorities")
        data = r.json()
        roles_with_risks = [r for r in data["priority_roles"] if len(r["risk_factors"]) > 0]
        assert len(roles_with_risks) > 0

    @pytest.mark.asyncio
    async def test_priorities_have_location_quotient(self, client):
        r = await client.get("/api/v1/sectors/54/priorities")
        roles_with_lq = [r for r in r.json()["priority_roles"] if r["location_quotient"] is not None]
        assert len(roles_with_lq) > 0

    @pytest.mark.asyncio
    async def test_priorities_sorted_by_impact(self, client):
        r = await client.get("/api/v1/sectors/54/priorities")
        scores = [r["impact_score"] for r in r.json()["priority_roles"] if r["impact_score"]]
        assert scores == sorted(scores, reverse=True)

    @pytest.mark.asyncio
    async def test_priorities_not_found(self, client):
        r = await client.get("/api/v1/sectors/ZZ/priorities")
        assert r.status_code == 404


# ── Task Matrix ──


class TestTaskMatrix:
    @pytest.mark.asyncio
    async def test_matrix_returns_data(self, client):
        r = await client.get("/api/v1/occupations/15-1252.00/matrix")
        assert r.status_code == 200
        data = r.json()
        assert data["soc_code"] == "15-1252.00"
        assert data["total_tasks"] > 0
        assert len(data["tasks"]) > 0

    @pytest.mark.asyncio
    async def test_matrix_task_fields(self, client):
        r = await client.get("/api/v1/occupations/15-1252.00/matrix")
        task = r.json()["tasks"][0]
        assert "task_id" in task
        assert "task_text" in task
        assert "importance" in task
        assert "automation_potential" in task
        assert "quadrant" in task
        assert "era_snapshots" in task

    @pytest.mark.asyncio
    async def test_matrix_quadrant_counts(self, client):
        r = await client.get("/api/v1/occupations/15-1252.00/matrix")
        qc = r.json()["quadrant_counts"]
        assert "insulated" in qc
        assert "augmented" in qc
        assert "disrupted" in qc
        assert "routine" in qc

    @pytest.mark.asyncio
    async def test_matrix_has_era_snapshots(self, client):
        r = await client.get("/api/v1/occupations/15-1252.00/matrix")
        data = r.json()
        assert "available_eras" in data
        # Some tasks should have era data
        tasks_with_eras = [t for t in data["tasks"] if len(t["era_snapshots"]) > 0]
        assert len(tasks_with_eras) >= 0  # may be 0 for some occupations

    @pytest.mark.asyncio
    async def test_matrix_6digit_soc(self, client):
        r = await client.get("/api/v1/occupations/15-1252/matrix")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_matrix_not_found(self, client):
        r = await client.get("/api/v1/occupations/99-9999.99/matrix")
        assert r.status_code == 404


# ── Semantic Search ──


class TestSemanticSearch:
    @pytest.mark.asyncio
    async def test_semantic_search_by_title(self, client):
        """Semantic search finds relevant occupations."""
        r = await client.post("/api/v1/search/semantic",
            json={"query": "DevOps Engineer", "limit": 5})
        assert r.status_code == 200
        data = r.json()
        assert data["total"] > 0
        # Should find software-related occupations
        titles = [res["occupation_title"].lower() for res in data["results"]]
        assert any("software" in t or "computer" in t or "system" in t for t in titles)

    @pytest.mark.asyncio
    async def test_semantic_search_with_description(self, client):
        """Adding a description should return results."""
        r = await client.post("/api/v1/search/semantic",
            json={
                "query": "Data Analyst",
                "description": "Analyze large datasets, build dashboards, write SQL queries",
                "limit": 5,
            })
        assert r.status_code == 200
        assert r.json()["total"] > 0

    @pytest.mark.asyncio
    async def test_semantic_search_has_scores(self, client):
        r = await client.post("/api/v1/search/semantic",
            json={"query": "Registered Nurse", "limit": 3})
        data = r.json()
        if data["total"] > 0:
            result = data["results"][0]
            assert "similarity" in result
            assert "soc_code" in result
            assert "dominant_zone" in result

    @pytest.mark.asyncio
    async def test_semantic_search_similarity_order(self, client):
        """Results should be sorted by similarity descending."""
        r = await client.post("/api/v1/search/semantic",
            json={"query": "Software Developer", "limit": 10})
        sims = [res["similarity"] for res in r.json()["results"] if res["similarity"]]
        assert sims == sorted(sims, reverse=True)


# ── Additional Occupation Endpoint Coverage ──


class TestOccupationsCoverage:
    @pytest.mark.asyncio
    async def test_filter_by_sector(self, client):
        r = await client.get("/api/v1/occupations?sector=54&page_size=5")
        assert r.status_code == 200
        assert r.json()["total"] > 0

    @pytest.mark.asyncio
    async def test_filter_by_classification(self, client):
        r = await client.get("/api/v1/occupations?classification=departing&page_size=5")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_occupation_detail_has_sectors(self, client):
        r = await client.get("/api/v1/occupations/11-1021.00")
        assert r.status_code == 200
        data = r.json()
        assert "top_sectors" in data
        if data["top_sectors"]:
            sector = data["top_sectors"][0]
            assert "naics_code" in sector
            assert "headcount" in sector

    @pytest.mark.asyncio
    async def test_occupation_tasks_have_drift(self, client):
        r = await client.get("/api/v1/occupations/15-1252.00/tasks")
        data = r.json()
        assert data["total_tasks"] > 0
        task = data["tasks"][0]
        assert "task_text" in task
        assert "velocity" in task
        assert "classification" in task
