# Tier 1 API reference

SkillCurrent's Tier 1 (Industry Intelligence) API is a read-only REST API over
public occupational data. It needs no auth. The full, always-current spec is the
OpenAPI docs at `http://localhost:8000/docs` when the backend is running — this
page is the human-readable catalogue.

All paths are prefixed `/api/v1`. Region-aware endpoints default to `US`
(NAICS / O\*NET / BLS); pass `?region=AU` for the Australian market (ANZSIC /
OSCA / ABS).

## Sectors

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/sectors?region=US\|AU` | NAICS (US, default) or ANZSIC (AU) sectors with employment-weighted exposure stats (`weighted_eloundou_beta`, `weighted_ms_applicability`, `weighted_aei_exposure`, workers per zone). |
| `GET /api/v1/sectors/composite?codes=...&region=US\|AU` | Composite multi-sector analysis: blends 2+ sectors into an employment-weighted profile with de-duplicated occupations, zone worker counts, and per-occupation sector badges. |
| `GET /api/v1/sectors/{code}/occupations?region=US\|AU` | Occupations within a sector. |
| `GET /api/v1/sectors/{code}/priorities?region=US\|AU` | Priority roles ranked by composite impact score (40% exposure, 30% headcount, 15% location quotient, 15% drift velocity) with risk-factor badges. |
| `GET /api/v1/sectors/{code}/subdivisions` | ANZSIC subdivision breakdown (AU); empty for US codes. |

## Occupations (US)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/occupations` | Filterable list (`?sector`, `?zone`, `?classification`). |
| `GET /api/v1/occupations/hierarchy` | SOC major-group tree (923 occupations; 93 residual/military filtered). |
| `GET /api/v1/occupations/{soc}` | Three-tier detail + top sectors + drift + GDPval availability + `signal_coverage` (evidence-coverage: which of Eloundou/Microsoft/AEI cover this role, and a derived confidence word). |
| `GET /api/v1/occupations/{soc}/tasks` | Tasks with per-task drift velocity. |
| `GET /api/v1/occupations/{soc}/matrix` | Task positioning matrix: importance (Y) vs AI capability (Eloundou, X), four quadrants. Overlay modes (usage level / trend) + conditional GDPval strip. Returns `era_snapshots[]` per task and `available_eras[]`. |
| `GET /api/v1/occupations/{soc}/bearings` | Role "bearings": high-ground DWAs to deepen and drier adjacent roles sharing them (the data behind "build these skills"). |

## Occupations (AU — OSCA-keyed)

The Australian occupation layer (OSCA backbone + ASC skills, FR-9.x). Distinct
from the US surface: exposure is a **task-coverage** basis, and skills are real
named ASC core competencies.

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/au/occupations` | Compact index of OSCA occupations with an exposure rollup; each carries `soc_codes[]` (via the ANZSCO concordance) so SOC-keyed views can find the OSCA panel. |
| `GET /api/v1/au/occupations/{osca_code}` | One OSCA occupation: task-weighted exposure rollup (β, task/measured counts, coverage %, US/AU divergence), ASC core competencies with proficiency, descriptor-only OSCA main tasks, ANZSCO/US-SOC lineage, apportioned employment. `osca_version` stamped. |

## GDPval

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/gdpval/summary` | Benchmark overview: total tasks (220), occupations (44), rubric items (10,453), sectors, per-occupation task counts. |
| `GET /api/v1/gdpval/occupations/{soc_code}` | Full benchmark detail: tasks with prompts + complete rubric items (criterion, score, required flag, tags). |
| `GET /api/v1/gdpval/waterline` | Waterline-velocity signal: model-capability trajectory across eras (Epoch AI ECI), for "why AI exposure keeps rising". |

## Drift (Rising Tide)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/drift/summary` | Classification distribution. |
| `GET /api/v1/drift/departing` | Tasks with fastest-growing AI usage. |
| `GET /api/v1/drift/below-threshold` | Highest-priority signal (will flip zone soon). |
| `GET /api/v1/drift/enduring` | Stable / declining AI-usage tasks. |

## Search

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/search?q=...` | Fuzzy search 65,496 O\*NET titles via `pg_trgm` trigram similarity (two-pass: exact substring + fuzzy; results carry a similarity percentage). |
| `POST /api/v1/search/semantic` | Semantic search via sentence-transformers + pgvector HNSW over 66,512 title embeddings. Accepts query text and an optional job description. |

## Companies (AU, full build only)

Both require `ANTHROPIC_API_KEY` and the licence-restricted ASX/GICS data —
disabled in the static build.

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/companies/search?q=...&region=AU` | `pg_trgm` fuzzy search across ASX companies + the classification cache. |
| `POST /api/v1/companies/classify` | Claude Haiku classifies any company name into ANZSIC/NAICS sectors; cached; returns 503 if no API key. |

## Meta

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/datasets` | Data vintage for dashboard footers. |

Plus internal admin/observability and pipeline-control endpoints (`/admin/*`,
`/pipeline/*`; ADR-007), not part of the public surface.
