# Implementation Status

Last updated: 2026-03-25

## Completed

### Data Ingestion (all complete)
- **O*NET 28.1**: 346,440 rows across 9 tables (occupations, tasks, ratings, DWAs, work activities, sample titles, alternate titles, emerging tasks, task-to-DWA mappings)
- **Eloundou 2024**: 923 occupation-level exposure scores (dual GPT-4 + human raters)
- **Eloundou DWA Derivation**: 17,537 DWA-level scores derived via Strategy A (importance-weighted distribution)
- **Microsoft "Working with AI"**: 34,396 rows across 5 tables (applicability scores, SOC metrics, IWA metrics, SOC-to-IWA mappings, physical tasks)
- **AEI Labor Market**: 18,754 rows (756 job exposures + 17,998 task penetration scores)
- **AEI Temporal**: 16,976 task snapshots across 6 releases and 4 model eras
- **BLS OEWS**: 8,573 employment rows (May 2024 release)
- **ABS/JSA Employment**: 2,743 rows — JSA Occupation Profiles Nov 2025 (Revised); ANZSCO × ANZSIC employment distributed across top 3 industries per occupation using 50/30/20 rank weights
- **Industry Crosswalk**: 21 NAICS↔ANZSIC mappings via ISIC Rev.4 bridge (Statistics Canada + UN Statistics Division + ABS sources)
- **ANZSCO→SOC Concordance**: 491 rows built by semantic matching (all-MiniLM-L6-v2) against onet_title_embeddings; confidence ≥0.85 auto-accepted, 0.70–0.85 flagged for review

### Tier 1 Computation (FR-8.2/8.3)
- **FR-8.2 Drift Calculation**: 4,605 tasks processed, velocity via scipy.stats.linregress across 4 AEI model eras
- **FR-8.3 Task Classification**: 558 departing, 2,971 enduring, 4 below_threshold, 1,072 unclassified (single snapshot)
- **task_drift_metrics** table populated with velocity, R², p-value, classification per task

### Tier 1 Computation (FR-8.4)
- **FR-8.4 Industry Profiles**: 7,935 US profiles across 20 NAICS sectors (~153M workers)
- Multi-source scoring: eloundou_beta, ms_ai_applicability, aei_exposure, drift_velocity, drift_classification
- Computed via `python -m scripts.compute_industry_profiles`
- **industry_occupation_profiles** table populated with multi-source scoring columns (migration 010)

### Tier 1 Data Integration (FR-8.9)
- **FR-8.9 Industry Crosswalk + AU Employment**: Fully complete
- **industry_crosswalk**: 21 rows — NAICS 2022 ↔ ANZSIC 2006 via ISIC Rev.4 bridge (`scripts/ingest_crosswalk.py`)
- **abs_employment**: 2,743 rows — ABS/JSA Nov 2025 occupation profiles distributed across ANZSIC divisions (`scripts/ingest_abs.py`)
- **anzsco_soc_concordance**: 491 rows — ANZSCO 4-digit unit groups mapped to O*NET SOC codes via semantic matching (`scripts/build_anzsco_concordance.py`)
- **industry_occupation_profiles**: Extended with `region` column (migration 014); US backfilled to `region='US'`; 1,084 AU profiles added via `python -m scripts.compute_industry_profiles --region AU --year 2025`; total table now 9,019 rows
- **API**: All 4 sector endpoints (`/sectors`, `/sectors/composite`, `/sectors/{code}/occupations`, `/sectors/{code}/priorities`) accept `?region=US|AU` (default US, fully backward compatible); invalid region values rejected with 422
- **Frontend**: `RegionSelector.tsx` component (US/AU flag toggle) on Sectors page; region propagated via URL `?region=AU` parameter to all sector sub-pages

### Tier 1 API (19 endpoints, live)
- **Datasets**: `GET /api/v1/datasets` — data vintage for dashboard footers
- **Sectors**: `GET /api/v1/sectors` (now returns employment-weighted scores: weighted_eloundou_beta, weighted_ms_applicability, weighted_aei_exposure, workers_e0/e1/e2), `GET /api/v1/sectors/composite?codes=...` (blends 2+ sectors into employment-weighted composite with de-duplicated occupations and multi-sector badges), `GET /api/v1/sectors/{code}/occupations`, `GET /api/v1/sectors/{code}/priorities`
- **Occupations**: `GET /api/v1/occupations`, `GET /api/v1/occupations/hierarchy` (923 occupations — 93 residual "All Other" and military SOC-55 occupations filtered from hierarchy as they lack task data), `GET /api/v1/occupations/{soc}` (now includes `gdpval_task_count` and `gdpval_available` fields), `GET /api/v1/occupations/{soc}/tasks`, `GET /api/v1/occupations/{soc}/matrix`
- **GDPval**: `GET /api/v1/gdpval/summary` — benchmark overview (total tasks, occupations, rubric items, sectors list, per-occupation task counts); `GET /api/v1/gdpval/occupations/{soc_code}` — full benchmark detail for one SOC (tasks + rubric items)
- **Drift**: `GET /api/v1/drift/summary`, `GET /api/v1/drift/departing`, `GET /api/v1/drift/enduring`, `GET /api/v1/drift/below-threshold`
- **Search**: `GET /api/v1/search?q=...` — searches 65,496 O*NET sample + alternate titles using pg_trgm trigram similarity (two-pass: exact substring + fuzzy matching, results show similarity percentage). Results include `has_tasks` boolean and `category` field (`'residual'`, `'military'`, or `null`) so filtered occupations are flagged in search results even though they are excluded from the hierarchy.
- **Semantic Search**: `POST /api/v1/search/semantic` — Layer 2 semantic search using sentence-transformers (all-MiniLM-L6-v2) + pgvector HNSW index over 66,512 title embeddings. Accepts query text and optional job description textarea. Returns nearest O*NET occupations by cosine similarity. Results include `has_tasks` and `category` fields.
- No auth required (Tier 1 = public data only)
- OpenAPI docs at http://localhost:8000/docs

### Tier 1 Dashboard (FR-8.5 + FR-8.7 UI, 6 pages)
- **Sectors page** (`/`): Worker-count metric cards, zone pie toggle (workers/occupations), sector positioning bubble chart (replaces misleading three-tier bar chart), weighted scores in sector table; SectorChipSelector bar for building composite multi-sector views (search dropdown, zone-coloured chips, "Analyse N Sectors" CTA)
- **Composite sector page** (`/sectors/composite`): Multi-sector blended analysis with employment-weighted metric cards (E0/E1/E2 + purple composite Beta), unified de-duplicated occupation table with multi-sector badges per row, auto-generated narrative summary panel. URL-driven via ?codes= param for shareability.
- **Sector detail page** (`/sectors/:code`): Narrative summary, navigation fix (clicking role navigates to /occupations?selected=SOC), ContextualScoreCards with percentile context; priority view showing top-N occupations ranked by composite impact score (40% exposure, 30% headcount, 15% location quotient, 15% drift velocity), risk factor badges, toggle to full occupation mix; GDPval coverage indicators on role rows; "GDPval Only" filter button to show only the 44 benchmark occupations (normalises 8-digit/7-digit SOC codes for matching)
- **Occupations page** (`/occupations`): SOC hierarchy tree (23 major groups, expandable), occupation detail panel with score chips, employment by sector bar chart, top tasks by AI usage (colour-coded by drift classification); GDPval filter button to filter hierarchy to only the 44 occupations with GDPval benchmarks; interactive GDPval badge on occupation detail header (expand/collapse); AEI Task Intelligence panel (temporal trajectory, penetration ranking, auto/aug split, coverage ring); GDPval Benchmark panel (score range chart, rubric composition, tag frequency bars)
- **Occupation detail page** (`/occupations/:soc`): Includes TaskMatrix chart — redesigned quadrant chart with era timeline sparklines. Two temporal view modes: Baseline (Eloundou DWA Beta) and By Era (toggle Sonnet 3.5/3.7/4/4.5). Four overlay modes: None, Usage Level (dot size reflects AEI penetration), Usage Trend (concentric rings indicate trend direction), GDPval (conditional overlay strip when gdpval_benchmark_count > 0). Mini sparklines in task list show temporal usage. API returns era_snapshots[] per task (with automation_pct, augmentation_pct), available_eras[], and gdpval_benchmark_count. (Drift arrows removed — AI capability doesn't go backward, so arrows were conceptually wrong.) ContextualScoreCards with percentile bar, predicted/measured tags, explainer popover.
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
- **14 Alembic migrations**: All applied (migration 012: onet_title_embeddings; migration 013: gdpval_tasks, gdpval_rubric_items, gdpval_evaluations; migration 014: region column on industry_occupation_profiles, abs_employment, anzsco_soc_concordance)

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
- **132 backend tests** at 83% coverage — test_api.py (83: Search, Health, Datasets, Sectors, Occupations, Hierarchy, Drift, SectorPriorities, TaskMatrix, CompositeSector, GDPval, SemanticSearch, OccupationsCoverage, AURegion [9 new]), test_data_invariants.py (15: includes 4 new AU invariant tests — test_crosswalk_covers_all_naics_sectors, test_anzsco_concordance_coverage, test_au_profiles_have_region, test_au_profiles_have_exposure_scores), test_drift.py (15), test_drift_results.py (8), test_cross_dataset_joins.py (5), test_transformations.py (3), test_onet_ingestion.py (3)
- **45 component tests** via Vitest + @testing-library/react — AEITaskDetailPanel (12), GDPvalBenchmarkPanel (11), SectorChipSelector (11), RegionSelector (11 new)
- **37 Playwright E2E browser tests** across 5 suites — sectors (4), search-to-occupation (5), occupations (14), drift (4), composite (10)
- **Total: 214 tests** (132 backend + 45 component + 37 E2E)
- E2E config: `playwright.config.ts`, test files in `e2e/` directory, run via `npm run test:e2e`

## Success Metrics Progress

| Metric | Target | Current |
|--------|--------|---------|
| Data ingestion | All reference datasets | Complete |
| AEI drift computed | >=3,000 tasks | 4,605 (target exceeded) |
| O*NET matching automation | >=95% | 0% |
| Hierarchy build (10k employees) | <5s | -- |
| N>=5 enforcement | 100% | -- |
| Backend test coverage | >=80% | 83% (132 backend + 45 component + 37 E2E = 214 total) |

## Technical Debt
- Eloundou DWA Strategy B (LLM rubric for uncovered DWAs) not yet implemented
- GPTVal integration not started
- GDPval evaluations not yet collected — gdpval_evaluations table is empty; model-era scoring pipeline for FR-8.7 waterline tracking not yet built (API and UI surface for GDPval benchmarks is complete)
- ANZSCO concordance low-confidence matches (<0.70 similarity) should be manually reviewed before use in Tier 2 matching

## ADRs Created
- ADR-001: Data lineage catalog strategy
- ADR-002: Reference dataset versioning
- ADR-003: Toolchain selection
