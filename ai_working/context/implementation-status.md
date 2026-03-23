# Implementation Status

Last updated: 2026-03-23

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

### Tier 1 API (15 endpoints, live)
- **Datasets**: `GET /api/v1/datasets` — data vintage for dashboard footers
- **Sectors**: `GET /api/v1/sectors`, `GET /api/v1/sectors/{code}/occupations`, `GET /api/v1/sectors/{code}/priorities`
- **Occupations**: `GET /api/v1/occupations`, `GET /api/v1/occupations/hierarchy`, `GET /api/v1/occupations/{soc}`, `GET /api/v1/occupations/{soc}/tasks`, `GET /api/v1/occupations/{soc}/matrix`
- **Drift**: `GET /api/v1/drift/summary`, `GET /api/v1/drift/departing`, `GET /api/v1/drift/enduring`, `GET /api/v1/drift/below-threshold`
- **Search**: `GET /api/v1/search?q=...` — searches 65,496 O*NET sample + alternate titles using pg_trgm trigram similarity (two-pass: exact substring + fuzzy matching, results show similarity percentage)
- No auth required (Tier 1 = public data only)
- OpenAPI docs at http://localhost:8000/docs
- 26 API endpoint tests in `tests/test_api.py` (22 original + 4 search)

### Tier 1 Dashboard (FR-8.5)
- **Sectors page** (`/`): Zone distribution donut chart, three-tier evidence bar chart, metric cards, interactive sector table
- **Sector detail page** (`/sectors/:code`): Redesigned with priority view showing top-N occupations ranked by composite impact score (40% exposure, 30% headcount, 15% location quotient, 15% drift velocity), risk factor badges, toggle to full occupation mix
- **Occupations page** (`/occupations`): SOC hierarchy tree (23 major groups, expandable), occupation detail panel with score chips, employment by sector bar chart, top tasks by AI usage (colour-coded by drift classification)
- **Occupation detail page** (`/occupations/:soc`): Includes TaskMatrix chart plotting tasks by importance (Y) vs automation potential (X) across four quadrants: insulated, augmented, disrupted, routine
- **Drift analysis page** (`/drift`): Classification pie chart, usage vs velocity scatter plot, below-threshold alert panel, fastest departing tasks bar chart, top enduring tasks list
- **Role search page** (`/search`): Search 65,496 O*NET titles with fuzzy matching (pg_trgm trigram similarity), results with zone badges, three-tier score pills, and similarity percentage
- **Tech**: React 18, React Router, Recharts for all charts, Inter font, dark sidebar design system (zone colours: orange E0, blue E1, green E2, red alerts)

### Infrastructure
- **dataset_versions**: Central version registry (ADR-002)
- **dataset_version_deltas**: Pre-computed diffs between dataset versions (ADR-002)
- **transformation_log**: Lineage tracking for derived computations (ADR-001)
- **11 Alembic migrations**: All applied (migration 011: pg_trgm extension + GIN indexes for fuzzy search)

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
- **FR-8.7**: Longitudinal Waterline Tracking
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
- 67 tests passing (data invariants, cross-dataset joins, drift velocity, classification, ingestion utilities, transformation decorator, 26 API endpoint tests)
- No frontend tests yet

## Success Metrics Progress

| Metric | Target | Current |
|--------|--------|---------|
| Data ingestion | All reference datasets | Complete |
| AEI drift computed | >=3,000 tasks | 4,605 (target exceeded) |
| O*NET matching automation | >=95% | 0% |
| Hierarchy build (10k employees) | <5s | -- |
| N>=5 enforcement | 100% | -- |
| Backend test coverage | >=80% | 67 tests passing (coverage % not yet measured) |

## Technical Debt
- Eloundou DWA Strategy B (LLM rubric for uncovered DWAs) not yet implemented
- GPTVal integration not started
- ABS/JSA Australian employment data not loaded

## ADRs Created
- ADR-001: Data lineage catalog strategy
- ADR-002: Reference dataset versioning
- ADR-003: Toolchain selection
