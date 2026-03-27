# Workforce AI Impact Analysis Platform

Analyzes how AI reshapes work at the task level. Combines O*NET occupational taxonomy, Eloundou 2024 theoretical exposure scores, Microsoft "Working with AI" empirical applicability scores, Anthropic Economic Index (AEI) empirical usage data, BLS/ABS employment statistics, and GPTVal longitudinal capability measures to produce workforce planning intelligence.

**Core insight**: AI capability follows a compounding, directional trajectory — a rising waterline across task landscapes. The platform tracks where the waterline sits today and where it's heading.

## Architecture — Two Tiers (DO NOT CONFLATE)

**Tier 1 — Industry Intelligence** (public data only, no HRIS required)
- Ingests O*NET, Eloundou exposure scores, Microsoft AI applicability scores, AEI snapshots, OEWS/ABS employment data
- Computes task drift and temporal exposure trajectories (GPTVal tracking)
- Classifies tasks as departing / enduring / emerging per occupation
- Serves industry benchmarking as a standalone product — no privacy controls needed
- Entry point for client engagement before any org data is shared

**Tier 2 — Organisational Overlay** (requires HRIS upload)
- Maps client workforce (CSV) to O*NET-SOC codes via 3-layer matching cascade
- Overlays Tier 1 intelligence onto actual org headcount
- Full RBAC + privacy controls apply here; Tier 2 MUST query through privacy views

**Architectural rule**: Tier 1 pipelines and Tier 2 pipelines are separate. Never route Tier 2 (org data) through Tier 1 endpoints. Never apply Tier 2 privacy views to Tier 1 public data.

## Data Model Invariants

These are hard rules. Do not optimise around them.

- **E0/E1/E2** (not E1/E2/E3): E0=overall (γ), E1=direct α, E2=complementary β — Eloundou framework, occupation-level data LOADED (923 occupations)
- **Beta = E1 + 0.5×E2** — the 0.5 weight is from the published research; can exceed 1.0; do not change the coefficient
- **E0 ≥ max(E1, E2)** always — flag violations as data quality issues, do not silently fix (verified: zero violations in loaded data)
- **Dual rater scores**: Eloundou provides both GPT-4 (`dv_`) and human annotator scores — store both, prefer GPT-4 for scoring
- **Microsoft AI applicability scores** complement Eloundou as empirical baseline — range 0.0–0.49, IWA-level metrics join to O*NET DWAs
- **Eloundou is occupation-level only** — DWA-level scores must be derived via Strategy A (distribute through task-to-DWA mapping weighted by importance) or Strategy B (LLM rubric)
- **One employee → exactly one O*NET SOC code** — not many-to-many
- **Matching cascade stops at first confident match** — do not continue to find a "better" match
- **AEI snapshots are immutable once ingested** — new releases append, never overwrite
- **O*NET version must be stored** with every derived record (currently 28.1)
- **GPTVal scores are versioned** by model era — never merge scores across model generations

## Exposure Zone Classification (configurable thresholds, these are defaults)
Based on Eloundou Beta scores (E1 + 0.5×E2). Occupation-level data is loaded (923 occupations). DWA-level derivation is a future computation step.
- E2 zone (green, automated): Beta ≥ 0.85
- E1 zone (blue, augmented): 0.40 ≤ Beta < 0.85
- E0 zone (orange, insulated): Beta < 0.40

## Privacy Rules (Tier 2 only — HARD CONSTRAINTS, not preferences)
- **N≥5**: Every aggregate must contain ≥5 employees or be suppressed — no exceptions
- **Manager with <5 reports**: Show individual tasks for that manager's own role only; suppress team aggregates
- **Leaf node anonymisation**: Individual contributors shown as "Team Member" in manager views — cannot be toggled off by users
- **Manager scope**: Reporting line subtree only; cannot see lateral teams
- **Executive scope**: Aggregates only — never individual records
- **C-suite**: Admin access only
- **All Tier 2 dashboard queries MUST go through privacy views** (manager_team_view, executive_dashboard_view) — never raw tables

## Build Dependency Chain
```
Tier 1 (parallel track — no blockers):
  [x] Data Ingestion: O*NET, Eloundou, Microsoft AI, AEI, AEI Temporal, OEWS
  [x] Eloundou DWA Derivation (Strategy A)
  [x] Infrastructure: dataset_versions, transformation_log
  [x] FR-8.2 Drift Calculation (4,605 tasks, velocity via linregress)
  [x] FR-8.3 Task Classification (558 departing, 2,971 enduring, 4 below_threshold)
  [x] FR-8.4 OEWS Industry Profiles (7,935 profiles, 20 sectors, 153M workers)
  [x] FR-8.5 Tier 1 Dashboard (6 pages: Sectors, Sector Detail, Composite Sector, Occupations, Drift, Search) — data storytelling: employment-weighted scores, bubble chart, narratives, ContextualScoreCards; composite multi-sector analysis (SectorChipSelector → /sectors/composite with blended metrics, unified occupation table, narrative summary); CompanyLookup collapsible card on Sectors page (type-ahead pg_trgm search across ASX companies + ASX code badges + AI classify button via Claude Haiku + purple theme)
  [x] FR-8.7 GDPval benchmark ingested (220 tasks, 44 occupations, 10,453 rubric items); gdpval_evaluations table ready for model-era scores; GDPval API live (GET /gdpval/summary, GET /gdpval/occupations/{soc_code}); GDPval badges on occupation detail header and sector role rows; GDPval filter toggle on Occupations and Sector Detail pages (filters to 44 benchmark occupations); AEI Task Intelligence panel (4 SVG visualisations); GDPval Benchmark panel (3 visualisations); task matrix API enriched with automation_pct, augmentation_pct, gdpval_benchmark_count
  [x] FR-8.9 Industry Crosswalk (21 NAICS↔ANZSIC mappings via ISIC Rev.4 bridge; ABS employment loaded 2,743 rows; 491 ANZSCO→SOC concordance rows via semantic matching; industry_occupation_profiles extended with region column; AU profiles computed 1,084 rows; all 4 sector endpoints accept ?region=US|AU; RegionSelector.tsx component; 13 new AU tests)

Cross-cutting:
  [x] Observability (ADR-007 Phases 1 & 2 complete):
      - Migration 015: api_request_log table (method, path, status_code, duration_ms, timestamp)
      - Migration 016: request_id column + index (correlation ID linkage)
      - TimingMiddleware: X-Request-Duration-Ms + X-Request-ID on every response; optional DB logging (enable_request_logging setting)
      - contextvars.ContextVar: request_id available to all layers within a request scope
      - GET /api/v1/admin/health, /admin/metrics, /admin/slow-queries (pg_stat_statements top 10)
      - tests/test_performance.py: 12 tests — middleware headers, admin endpoints, P95 thresholds (pytest -m slow)
      - Toolchain: ruff C90 rule, max-complexity=10; .pre-commit-config.yaml (black + ruff + mypy on every commit)
      - Deferred: frontend Web Vitals, OpenTelemetry (post-microservices), alerting (post-production)

Tier 2 (sequential — each stage blocks the next):
  [ ] FR-1 (Org Hierarchy) → FR-7 (Privacy Controls) → FR-6 (Dashboards)
  [ ] FR-1 (Matching) → FR-2 → FR-3 (Tasks) → FR-4 (Scoring) → FR-5 (Analytics)
```

**Critical blockers**: FR-7 cannot start until FR-1.3/FR-1.4 (hierarchy_path) complete. FR-6 must use FR-7 privacy views.

## Data Sources Quick Reference
- **O*NET 28.1**: Tab-delimited files from onetcenter.org (1,016 occupations total; 923 in hierarchy after filtering 93 residual "All Other" + military SOC-55 occupations that lack task data). ~19,500 tasks, 65k+ titles. LOADED.
- **Eloundou 2024**: Occupation-level exposure scores (923 occupations, dual GPT-4 + human raters). LOADED. DWA-level derivation LOADED (17,537 rows).
- **Microsoft "Working with AI"**: CC-BY 4.0, empirical Copilot usage (Jan–Sept 2024). 785 SOC scores, 332 IWA metrics, 13,698 SOC-to-IWA mappings. LOADED.
- **AEI**: HuggingFace CC-BY — labor market (756 jobs, 17,998 tasks) + temporal (16,976 snapshots across 4 model eras). LOADED.
- **BLS OEWS**: US headcount weighting by occupation × industry (NAICS). 8,573 rows. LOADED.
- **ABS/JSA**: JSA Occupation Profiles Nov 2025 (Revised). ANZSCO × ANZSIC employment by occupation. 2,743 rows across 19 ANZSIC divisions. LOADED.
- **GPTVal**: Longitudinal AI capability benchmarks; versioned by model era (sonnet-3.5, 3.7, 4, 4.5...). NOT LOADED.
- **OpenAI GDPval**: MIT license — 220 real-world knowledge tasks across 44 occupations and 9 NAICS sectors. Tasks mapped to O*NET SOC codes (43 exact + 1 contextual match). Rubric-graded evaluations (10,453 items). gdpval_evaluations table ready for model-era scores to enable FR-8.7 waterline velocity. LOADED.

## Data Load Status

All Tier 1 reference data is ingested. See `docs/INGESTION_RUNBOOK.md` for rebuild instructions.

| Table | Rows | Source |
|-------|------|--------|
| onet_occupations | 1,016 | O*NET 28.1 |
| onet_task_statements | 18,796 | O*NET 28.1 |
| onet_task_ratings | 161,559 | O*NET 28.1 |
| onet_work_activities | 73,308 | O*NET 28.1 |
| onet_dwa_references | 2,087 | O*NET 28.1 |
| onet_tasks_to_dwas | 23,850 | O*NET 28.1 |
| onet_sample_titles | 7,953 | O*NET 28.1 |
| onet_alternate_titles | 57,543 | O*NET 28.1 |
| onet_emerging_tasks | 328 | O*NET 28.1 |
| eloundou_occ_scores | 923 | Eloundou 2024 |
| eloundou_dwa_scores | 17,537 | Derived (Strategy A) |
| ms_ai_applicability_scores | 785 | Microsoft Working with AI |
| ms_ai_soc_metrics | 785 | Microsoft Working with AI |
| ms_ai_iwa_metrics | 332 | Microsoft Working with AI |
| ms_ai_soc_to_iwas | 13,698 | Microsoft Working with AI |
| ms_ai_physical_tasks | 18,796 | Microsoft Working with AI |
| aei_job_exposure | 756 | AEI (Anthropic) |
| aei_task_penetration | 17,998 | AEI (Anthropic) |
| aei_task_snapshots | 16,976 | AEI Temporal (4 model eras) |
| oews_employment | 8,573 | BLS OEWS May 2024 |
| abs_employment | 2,743 | ABS/JSA Nov 2025 (AU) |
| anzsco_soc_concordance | 491 | Derived (semantic matching, FR-8.9) |
| industry_crosswalk | 21 | Derived (NAICS↔ANZSIC via ISIC Rev.4, FR-8.9) |
| task_drift_metrics | 4,605 | Derived (FR-8.2 linregress + FR-8.3 classification) |
| industry_occupation_profiles | 9,019 | Derived (FR-8.4/FR-8.9 — 7,935 US + 1,084 AU; region column added) |
| onet_title_embeddings | 66,512 | Derived (sentence-transformers, Layer 2 semantic search) |
| gdpval_tasks | 220 | OpenAI GDPval |
| gdpval_rubric_items | 10,453 | OpenAI GDPval |
| gdpval_evaluations | 0 | (future model-era scores for FR-8.7) |
| asx_company_sectors | 1,978 | ASX listed companies (GICS→ANZSIC→NAICS, FR-8.5 company lookup) |
| company_classifications | 0 | LLM classification cache (Claude Haiku, FR-8.5 company lookup) |
| api_request_log | 0 | Live request telemetry (ADR-007, 30-day retention) |
| **TOTAL** | **~537,633** | |

## Tech Stack
- **Backend**: Python 3.12, FastAPI, PostgreSQL 16 + pgvector + pg_trgm, Alembic, SQLAlchemy
- **Matching**: sentence-transformers (all-MiniLM-L6-v2), pgvector cosine similarity
- **Frontend**: TypeScript, React 18, Recharts / D3
- **Dev tools**: black (line 100), ruff (C90 + max-complexity=10), mypy --strict, pytest, vitest, Playwright (E2E)
- **Enforcement**: `.pre-commit-config.yaml` — black + ruff + mypy run on every `git commit` (load-bearing, not advisory)
- **Windows terminal**: Claude Code via `claude` command in PowerShell or WSL2

## Key Reference Docs (read when working in these areas)
- Development setup: `docs/SETUP.md`
- Microsoft AI applicability data: `docs/MICROSOFT_AI_APPLICABILITY.md`
- Domain rules & data contracts: `docs/domain-model.md`
- FR-1 hierarchy (Tier 2 foundation): `docs/fr1-hierarchy.md`
- FR-8 drift engine (Tier 1 intelligence): `docs/fr8-role-evolution.md`
- Security / RBAC / privacy implementation: `docs/security.md`
- Test strategy & coverage targets: `docs/testing.md`
- Performance & observability: ADR-007 (`ai_working/decisions/ADR-007-performance-instrumentation.md`)
- ADRs: `ai_working/decisions/`
- Discoveries & patterns: `ai_working/discoveries/`

## Engineering Principles (Rob Pike — enforced, not aspirational)

These are structural constraints, not style preferences. They are enforced by tooling where possible.

### Rule 1 & 2 — Measure. Don't guess.
- Every HTTP request records `duration_ms` and `request_id` in `api_request_log`
- `X-Request-Duration-Ms` and `X-Request-ID` headers on every response — visible in browser devtools
- `GET /api/v1/admin/slow-queries` surfaces `pg_stat_statements` top 10 — slow SQL is always queryable
- `GET /api/v1/admin/metrics` returns P50/P95/max per path for the last hour
- `tests/test_performance.py` includes P95 threshold assertions (`pytest -m slow`) — perf regressions are caught, not discovered by users
- Correlation: `X-Request-ID` links HTTP latency rows to SQL cost rows — slow endpoints can be traced to slow queries
- **Do not add a performance optimisation without first running `pytest -m slow` and querying `/admin/slow-queries`**

### Rule 3 & 4 — Simple algorithms, simple data structures.
- `ruff` C90 rule enforced: `max-complexity = 10`. Functions exceeding cyclomatic complexity 10 are a lint error.
- If a function hits the limit, decompose it — do not raise the global threshold or add `# noqa: C901` without a comment explaining why.
- Prefer flat data structures. If a query requires more than two JOINs to answer a simple question, the schema is wrong.
- No clever abstractions without a demonstrated need. Demonstrate the need with a failing test or a measured bottleneck.

### Rule 5 — Data dominates.
- Schema is the source of truth. If the data model is right, the service layer should be near-trivial.
- Every derived record carries `NOT NULL` FK references to the source versions that produced it (ADR-002). Provenance is structural, not optional.
- `integrity_hash` must be computed on ingest (SHA-256 of source file bytes). **Known gap: not yet implemented in all ingestion scripts.** Fix before any production pipeline.
- Data invariants are pytest tests (`tests/test_data_invariants.py`), not comments. If an invariant can be violated silently, it will be.

### Toolchain enforcement checklist (for new contributors)
```
1. Install pre-commit:  pip install pre-commit && pre-commit install
2. Verify hooks run:    pre-commit run --all-files
3. Run perf baseline:  cd src/backend && pytest tests/test_performance.py -m slow -v
4. Check complexity:   cd src/backend && ruff check app/ --select C90
5. Check invariants:   cd src/backend && pytest tests/test_data_invariants.py -v
```

## Commit Convention
`feat(FR-X):`, `fix(FR-X):`, `test(FR-X):`, `refactor:`, `docs:`, `chore:`
