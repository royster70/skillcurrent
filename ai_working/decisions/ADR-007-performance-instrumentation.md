---
date: 2026-03-27
status: accepted
agents: []
prd_section: Tier 1
---

# Performance Instrumentation and Observability

## Context

The platform now has 19 API endpoints with varying complexity:
- Simple lookups: `GET /sectors` (~50ms)
- Complex joins: `GET /occupations/{soc}/matrix` with LATERAL joins, era snapshots, GDPval counts (~500-900ms)
- LLM calls: `POST /companies/classify` (~2-5s, external API)
- Composite aggregations: `GET /sectors/composite?codes=...` with GROUP BY across multiple sectors

As the platform grows (more data sources via DataScout, Tier 2 org overlay, AU sub-division data), endpoint performance will naturally drift. Without instrumentation, regressions will go unnoticed until users complain.

Rob Pike's Rule 2 applies: "Measure. Don't tune for speed until you've measured." This ADR establishes the measurement infrastructure BEFORE performance becomes a problem.

## Decision 1: Three-Layer Observability Stack

### The choice

Three complementary layers, each catching different performance signals:

| Layer | What it catches | Storage | Effort |
|-------|----------------|---------|--------|
| **L1: API Timing Middleware** | Request-level latency, status codes, endpoint regressions | `api_request_log` table | Low |
| **L2: PostgreSQL Query Stats** | Slow queries, index misses, query plan changes | `pg_stat_statements` extension (built-in) | Low |
| **L3: Performance Baseline Tests** | Regression detection in CI, threshold violations | pytest fixtures with stored baselines | Medium |

### Rejected alternatives

- **Full APM (Datadog/New Relic)**: Over-engineered for current scale (single developer, local dev). Adds external dependency and cost. Revisit when deployed to production.
- **OpenTelemetry distributed tracing**: Appropriate for microservices; this is a monolith. The trace-per-request overhead isn't justified when a simple middleware captures the same signal.
- **Frontend Web Vitals**: Lower priority — app is internal-use, not customer-facing. Bundle size and render performance matter less than API latency. Add later if needed.

### Rationale

The simplest instrumentation that gives actionable data. Each layer is independently useful and independently deployable. No external dependencies — everything runs in PostgreSQL and pytest.

## Decision 2: API Request Log Schema and Middleware

### The choice

FastAPI middleware that captures every request and writes to an `api_request_log` table:

```sql
CREATE TABLE IF NOT EXISTS api_request_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    query_params TEXT,            -- e.g. "region=AU&codes=62,54"
    status_code INTEGER NOT NULL,
    duration_ms FLOAT NOT NULL,   -- wall-clock request time
    region VARCHAR(2),            -- extracted from query params if present
    client_ip TEXT
);
-- Index for performance analysis queries
CREATE INDEX idx_request_log_path_ts ON api_request_log(path, timestamp);
CREATE INDEX idx_request_log_ts ON api_request_log(timestamp);
```

The middleware:
- Wraps every request in a timer (`time.perf_counter()`)
- Writes to the log table asynchronously (non-blocking — uses background task or fire-and-forget)
- Extracts `region` from query params for region-specific analysis
- Skips health checks and OpenAPI docs requests
- Has a `ENABLE_REQUEST_LOGGING` setting (default True, can be disabled)

### Key design choice

Write to PostgreSQL (not filesystem logs) so performance data can be queried with SQL:
```sql
-- P95 per endpoint, last 7 days
SELECT path,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
FROM api_request_log
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY path ORDER BY p95_ms DESC;

-- Detect regression: compare this week vs last week
SELECT path,
       AVG(CASE WHEN timestamp > NOW() - INTERVAL '7 days' THEN duration_ms END) AS this_week,
       AVG(CASE WHEN timestamp BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' THEN duration_ms END) AS last_week
FROM api_request_log
GROUP BY path
HAVING AVG(CASE WHEN timestamp > NOW() - INTERVAL '7 days' THEN duration_ms END) >
       AVG(CASE WHEN timestamp BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' THEN duration_ms END) * 1.5;
```

### Rejected alternatives

- Writing to filesystem (harder to query, no SQL aggregation).
- Writing synchronously (adds latency to every request).
- Using a separate time-series DB like InfluxDB (overkill for this scale).

## Decision 3: PostgreSQL pg_stat_statements

### The choice

Enable `pg_stat_statements` extension in the Docker PostgreSQL container. This is a built-in PostgreSQL extension that tracks:
- Total execution time per unique query pattern
- Number of calls
- Mean/min/max execution time
- Rows returned
- Shared buffer hits vs reads (cache effectiveness)

No code changes needed — just `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` and a Docker config tweak (`shared_preload_libraries = 'pg_stat_statements'`).

Add a convenience API endpoint: `GET /api/v1/admin/slow-queries` that queries `pg_stat_statements` for the top 10 slowest queries. This endpoint is Tier 1 (no auth needed in dev) but should be restricted in production.

### Rejected alternative

SQLAlchemy event hooks for per-query timing (adds Python overhead to every query; pg_stat_statements does this natively in C with near-zero overhead).

## Decision 4: Performance Baseline Test Suite

### The choice

A separate pytest file (`tests/test_performance.py`) that:
1. Calls each endpoint N times (default 5)
2. Records median response time
3. Compares against stored baseline thresholds
4. Fails if P95 exceeds threshold by >50%

Baseline thresholds stored as a simple dict in the test file:
```python
BASELINES = {
    "/api/v1/sectors": {"p95_ms": 200},
    "/api/v1/sectors/{code}/occupations": {"p95_ms": 500},
    "/api/v1/occupations/{soc}/matrix": {"p95_ms": 1500},
    "/api/v1/sectors/composite": {"p95_ms": 800},
    "/api/v1/companies/search": {"p95_ms": 300},
    "/api/v1/gdpval/summary": {"p95_ms": 200},
}
```

Not run in normal `pytest` — requires explicit flag: `pytest tests/test_performance.py --run-perf`

### Rejected alternatives

- pytest-benchmark (heavy dependency, complex output).
- Storing baselines in a separate JSON file (harder to review in PRs).
- Running perf tests in CI (too environment-dependent; local baselines are meaningful, CI baselines fluctuate with shared runners).

## Decision 5: Where Performance Data Lives

### The choice

- `api_request_log` table: Live request telemetry (auto-pruned after 30 days via scheduled cleanup)
- `pg_stat_statements` view: Cumulative query stats (reset periodically via `pg_stat_statements_reset()`)
- `tests/test_performance.py`: Baseline thresholds checked on demand
- `GET /api/v1/admin/slow-queries`: Convenience endpoint for interactive investigation
- Future: `GET /api/v1/admin/request-stats` endpoint for dashboard integration

### Data retention

30-day rolling window for `api_request_log`. Older data is deleted by a scheduled cleanup task (or manual `DELETE WHERE timestamp < NOW() - INTERVAL '30 days'`). This keeps the table small (~50K rows/month at current usage).

## Decision 6: What NOT to Instrument (Yet)

Explicitly deferred:
- **Frontend performance** (Web Vitals, bundle size tracking) — revisit when deployed
- **Distributed tracing** (OpenTelemetry) — revisit if/when microservices split happens
- **Alerting** (PagerDuty, email) — revisit when deployed to production
- **Custom metrics** (counters, gauges, histograms beyond request timing) — revisit based on Layer 1/2 findings

## Implementation

### Phase 1 (immediate)

- Alembic migration for `api_request_log` table
- `app/middleware/timing.py` — FastAPI middleware
- Register in `app/main.py`
- Enable `pg_stat_statements` in Docker command

### Phase 2 (same session)

- `GET /api/v1/admin/slow-queries` endpoint
- `GET /api/v1/admin/request-stats` endpoint (P50/P95 per path)
- `tests/test_performance.py` baseline suite

### Phase 3 (future)

- Auto-prune scheduled task
- Performance dashboard page in frontend
- Regression detection alerts

## Consequences

**Benefits:**

- Every request is measured from day one — no "we should have been logging this"
- SQL-queryable telemetry (not buried in log files)
- Baseline tests catch regressions before they reach users
- Zero external dependencies (PostgreSQL + pytest only)
- pg_stat_statements runs in C with near-zero overhead

**Trade-offs:**

- api_request_log adds one INSERT per request (mitigated by async/background write)
- 30-day retention means long-term trends require export
- Baseline thresholds are environment-specific (developer laptop != production server)

**Risks:**

- Log table growth if retention cleanup isn't run (mitigated by 30-day policy)
- False positives in baseline tests from cold cache / first-run effects (mitigated by running N times and taking P95)

## Reassessment Triggers

| Trigger | Action |
|---------|--------|
| Production deployment | Add OpenTelemetry, APM, alerting |
| Tier 2 org data loaded | Re-baseline with larger dataset; add privacy-view query timing |
| Frontend performance complaints | Add Web Vitals instrumentation |
| api_request_log > 1M rows | Review retention policy; consider partitioning |

## Success Metrics

- All 19+ endpoints have baseline thresholds within 30 days
- P95 for all GET endpoints < 2000ms
- P95 for composite/matrix endpoints < 1500ms
- Slow query endpoint surfaces top offenders accurately
- Zero performance regressions go undetected for > 1 sprint

## References

- ADR-004: Australian data integration (exposed the need — new JOINs degraded unmeasured)
- ADR-006: DataScout pattern (more data sources = more potential for query bloat)
- Rob Pike's Rule 2: "Measure. Don't tune for speed until you've measured"
- PostgreSQL pg_stat_statements docs: https://www.postgresql.org/docs/16/pgstatstatements.html
