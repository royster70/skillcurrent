---
name: performance-monitoring
description: "Rob Pike instrumentation and performance diagnostic tool. Use this skill whenever the user asks to check performance, run performance baselines, measure latency, check slow queries, check P95 thresholds, verify ADR-007 compliance, or after adding or modifying any API endpoint. Also use proactively after any session that modifies endpoint handlers, adds JOINs to service queries, changes middleware, or touches the api_request_log table — latency regressions are invisible until a threshold is breached in production."
---

# Performance Monitoring

Run a read-only performance sweep covering P95 latency thresholds, SQL cost, complexity budgets, and instrumentation health. Produce a severity-graded report (CRITICAL / WARNING / INFO).

This skill exists because Rob Pike's core rule is **measure, don't guess** — and measurement is only useful if it's systematised. The codebase has ADR-007 instrumentation already wired in (`X-Request-Duration-Ms`, `api_request_log`, `/admin/slow-queries`, `/admin/metrics`). This skill makes that instrumentation actionable in a single diagnostic pass.

## When to Run

- After adding or modifying any API endpoint handler
- After adding JOINs, subqueries, or new queries to service functions
- After changing middleware (timing, request ID, logging)
- After adding new tables that endpoints query
- When the user asks to check performance, measure latency, or verify ADR-007 compliance
- Before any release or clean rebuild

## Diagnostic Checks

Run all checks in sequence. All checks are read-only — no writes to any file or database.

### Check 1: P95 Threshold Tests (pytest -m slow)

Run the P95 test suite from the project root:

```bash
cd src/backend && python -m pytest tests/test_performance.py -v -m slow 2>&1
```

The current ADR-007 P95 baselines are:

| Endpoint | Threshold (ms) |
|----------|---------------|
| `GET /api/v1/sectors` | 200 |
| `GET /api/v1/sectors?region=AU` | 400 |
| `GET /api/v1/sectors/D/occupation-mix` | 200 |
| `GET /api/v1/occupations` | 500 |
| `GET /api/v1/gdpval/summary` | 200 |
| `GET /api/v1/admin/health` | 50 |

Report:
- Test failure (assertion error on P95 > threshold) → **CRITICAL** (regression, do not ship)
- Test failure due to connection error (DB unavailable) → **WARNING** (infra issue, not a regression)
- All tests pass → **INFO** (baseline healthy)

If the backend is not running, note this clearly and skip to Check 3.

### Check 2: Live Endpoint Timing (via /admin/metrics)

Query the admin metrics endpoint if the backend is running:

```bash
curl -s http://localhost:8000/api/v1/admin/metrics | python -m json.tool
```

Interpret the response:
- `avg_duration_ms` per path vs ADR-007 thresholds: if avg > 50% of threshold → **WARNING** (headroom is shrinking)
- `max_duration_ms` > threshold → **WARNING** (at least one request has already breached the threshold)
- `request_count = 0` → **INFO** (no traffic yet, metrics not meaningful)
- `slowest_endpoints` list — surface the top 3 and their avg durations

### Check 3: SQL Cost Audit (via /admin/slow-queries)

Query the slow-queries endpoint:

```bash
curl -s http://localhost:8000/api/v1/admin/slow-queries | python -m json.tool
```

For each entry in `slow_queries`:
- `mean_exec_time_ms > 100` → **WARNING** (slow SQL, look for missing index or excess JOINs)
- `mean_exec_time_ms > 500` → **CRITICAL** (unacceptable SQL cost)
- `calls < 10` → **INFO** (low sample, not yet statistically meaningful)

This uses `pg_stat_statements`. If no entries are returned, note that `pg_stat_statements` may not be enabled.

### Check 4: Instrumentation Header Check

Make a test request and verify the required ADR-007 headers are present:

```bash
curl -si http://localhost:8000/health | grep -E "X-Request-Duration-Ms|X-Request-ID"
```

Report:
- `X-Request-Duration-Ms` missing → **CRITICAL** (TimingMiddleware not running; no performance data is being collected)
- `X-Request-ID` missing → **WARNING** (correlation IDs not propagated; slow queries cannot be traced back to HTTP requests)
- Both present → **INFO** (instrumentation healthy)

Also verify the header appears on API routes:

```bash
curl -si http://localhost:8000/api/v1/admin/health | grep -E "X-Request-Duration-Ms|X-Request-ID"
```

### Check 5: Cyclomatic Complexity Audit (ruff C90)

Run the complexity linter across the app directory:

```bash
cd src/backend && python -m ruff check app/ --select C90 2>&1
```

The project enforces `max-complexity = 10` (from `pyproject.toml`). Violations are lint errors, not warnings.

Report:
- Any C901 violations → **CRITICAL** (complexity budget exceeded; function must be decomposed before merge)
- Zero violations → **INFO** (all functions within budget)

If violations are found, list each one with its file, line number, function name, and complexity score. This is structural — a complex function is harder to reason about and more likely to hide a performance issue.

### Check 6: api_request_log Recency Check

Query the request log table to confirm telemetry is flowing:

```sql
SELECT
    path,
    COUNT(*) AS request_count,
    ROUND(AVG(duration_ms)::numeric, 1) AS avg_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric, 1) AS p95_ms,
    MAX(timestamp) AS last_seen
FROM api_request_log
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY path
ORDER BY avg_ms DESC;
```

Report:
- No rows in the last hour → **INFO** (no recent traffic or logging disabled — check `enable_request_logging` setting)
- Any path with `p95_ms > threshold` (using ADR-007 thresholds above) → **WARNING** (live P95 is drifting above baseline)
- Log rows present and P95 within threshold → **INFO** (telemetry healthy)

Also check total log size for retention compliance:

```sql
SELECT COUNT(*) AS total_rows,
       MIN(timestamp) AS oldest_row,
       MAX(timestamp) AS newest_row
FROM api_request_log;
```

Rows older than 30 days should be purged (30-day retention per ADR-007). Report if `oldest_row` is >30 days ago → **WARNING** (retention policy not enforced).

### Check 7: Non-slow Test Suite (instrumentation tests)

Run the non-slow performance tests (middleware headers, admin endpoints) — these don't require a populated database:

```bash
cd src/backend && python -m pytest tests/test_performance.py -v -m "not slow" 2>&1
```

Report:
- Any failure → **CRITICAL** (middleware or admin endpoint broken)
- All pass → **INFO** (instrumentation wiring intact)

## Output Format

Produce a structured report:

```
# Performance Monitoring Report
Generated: {timestamp}
Backend: {running/not running}

## CRITICAL Issues ({count})
[List each with check number, endpoint/function, measured value vs threshold]

## WARNING Issues ({count})
[List each with check number, description, recommendation]

## INFO ({count})
[Healthy confirmations and minor notes]

## Summary
- P95 thresholds:     {passing}/{total} endpoints within baseline
- SQL cost:           {top slow query avg_ms} ms (slowest), {count} queries tracked
- Complexity:         {violation_count} C901 violations ({clean/needs attention})
- Instrumentation:    {headers present/missing}
- Telemetry:          {rows in last hour} log rows, P95 {within/above} threshold
- Test suite:         {passed}/{total} instrumentation tests passing
```

## Important Notes

- This is a **read-only** diagnostic. Never modify endpoints, settings, or database rows.
- P95 tests (`-m slow`) require the backend to be running with a populated database. If the backend is not available, run Check 3 and Check 5 offline and note the rest as "unable to assess".
- `pg_stat_statements` must be enabled in PostgreSQL for Check 3 to return data. If it isn't, recommend `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` and a server restart.
- The complexity check (Check 5) is the only check that requires no running services — it can always be run.
- If a CRITICAL issue is found, surface it prominently and recommend not shipping until resolved. Performance regressions caught here are silent in development but page oncall in production.

## Relationship to Pipeline Diagnostics

The `pipeline-diagnostics` skill checks **data lineage** (are the right tables loaded in the right order?). This skill checks **runtime performance** (are requests fast enough, is telemetry flowing, is SQL efficient?). Run both after any session that touches the pipeline or API layer.
