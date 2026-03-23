---
date: 2026-03-22
status: proposed
agents: []
prd_section: FR-8.1, FR-8.2, FR-8.4
---

# Use Python/SQLAlchemy for Tier 1 Transformations, Defer Data Catalog to Scale Trigger

## Context

Before building the Tier 1 intelligence pipeline (FR-8.1 AEI ingestion, FR-8.2 drift calculation, FR-8.4 industry profiles), we need to decide how transformations are orchestrated and how data lineage is tracked. The platform currently has:

- 5 Tier 1 tables defined via Alembic migrations and SQLAlchemy ORM models
- An async FastAPI backend with PostgreSQL 16 + pgvector
- Relatively simple transformations: aggregations over AEI snapshots, OEWS employment joins, zone classification via the Beta formula (`E1 + 0.5*E2`), and linear regression for drift velocity
- A clear separation between raw ingested tables (`aei_task_snapshots`, `oews_employment`) and derived tables (`industry_occupation_profiles`, future `task_drift_metrics`)

The three-layer data product architecture for Tier 1 is:

1. **Raw layer** — Immutable ingested data (AEI snapshots, OEWS employment, Eloundou scores, GPTVal benchmarks)
2. **Derived layer** — Computed tables that join and aggregate raw data (industry profiles, drift metrics)
3. **Serving layer** — API endpoints and dashboard views that query derived tables

The question is whether to introduce dbt Core and/or OpenMetadata now, or use simpler tooling aligned with the existing stack.

## Decision

**Use Python/SQLAlchemy for all Tier 1 transformations.** Track lineage via a lightweight metadata table and decorated transformation functions. Defer any external data catalog (OpenMetadata, DataHub) until the platform reaches a defined scale trigger.

### Transformation layer

Write transformations as Python service functions using SQLAlchemy Core expressions. Alembic remains the sole DDL owner for all tables (raw and derived). Transformations execute as background tasks triggered by data ingestion events, not as separate batch processes.

### Lineage tracking

Introduce a `transformation_log` table recording source tables, target table, row counts, and execution status for each transformation run. Populate it via a decorator pattern on transformation functions. This provides queryable lineage, audit trail, and debugging support at zero infrastructure cost.

### Data catalog

Defer. Revisit when any of these triggers are met:
- More than 30 tables across both tiers
- More than 3 distinct data consumers (teams or services) querying the platform
- A compliance or audit requirement that demands formal data governance tooling

## Alternatives Considered

### 1. dbt Core for transformation layer

dbt would manage derived tables (industry profiles, drift metrics) as SQL models, providing automatic DAG construction and built-in data tests.

- **Pros:**
  - Automatic lineage DAG from `ref()`/`source()` calls
  - Battle-tested SQL templating (Jinja macros)
  - Built-in data quality tests (`unique`, `not_null`, `accepted_values`)
  - `manifest.json` artifact for downstream tooling
- **Cons:**
  - Schema ownership conflict with Alembic — requires partitioning DDL responsibility across schemas, adding cognitive overhead and a source of drift
  - Cannot safely embed in async FastAPI process — `dbtRunner` uses global Python state and is unsafe for concurrent invocations; must run as a separate batch process (subprocess, Celery worker, or external scheduler)
  - Two connection configurations (`profiles.yml` + SQLAlchemy URL) that must stay synchronised
  - Two testing frameworks (pytest + dbt test) for overlapping concerns
  - Disproportionate overhead for ~5 derived tables with straightforward SQL (aggregations, joins, threshold classification)
  - Team already proficient with SQLAlchemy — learning dbt's Jinja-SQL templating adds friction without proportional benefit at this scale
- **Rejected because:** The operational complexity (separate process, schema partitioning, dual config) is not justified by the current transformation complexity. dbt's value compounds with scale (dozens of models, multi-hop dependencies, incremental loads) — we have single-hop aggregations.

### 2. Python/SQLAlchemy with metadata-table lineage ✅ SELECTED

Keep all transformations in the existing Python runtime. Track lineage via a `transformation_log` table populated by decorators on service functions.

- **Pros:**
  - Zero new dependencies or infrastructure
  - Single DDL owner (Alembic), single connection config, single test framework
  - Transformations can be triggered synchronously or as async background tasks within FastAPI
  - Shared type system between ORM models and transformation logic
  - Simple debugging: one process, one stack trace
  - Metadata table provides queryable lineage and audit trail
- **Cons:**
  - No automatic DAG visualisation (must be manually documented or generated from the metadata table)
  - Data quality assertions must be written as pytest tests rather than declarative dbt tests
  - If transformation complexity grows significantly, we may outgrow this approach
- **Selected because:** Matches the current scale, avoids premature infrastructure, and keeps the architecture simple. The metadata table provides the lineage tracking needed for operational visibility without external tooling.

### 3. Hamilton (Apache Hamilton) micro-framework

Hamilton encodes DAG dependencies in Python function signatures. Each function's parameter names define its upstream dependencies. Provides automatic lineage, DAG visualisation, and OpenLineage event emission.

- **Pros:**
  - Zero infrastructure (pip install)
  - Automatic lineage from function signatures — lineage IS the code
  - Can emit OpenLineage events for future catalog integration
  - Runs in-process alongside FastAPI
- **Cons:**
  - Adds a framework dependency and its programming model (function-per-node)
  - Team must learn Hamilton's conventions (function naming = node naming, parameter naming = edge definition)
  - Overkill for 5-6 transformations that have a clear, linear dependency chain
  - Less mature ecosystem than SQLAlchemy for this team's use case
- **Not selected now because:** The dependency chain is simple enough (AEI ingest → drift calculation → profile recomputation) that a framework for DAG management adds abstraction without reducing complexity. However, Hamilton is a strong option to revisit if the transformation graph becomes non-trivial (10+ nodes with branching dependencies).

### 4. OpenMetadata as data catalog (deploy now)

Full data catalog with Elasticsearch-backed search, automated metadata ingestion, and lineage visualisation.

- **Pros:**
  - Rich UI for data discovery, lineage browsing, and data quality dashboards
  - Automated schema extraction from PostgreSQL
  - Column-level lineage tracking
  - Data profiling and quality monitoring
- **Cons:**
  - Requires Elasticsearch/OpenSearch (minimum 2 vCPU, 2 GB RAM), a dedicated database, and the OpenMetadata server (minimum 2 vCPU, 4 GB RAM) — total ~6 vCPU, 8 GB RAM minimum for a system cataloguing 5 tables
  - Requires Airflow or Kubernetes orchestrator for ingestion workflows
  - Significant operational overhead: Elasticsearch index management, version upgrades, API key rotation, connector configuration
  - Designed for organisations with dozens of data sources and multiple consuming teams — dramatically over-provisioned for current needs
- **Rejected because:** Infrastructure cost and operational overhead are wildly disproportionate to a 5-table platform with a single consuming application. The forklift-for-a-chair problem.

## Implementation

### Transformation log table (migration 003)

```sql
CREATE TABLE transformation_log (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,           -- e.g. 'compute_industry_profiles'
    source_tables   TEXT[] NOT NULL,         -- e.g. {'oews_employment', 'aei_task_snapshots'}
    target_table    TEXT NOT NULL,           -- e.g. 'industry_occupation_profiles'
    started_at      TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    rows_affected   INTEGER,
    status          TEXT NOT NULL DEFAULT 'running',  -- 'running'|'success'|'failed'
    error_message   TEXT,
    parameters      JSONB                   -- snapshot_date, release_year, etc.
);
```

### Decorator pattern for transformation functions

```python
@tracked_transformation(
    name="compute_industry_profiles",
    sources=["oews_employment", "aei_task_snapshots"],
    target="industry_occupation_profiles",
)
async def compute_industry_profiles(session: AsyncSession, release_year: int) -> int:
    # ... transformation logic ...
    return rows_affected
```

The decorator inserts a `transformation_log` row at start, updates it on completion/failure, and captures the row count. This provides lineage, audit trail, and operational monitoring with no external dependencies.

### Three-layer alignment

| Layer | Tables | Managed by | Lineage |
|-------|--------|-----------|---------|
| **Raw** | `aei_task_snapshots`, `oews_employment`, `onet_occupations`, `industry_crosswalk` | Alembic DDL, ingestion services | `transformation_log` records ingest events |
| **Derived** | `industry_occupation_profiles`, `task_drift_metrics` (future) | Alembic DDL, transformation services | `transformation_log` records computation with source→target mapping |
| **Serving** | FastAPI endpoints, future dashboard views | Application code | API access logs (standard FastAPI middleware) |

- **Location**: `src/backend/app/services/transformations.py` (decorator + runner), `src/backend/migrations/versions/003_transformation_log.py`
- **Dependencies**: None beyond existing SQLAlchemy
- **Tests**: `src/backend/tests/test_transformation_tracking.py`

## Consequences

**Benefits:**
- No new infrastructure, dependencies, or deployment complexity
- Alembic retains sole ownership of all DDL — no schema partitioning or dual-tool conflicts
- Queryable lineage: `SELECT * FROM transformation_log WHERE target_table = 'industry_occupation_profiles' ORDER BY completed_at DESC` answers "when was this last computed and from what?"
- Transformation functions are testable with standard pytest + a test database
- Clear migration path: if we outgrow this approach, the `transformation_log` table's schema maps directly to OpenLineage events for future catalog integration

**Trade-offs:**
- No automatic DAG visualisation — mitigated by documenting the dependency chain in `docs/fr8-role-evolution.md` and generating a Mermaid diagram from the metadata table if needed
- Data quality assertions are pytest tests, not declarative — mitigated by writing explicit constraint checks in transformation functions and testing them
- If Tier 1 grows to 20+ derived tables with complex multi-hop dependencies, this approach will feel manual — mitigated by the Hamilton escape hatch (see Reassessment Triggers)

**Risks:**
- Transformation ordering bugs if dependencies aren't enforced: Low — the dependency chain is linear (ingest → drift → profiles) and the service layer will enforce execution order explicitly
- Lineage metadata becomes stale if developers skip the decorator: Low — decorator is the standard pattern, enforced by code review; the tracked wrapper is simpler than writing raw SQL

## Reassessment Triggers

Revisit this decision if any of the following occur:

| Trigger | Likely action |
|---------|--------------|
| Derived tables exceed 15 with branching dependencies | Evaluate Hamilton for DAG management |
| Multiple teams consume platform data | Evaluate lightweight catalog (Marquez + OpenLineage) |
| Compliance/audit requires formal data governance | Evaluate OpenMetadata or DataHub |
| Transformation SQL grows complex (window functions, multi-pass) | Evaluate dbt Core with schema partitioning |

## Success Metrics

- All Tier 1 transformations tracked in `transformation_log`: target 100%
- Lineage query answers "what produced this table, when, from what?" in <1s
- No new infrastructure required for Tier 1 pipeline delivery
- Transformation test coverage ≥90%

## References

- PRD: Sections 8.1 (AEI Ingestion), 8.2 (Drift Calculation), 8.4 (Industry Profiles)
- Domain model: `docs/domain-model.md` — three-layer evidence stack, data invariants
- FR-8 spec: `docs/fr8-role-evolution.md` — transformation pipeline and success metrics
- dbt programmatic invocations: docs.getdbt.com/reference/programmatic-invocations (concurrent invocation limitations)
- OpenMetadata minimum requirements: docs.open-metadata.org/latest/deployment/minimum-requirements
- Apache Hamilton: github.com/apache/hamilton (lineage-as-code pattern)
