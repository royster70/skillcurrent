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

### Infrastructure
- **dataset_versions**: Central version registry (ADR-002)
- **dataset_version_deltas**: Pre-computed diffs between dataset versions (ADR-002)
- **transformation_log**: Lineage tracking for derived computations (ADR-001)
- **8 Alembic migrations**: All applied

### Database Schema
- All 20+ tables created and populated
- Foreign keys, indexes, and constraints in place
- See `docs/DATA_DICTIONARY.md` for full schema reference

### Architecture Decisions
- ADR-001: Data lineage catalog strategy
- ADR-002: Reference dataset versioning
- ADR-003: Toolchain selection

## Not Started

### Tier 1 — Industry Intelligence (computation + dashboards)
- **FR-8.2**: Task Drift Calculation
- **FR-8.3**: Task Classification (departing/enduring/emerging)
- **FR-8.4**: Industry Profiles computation (table exists, data not computed)
- **FR-8.5**: Tier 1 Dashboard
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

### API Layer
- No API endpoints built yet
- FastAPI app scaffold exists

### Frontend
- No frontend beyond initial scaffold
- TypeScript/React 18 stack selected

### Tests
- No tests yet (being built separately)

## Success Metrics Progress

| Metric | Target | Current |
|--------|--------|---------|
| Data ingestion | All reference datasets | Complete |
| AEI drift computed | >=3,000 tasks | 0 |
| O*NET matching automation | >=95% | 0% |
| Hierarchy build (10k employees) | <5s | -- |
| N>=5 enforcement | 100% | -- |
| Backend test coverage | >=80% | 0% |

## Technical Debt
- Eloundou DWA Strategy B (LLM rubric for uncovered DWAs) not yet implemented
- GPTVal integration not started
- ABS/JSA Australian employment data not loaded

## ADRs Created
- ADR-001: Data lineage catalog strategy
- ADR-002: Reference dataset versioning
- ADR-003: Toolchain selection
