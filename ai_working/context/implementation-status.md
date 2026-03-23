# Implementation Status

Last updated: 2026-03-24

## Completed

### Data Ingestion (all complete)
- **O*NET 28.1**: 346,440 rows across 9 tables (occupations, tasks, ratings, DWAs, work activities, sample titles, alternate titles, emerging tasks, task-to-DWA mappings)
- **Eloundou 2024**: 923 occupation-level exposure scores (dual GPT-4 + human raters)
- **Eloundou DWA Derivation**: 17,537 DWA-level scores derived via Strategy A (importance-weighted distribution)
- **Microsoft "Working with AI"**: 34,396 rows across 5 tables (applicability scores, SOC metrics, IWA metrics, SOC-to-IWA mappings, physical tasks)
- **AEI Labor Market**: 18,754 rows (756 job exposures + 17,998 task penetration scores)
- **AEI Temporal**: 16,976 task snapshots across 6 releases and 4 model eras
- **BLS OEWS**: 8,573 employment rows (May 2024 release)

### Tier 1 Computation (FR-8.2/8.3)
- **FR-8.2 Drift Calculation**: 4,605 tasks processed, velocity via scipy.stats.linregress across 4 AEI model eras
- **FR-8.3 Task Classification**: 558 departing, 2,971 enduring, 4 below_threshold, 1,072 unclassified (single snapshot)
- **task_drift_metrics** table populated with velocity, R², p-value, classification per task

### Tier 1 Computation (FR-8.4)
- **FR-8.4 Industry Profiles**: 7,935 profiles across 20 NAICS sectors (~153M workers)
- Multi-source scoring: eloundou_beta, ms_ai_applicability, aei_exposure, drift_velocity, drift_classification
- Computed via `python -m scripts.compute_industry_profiles`
- **industry_occupation_profiles** table populated with multi-source scoring columns (migration 010)

### Tier 1 API (18 endpoints, live)
- **Datasets**: `GET /api/v1/datasets` — data vintage for dashboard footers
- **Sectors**: `GET /api/v1/sectors` (now returns employment-weighted scores: weighted_eloundou_beta, weighted_ms_applicability, weighted_aei_exposure, workers_e0/e1/e2), `GET /api/v1/sectors/{code}/occupations`, `GET /api/v1/sectors/{code}/priorities`
- **Occupations**: `GET /api/v1/occupations`, `GET /api/v1/occupations/hierarchy` (923 occupations — 93 residual "All Other" and military SOC-55 occupations filtered from hierarchy as they lack task data), `GET /api/v1/occupations/{soc}` (now includes `gdpval_task_count` and `gdpval_available` fields), `GET /api/v1/occupations/{soc}/tasks`, `GET /api/v1/occupations/{soc}/matrix`
- **GDPval**: `GET /api/v1/gdpval/summary` — benchmark overview (total tasks, occupations, rubric items, sectors list, per-occupation task counts); `GET /api/v1/gdpval/occupations/{soc_code}` — full benchmark detail for one SOC (tasks + rubric items)
- **Drift**: `GET /api/v1/drift/summary`, `GET /api/v1/drift/departing`, `GET /api/v1/drift/enduring`, `GET /api/v1/drift/below-threshold`
- **Search**: `GET /api/v1/search?q=...` — searches 65,496 O*NET sample + alternate titles using pg_trgm trigram similarity (two-pass: exact substring + fuzzy matching, results show similarity percentage). Results include `has_tasks` boolean and `category` field (`'residual'`, `'military'`, or `null`) so filtered occupations are flagged in search results even though they are excluded from the hierarchy.
- **Semantic Search**: `POST /api/v1/search/semantic` — Layer 2 semantic search using sentence-transformers (all-MiniLM-L6-v2) + pgvector HNSW index over 66,512 title embeddings. Accepts query text and optional job description textarea. Returns nearest O*NET occupations by cosine similarity. Results include `has_tasks` and `category` fields.
- No auth required (Tier 1 = public data only)
- OpenAPI docs at http://localhost:8000/docs

### Tier 1 Dashboard (FR-8.5 + FR-8.7 UI)
- **Sectors page** (`/`): Worker-count metric cards, zone pie toggle (workers/occupations), sector positioning bubble chart (replaces misleading three-tier bar chart), weighted scores in sector table
- **Sector detail page** (`/sectors/:code`): Narrative summary, navigation fix (clicking role navigates to /occupations?selected=SOC), ContextualScoreCards with percentile context; priority view showing top-N occupations ranked by composite impact score (40% exposure, 30% headcount, 15% location quotient, 15% drift velocity), risk factor badges, toggle to full occupation mix; GDPval coverage indicators on role rows; "GDPval Only" filter button to show only the 44 benchmark occupations (normalises 8-digit/7-digit SOC codes for matching)
- **Occupations page** (`/occupations`): SOC hierarchy tree (23 major groups, expandable), occupation detail panel with score chips, employment by sector bar chart, top tasks by AI usage (colour-coded by drift classification); GDPval filter button to filter hierarchy to only the 44 occupations with GDPval benchmarks; GDPval badge on occupation detail header when benchmarks are available
- **Occupation detail page** (`/occupations/:soc`): Includes TaskMatrix chart — redesigned quadrant chart with era timeline sparklines. Two temporal view modes: Baseline (Eloundou DWA Beta) and By Era (toggle Sonnet 3.5/3.7/4/4.5). Three overlay modes: None, Usage Level (dot size reflects AEI penetration), Usage Trend (concentric rings indicate trend direction). Mini sparklines in task list show temporal usage. API returns era_snapshots[] per task and available_eras[]. (Drift arrows removed — AI capability doesn't go backward, so arrows were conceptually wrong.) ContextualScoreCards with percentile bar, predicted/measured tags, explainer popover.
- **Drift analysis page** (`/drift`): Classification pie chart, usage vs velocity scatter plot, below-threshold alert panel, fastest departing tasks bar chart, top enduring tasks list
- **Role search page** (`/search`): Two search modes — Text (pg_trgm trigram similarity over 65,496 titles) and Semantic (sentence-transformer embeddings over 66,512 titles via pgvector HNSW). Optional job description textarea for semantic mode. Results with zone badges, three-tier score pills, and similarity percentage. Clicking a result navigates to OccupationsPage with ?selected= URL param, auto-expanding the correct hierarchy group.
- **Collapsible sidebar**: Layout sidebar toggles between 260px expanded (full labels, data sources) and 64px collapsed (icons only) with smooth CSS transition
- **Tech**: React 18, React Router, Recharts for all charts, Inter font, dark sidebar design system (zone colours: orange E0, blue E1, green E2, red alerts)

### Layer 2 Semantic Search
- **onet_title_embeddings** table: 66,512 embeddings (384-dim, all-MiniLM-L6-v2) covering sample titles and alternate titles
- **pgvector HNSW index** for fast cosine similarity search
- **POST /api/v1/search/semantic** endpoint with optional job description input
- **Search page** updated with Semantic/Text mode toggle
- **Migration 012**: onet_title_embeddings table
- **asyncpg vector cast fix**: Changed `::vector` to `CAST(:embedding AS vector)` in embedding_service.py

### Infrastructure
- **dataset_versions**: Central version registry (ADR-002)
- **dataset_version_deltas**: Pre-computed diffs between dataset versions (ADR-002)
- **transformation_log**: Lineage tracking for derived computations (ADR-001)
- **13 Alembic migrations**: All applied (migration 012: onet_title_embeddings; migration 013: gdpval_tasks, gdpval_rubric_items, gdpval_evaluations)

### Database Schema
- All 20+ tables created and populated
- Foreign keys, indexes, and constraints in place
- See `docs/DATA_DICTIONARY.md` for full schema reference

### Architecture Decisions
- ADR-001: Data lineage catalog strategy
- ADR-002: Reference dataset versioning
- ADR-003: Toolchain selection

## Not Started

### Tier 1 — Industry Intelligence (remaining)
- **FR-8.7** (partial): Longitudinal Waterline Tracking — GDPval data ingested and API + UI complete; model evaluation scores (gdpval_evaluations) not yet collected; the waterline velocity computation pipeline (running models against rubrics and writing scores) is the remaining piece
- **FR-8.9**: Industry Crosswalk AU data load (table exists, NAICS-to-ANZSIC mappings not loaded)

### Tier 2 — Organisational Overlay
- **FR-1**: Data Ingestion + CSV Upload (org hierarchy, HRIS)
- **FR-1 (hierarchy)**: WITH RECURSIVE CTE, hierarchy_path, leaf nodes
- **FR-2**: O*NET Title Matching (3-layer cascade)
- **FR-3**: Task/DWA Retrieval
- **FR-4**: Exposure Scoring (E0/E1/E2)
- **FR-5**: Analytics Aggregation
- **FR-7**: Privacy Controls (N>=5, RBAC, anonymisation)
- **FR-6**: Org Dashboards

### Tests
- **90 backend API tests** at 83% coverage (data invariants, cross-dataset joins, drift velocity, classification, ingestion utilities, transformation decorator, API endpoint tests)
- **18 Playwright E2E browser tests** across 4 suites (sectors, search-to-occupation navigation, occupations, drift)
- **Total: 108 tests** (90 backend + 18 E2E)
- E2E config: `playwright.config.ts`, test files in `e2e/` directory, run via `npm run test:e2e`

## Success Metrics Progress

| Metric | Target | Current |
|--------|--------|---------|
| Data ingestion | All reference datasets | Complete |
| AEI drift computed | >=3,000 tasks | 4,605 (target exceeded) |
| O*NET matching automation | >=95% | 0% |
| Hierarchy build (10k employees) | <5s | -- |
| N>=5 enforcement | 100% | -- |
| Backend test coverage | >=80% | 83% (90 backend tests + 18 E2E = 108 total) |

## Technical Debt
- Eloundou DWA Strategy B (LLM rubric for uncovered DWAs) not yet implemented
- GPTVal integration not started
- GDPval evaluations not yet collected — gdpval_evaluations table is empty; model-era scoring pipeline for FR-8.7 waterline tracking not yet built (API and UI surface for GDPval benchmarks is complete)
- ABS/JSA Australian employment data not loaded

## ADRs Created
- ADR-001: Data lineage catalog strategy
- ADR-002: Reference dataset versioning
- ADR-003: Toolchain selection
