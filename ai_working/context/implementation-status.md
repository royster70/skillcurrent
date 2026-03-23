# Implementation Status

Last updated: 2026-03-21

## 🏗 Not Started

### Tier 1 — Industry Intelligence
- **FR-8.1**: AEI Data Ingestion
- **FR-8.2**: Task Drift Calculation
- **FR-8.3**: Task Classification (departing/enduring/emerging)
- **FR-8.4**: OEWS/ABS Industry Profiles
- **FR-8.5**: Tier 1 Dashboard
- **FR-8.6**: GPTVal Integration
- **FR-8.7**: Longitudinal Waterline Tracking
- **FR-8.9**: Industry Crosswalk (NAICS↔ANZSIC)

### Tier 2 — Organisational Overlay
- **FR-1**: Data Ingestion + CSV Upload
- **FR-1 (hierarchy)**: WITH RECURSIVE CTE, hierarchy_path, leaf nodes
- **FR-2**: O*NET Title Matching (3-layer cascade)
- **FR-3**: Task/DWA Retrieval
- **FR-4**: Exposure Scoring (E0/E1/E2)
- **FR-5**: Analytics Aggregation
- **FR-7**: Privacy Controls (N≥5, RBAC, anonymisation)
- **FR-6**: Org Dashboards

## 📊 Success Metrics Progress

| Metric | Target | Current |
|--------|--------|---------|
| AEI drift computed | ≥3,000 tasks | 0 |
| O*NET matching automation | ≥95% | 0% |
| Hierarchy build (10k employees) | <5s | — |
| N≥5 enforcement | 100% | — |
| Backend test coverage | ≥80% | 0% |

## 🔧 Technical Debt
(none yet)

## 📝 ADRs Created
(none yet)
