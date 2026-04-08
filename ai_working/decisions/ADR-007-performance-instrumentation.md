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

### Phase 2 (completed)

- [x] `GET /api/v1/admin/slow-queries` — pg_stat_statements top 10 slowest queries
- [x] `GET /api/v1/admin/metrics` — P50/P95/max per path (last hour) — delivered as `/admin/metrics`
- [x] `tests/test_performance.py` — baseline structure tests (4 tests)
- [x] Correlation ID (`X-Request-ID`) — UUID4 generated per request, returned in response header, stored in `api_request_log.request_id` (migration 016)
- [x] `TestP95Thresholds` — P95 threshold enforcement (`pytest -m slow`), thresholds per ADR
- [x] `contextvars.ContextVar` — request_id available to all layers within a request scope

### Phase 3 (future)

- Auto-prune scheduled task
- Performance dashboard page in frontend
- Regression detection alerts

### Phase 3 — Correlation propagation rules (MUST follow when extending observability)

Phase 2 wired in `request_id` via `contextvars.ContextVar`, but a `ContextVar`
only survives within a single asyncio task on a single process. The moment
work crosses an async boundary, a process boundary, or a tier boundary, the
correlation key is silently lost — and a "no DB activity for slow request"
investigation becomes guesswork. These four rules close the gaps **before**
new code reintroduces them.

**Status:** rules are normative now. Implementation helpers land incrementally
as the relevant code paths are touched (no big-bang refactor).

#### Rule 1 — Async boundary propagation

Any code that spawns work via `asyncio.create_task`, `loop.run_in_executor`,
`anyio.to_thread.run_sync`, or schedules an APScheduler job **MUST** capture
`request_id` from `contextvars` at the call site and re-bind it inside the
spawned coroutine/callable. `ContextVar` is preserved across `await` in the
same task; it is **not** automatically copied into spawned tasks.

- Helper to add: `app/utils/context.py::run_with_context(coro_or_fn, *, request_id=None)`
  — copies the current context (or an explicit override) into the new task.
- Audit target on first pass: `app/services/pipeline_scheduler.py` (APScheduler
  jobs run with no inbound request, so they need a synthetic `pipeline_run_id`
  per Rule 2 instead).
- Test: a unit test that spawns a task from a request handler and asserts the
  child sees the same `request_id` via the contextvar.

#### Rule 2 — Batch correlation key (`pipeline_run_id`)

Pipeline runs and ingest jobs are not requests; `request_id` does not apply.
The Tier 1 analogue is `pipeline_run_id` (UUID4, generated at the top of
`scripts/run_pipeline.py` and propagated to every stage).

- Every `transformation_log` row produced by a pipeline run **MUST** carry the
  `pipeline_run_id` of the run that produced it. Migration: add a
  `pipeline_run_id UUID NULL` column with an index; backfill is not required
  (NULL = pre-Phase-3 row).
- Every stage in `run_pipeline.py` receives `pipeline_run_id` via context and
  passes it down to ingestors.
- A `request_id` and a `pipeline_run_id` **never appear on the same row**.
  Rows are tagged with exactly one — whichever scope they were produced in.

#### Rule 3 — Cross-tier correlation

When a Tier 2 endpoint triggers Tier 1 recomputation (a future scenario, but
FR-6 will hit it first), **both** keys flow through the call chain:

- The originating `request_id` is preserved in `api_request_log` (unchanged).
- The recompute call generates a fresh `pipeline_run_id` and writes it to
  `transformation_log`.
- A linkage table — `tier_recompute_link (request_id UUID, pipeline_run_id
  UUID, triggered_at TIMESTAMPTZ)` — records that the two scopes are related.
  Joins for incident investigation traverse this table; neither HTTP nor batch
  rows are polluted with the other tier's key.
- Architectural rule from CLAUDE.md still holds: Tier 1 and Tier 2 pipelines
  remain separate. The link table records causation, not data flow.

#### Rule 4 — Time window alignment

Any dashboard or admin endpoint that compares **two** telemetry sources
**MUST** normalise to a single window before correlating:

- Default window: trailing 1 hour. Maximum: 24 hours. Beyond 24h, fall back to
  exported snapshots, not live tables.
- `pg_stat_statements` accumulates since last reset. Rule: snapshot and reset
  it on `pipeline_run_id` boundaries (`pg_stat_statements_reset()` called at
  the end of each pipeline run, with the prior snapshot persisted to a
  `pg_stat_snapshots` table keyed by `pipeline_run_id`). This prevents
  since-reset drift from contaminating per-run analysis.
- GPTVal benchmark comparisons (`/api/v1/gdpval/waterline`) **MUST** align
  model-era timestamps to the same calendar window before computing velocity;
  raw release-date drift is a known confounder for `linregress` slopes
  (cross-reference: FR-8.7 P0a notes).
- General rule: if two charts on the same page draw from different windows,
  the page is lying. Document the window in the response payload, not just the
  UI.

#### Why these are rules, not features

Each rule prevents a specific class of "wrong instrumentation" bug — the most
expensive class, because it makes you doubt the system when the bug is in the
measurement. ADR-007 already commits to "measure, don't guess"; these rules
say *and make sure the measurement is actually measuring what you think it
is*. They are constraints on how observability is implemented, not new
features, which is why they live in this ADR rather than as an FR.

### Addendum — Rob Pike alignment

These Phase 2 additions directly implement Pike's Rule 1/2 ("Measure. Don't guess"):
- Correlation IDs link HTTP latency (api_request_log) to SQL cost (pg_stat_statements) — a slow endpoint can now be traced to its slow query
- P95 threshold tests make "measure" a hard gate, not a dashboard people check occasionally
- /admin/slow-queries makes the measurement surface-able without needing direct DB access

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
