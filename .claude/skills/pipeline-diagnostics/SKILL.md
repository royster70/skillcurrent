---
name: pipeline-diagnostics
description: "Data lineage and pipeline integrity diagnostic tool. Use this skill whenever the user asks to check pipeline, verify lineage, diagnose dependencies, audit data flow, check pipeline integrity, review data lineage, or after adding new ingest scripts, pipeline stages, or database tables. Also use proactively after any session that modifies run_pipeline.py, adds migrations, or creates new ingest scripts — lineage bugs are silent until a clean rebuild fails."
---

# Pipeline Diagnostics

Run a read-only diagnostic sweep across the pipeline DAG, data lineage, integrity hashing, and table coverage. Produce a severity-graded report (CRITICAL / WARNING / INFO).

This skill exists because data lineage bugs are silent — a missing pipeline dependency means the wrong execution order on a clean rebuild, but everything looks fine in development because tables were loaded in a different sequence. The diagnostic catches these before they become production failures.

## When to Run

- After adding new pipeline stages or ingest scripts
- After modifying `depends_on` edges in `run_pipeline.py`
- After creating new migrations or database tables
- When the user asks to verify pipeline integrity
- Periodically as a health check (especially before a clean rebuild)

## Diagnostic Checks

Run all checks in sequence. Use read-only operations — no writes to any file or database.

### Check 1: Pipeline DAG Dependency Validation

Read `src/backend/scripts/run_pipeline.py` and extract the full `_build_pipeline_dag()` stage list. For each stage, record `name`, `depends_on`, `optional`, and `description`.

Then for each **derived/computed stage** (stages whose name starts with `compute_` or `derive_`), read the actual SQL in the corresponding service function to identify which tables it queries. Map those source tables back to their ingest stages. Report any stage that queries a table whose ingest stage is NOT in its `depends_on` list.

Key files to check:
- `compute_profiles_us` → `src/backend/app/services/industry_profiles.py` (`_compute_us_profiles`)
- `compute_profiles_au` → `src/backend/app/services/industry_profiles.py` (`_compute_au_profiles`)
- `compute_drift` → `src/backend/app/services/drift.py`
- `derive_eloundou_dwas` → `src/backend/app/services/eloundou_dwa.py`

**Table-to-stage mapping** (use this to resolve which stage loads which table):
```
onet          → onet_occupations, onet_task_statements, onet_task_ratings,
                onet_work_activities, onet_dwa_references, onet_tasks_to_dwas,
                onet_sample_titles, onet_alternate_titles, onet_emerging_tasks
eloundou      → eloundou_occ_scores
microsoft_ai  → ms_ai_applicability_scores, ms_ai_soc_metrics, ms_ai_iwa_metrics,
                ms_ai_soc_to_iwas, ms_ai_physical_tasks
aei_labor     → aei_job_exposure, aei_task_penetration
aei_temporal  → aei_task_snapshots
oews          → oews_employment
gdpval        → gdpval_tasks, gdpval_rubric_items, gdpval_evaluations
epoch_eci     → gptval_benchmarks
embed_titles  → onet_title_embeddings
compute_drift → task_drift_metrics
ingest_abs    → abs_employment
ingest_crosswalk       → industry_crosswalk
build_anzsco_concordance → anzsco_soc_concordance
compute_profiles_us    → industry_occupation_profiles (region='US')
compute_profiles_au    → industry_occupation_profiles (region='AU')
ingest_census_wpp      → abs_census_wpp, abs_census_w13
ingest_anzsic_subdivisions → anzsic_subdivisions
ingest_asx_companies   → asx_company_sectors
```

**Severity**: CRITICAL if a non-optional derived stage is missing a dependency. WARNING if an optional stage is missing one.

### Check 2: Table Coverage — Pipeline vs CLAUDE.md

Read the Data Load Status table from `CLAUDE.md` (the markdown table under `## Data Load Status`). Extract every table name listed.

Compare against the pipeline DAG stage list (using the table-to-stage mapping above). Report:
- Tables in CLAUDE.md that have no corresponding pipeline stage → WARNING (may be manually loaded or runtime-populated)
- Pipeline stages that load tables not listed in CLAUDE.md → WARNING (documentation gap)
- Tables listed with expected row count 0 → INFO (future/placeholder tables)

Known exceptions (runtime-populated, not pipeline-loaded):
- `company_classifications` — populated by LLM classify endpoint at runtime
- `api_request_log` — populated by timing middleware at runtime
- `dataset_versions` — populated by ingest scripts during pipeline execution
- `transformation_log` — populated by pipeline orchestrator

### Check 3: Database Table Existence

Connect to the database and query `information_schema.tables` for all tables in the `public` schema. Compare against:
- Tables listed in CLAUDE.md Data Load Status
- Tables referenced in pipeline DAG stages

Report:
- Tables in CLAUDE.md but not in database → CRITICAL (migration not applied)
- Tables in database but not in CLAUDE.md → INFO (may be infrastructure tables like alembic_version)

Use this query:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

### Check 4: Row Count Validation

For each table listed in CLAUDE.md with an expected row count > 0, query `SELECT COUNT(*) FROM {table}` and compare. Report:
- Count is 0 when expected > 0 → CRITICAL (table empty, data not loaded)
- Count differs by >10% from expected → WARNING (data drift, may need CLAUDE.md update)
- Count matches within 10% → INFO (healthy)

### Check 5: Integrity Hash Verification (ADR-002)

For tables that have an `integrity_hash` column, check:
```sql
SELECT COUNT(*) AS total, COUNT(integrity_hash) AS with_hash,
       COUNT(DISTINCT integrity_hash) AS unique_hashes
FROM {table_name};
```

Report:
- All rows NULL → WARNING (hash not computed — ADR-002 implementation debt)
- Some rows NULL, some populated → CRITICAL (partial hash — data integrity gap)
- All rows populated with same hash → INFO (single source file, expected)
- All rows populated with multiple hashes → INFO (multiple source files or versions)

Tables to check: `abs_census_wpp`, `abs_census_w13`, `anzsic_subdivisions`, `dataset_versions`.

Also check `dataset_versions.integrity_hash` specifically:
```sql
SELECT dataset_name, version_key, integrity_hash
FROM dataset_versions
WHERE integrity_hash IS NULL OR integrity_hash = 'multi-release';
```
Any rows returned → WARNING (version provenance incomplete per ADR-002).

### Check 6: Transformation Log Coverage

Query `transformation_log` to check which derived stages have logged their last execution:
```sql
SELECT target_table, status, completed_at, rows_affected
FROM transformation_log
WHERE status = 'success'
ORDER BY completed_at DESC;
```

For each `compute_*` and `derive_*` stage, check if it has a successful entry. Report:
- No entry for a derived stage → WARNING (stage may not be logging to transformation_log)
- Last entry has `rows_affected = 0` → WARNING (computation produced no output)
- Last entry is >30 days old → INFO (may need refresh)

### Check 7: Circular Dependency Detection

Walk the DAG `depends_on` edges and detect any cycles. Report:
- Cycle found → CRITICAL (pipeline will deadlock)
- No cycles → INFO (DAG is valid)

This can be done by reading the Python source — no need to execute the pipeline.

## Output Format

Produce a structured diagnostic report:

```
# Pipeline Diagnostics Report
Generated: {timestamp}
Pipeline: {stage_count} stages ({optional_count} optional)

## CRITICAL Issues ({count})
[List each with check number, description, and affected stage/table]

## WARNING Issues ({count})
[List each with check number, description, and recommendation]

## INFO ({count})
[List each — healthy confirmations and minor notes]

## Summary
- Pipeline DAG: {valid/invalid}
- Table coverage: {covered}/{total} tables have pipeline stages
- Integrity hashes: {populated}/{total} tables with hash columns populated
- Row counts: {matching}/{total} tables within 10% of expected
- Transformation log: {logged}/{total} derived stages have log entries
```

## Important Notes

- This is a **read-only** diagnostic. Never modify files, database rows, or pipeline state.
- The diagnostic runs against the **current database state** — tables must be populated for row count and hash checks to be meaningful.
- Pipeline stages use `_noop` placeholder functions — the diagnostic checks dependency edges, not execution logic.
- The `company_classifications` and `api_request_log` tables are runtime-populated and should not be flagged as missing from the pipeline.
