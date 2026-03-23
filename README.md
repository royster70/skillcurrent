# Workforce AI Impact Analysis Platform

Analyses how AI reshapes work at the task level. Combines O\*NET occupational taxonomy, theoretical exposure research (Eloundou 2024), empirical AI applicability data (Microsoft, Anthropic), and government employment statistics to produce workforce planning intelligence.

**Core insight**: AI capability follows a compounding, directional trajectory — a rising waterline across task landscapes. The platform tracks where the waterline sits today and where it's heading.

## Getting Started

See **[docs/SETUP.md](docs/SETUP.md)** for the full development setup guide covering:
- Prerequisites (Python 3.12+, Node 18+, Docker Desktop, Git)
- PostgreSQL + pgvector setup via Docker
- Backend and frontend installation
- Data loading and verification
- Common issues and troubleshooting

Quick start (after prerequisites are installed):

```powershell
git clone https://github.com/royster70/workforce-ai-platform.git
cd workforce-ai-platform

# Start database
docker run -d --name workforce-pg -e POSTGRES_USER=workforce -e POSTGRES_PASSWORD=dev_only -e POSTGRES_DB=workforce_ai -p 5432:5432 pgvector/pgvector:pg16

# Backend
cd src/backend
python -m venv .venv && .venv/Scripts/Activate.ps1
pip install -e ".[dev]"
python -c "open('.env','w',encoding='utf-8').write('DATABASE_URL=postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai\n')"
python -m alembic upgrade head

# Start API
python -m uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd src/frontend
npm install && npm run dev
```

## Architecture

**Two-tier design:**
- **Tier 1 — Industry Intelligence** (public data, no auth): Occupation-level AI exposure analysis, drift tracking, industry profiles. Fully built.
- **Tier 2 — Organisational Overlay** (requires HRIS upload): Maps client workforce to Tier 1 intelligence with privacy controls. Not yet built.

## Current Status

### Data loaded (~521,700 rows)

| Dataset | Rows | What it provides |
|---------|------|-----------------|
| O\*NET 28.1 | 346,440 | 1,016 occupations (923 in hierarchy after filtering 93 residual/military), 19k tasks, 65k titles, 2k DWAs |
| Eloundou 2024 | 18,460 | 923 occupation + 17,537 DWA-level exposure scores |
| Microsoft "Working with AI" | 34,396 | Empirical Copilot applicability (785 SOCs, 332 IWAs) |
| AEI (Anthropic) | 35,730 | Empirical Claude usage + 4-era temporal snapshots |
| BLS OEWS 2024 | 8,573 | US employment by occupation x NAICS sector |
| Derived products | 12,540 | Drift metrics (4,605) + industry profiles (7,935) |
| Title embeddings | 66,512 | Layer 2 semantic search (all-MiniLM-L6-v2, pgvector HNSW) |

### Tier 1 API (16 endpoints, live)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/sectors` | 20 NAICS sectors with aggregate exposure stats |
| `GET /api/v1/sectors/{code}/occupations` | Occupations within a sector |
| `GET /api/v1/sectors/{code}/priorities` | Priority roles ranked by composite impact score (40% exposure, 30% headcount, 15% location quotient, 15% drift velocity) with risk factor badges |
| `GET /api/v1/occupations` | Filterable list (?sector, ?zone, ?classification) |
| `GET /api/v1/occupations/hierarchy` | SOC major group tree (923 occupations, 93 residual/military filtered) |
| `GET /api/v1/occupations/{soc}` | Three-tier detail + top sectors + drift |
| `GET /api/v1/occupations/{soc}/tasks` | Tasks with per-task drift velocity |
| `GET /api/v1/occupations/{soc}/matrix` | Task positioning matrix: importance (Y) vs AI capability (Eloundou, X), four quadrants (insulated, augmented, disrupted, routine). Three overlay modes: None, Usage Level (dot size), Usage Trend (rings). Returns era_snapshots[] per task and available_eras[] for temporal views |
| `GET /api/v1/drift/summary` | Classification distribution |
| `GET /api/v1/drift/departing` | Tasks with fastest-growing AI usage |
| `GET /api/v1/drift/below-threshold` | Highest priority signal (will flip zone soon) |
| `GET /api/v1/drift/enduring` | Stable/declining AI usage tasks |
| `GET /api/v1/search?q=...` | Fuzzy search 65,496 O\*NET titles via pg\_trgm trigram similarity (two-pass: exact substring + fuzzy matching, results show similarity percentage) |
| `POST /api/v1/search/semantic` | Semantic search via sentence-transformers + pgvector HNSW over 66,512 title embeddings. Accepts query text and optional job description. |
| `GET /api/v1/datasets` | Data vintage for dashboard footers |

OpenAPI docs: http://localhost:8000/docs

### Tier 1 Dashboard (5 pages, functional)

Built with React 18, React Router, and Recharts. Dark sidebar design system with zone colours (orange E0, blue E1, green E2). Collapsible sidebar toggles between 260px expanded (full labels, data sources) and 64px collapsed (icons only) with smooth CSS transition.

| Page | Route | Visualisations |
|------|-------|----------------|
| Sectors | `/` | Zone distribution donut, three-tier evidence bar chart, metric cards, sector table |
| Sector Detail | `/sectors/:code` | Priority roles view (composite impact ranking with risk badges), toggle to full occupation mix, score comparison |
| Occupations | `/occupations` | SOC hierarchy tree (23 groups), detail panel with score chips, tasks by AI usage (mini sparklines), task positioning matrix with 2 temporal views (Baseline, By Era) and 3 overlay modes (None, Usage Level, Usage Trend) |
| Drift Analysis | `/drift` | Classification pie chart, usage vs velocity scatter, alert panel, departing/enduring lists |
| Role Search | `/search` | Two modes: Text (pg\_trgm fuzzy) and Semantic (sentence-transformers + pgvector). Optional JD textarea. Results with zone badges, three-tier score pills, click-to-navigate to occupation |

Frontend dev server: http://localhost:5173

### Tests

108 tests passing (90 backend + 18 E2E). Backend at 83% coverage. E2E via Playwright across 4 suites (sectors, search-to-occupation, occupations, drift).

```powershell
cd src/backend
python -m pytest tests/ -v                    # 90 backend tests
python -m pytest tests/ --cov=app             # with coverage

cd src/frontend
npm run test:e2e                              # 18 Playwright E2E tests
```

## Key Documentation

| Doc | Purpose |
|-----|---------|
| [docs/SETUP.md](docs/SETUP.md) | Development environment setup |
| [docs/INGESTION_RUNBOOK.md](docs/INGESTION_RUNBOOK.md) | Data loading procedure and verification |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | All database tables, columns, join paths |
| [docs/TOOLCHAIN.md](docs/TOOLCHAIN.md) | Every tool in the stack with rationale |
| [docs/domain-model.md](docs/domain-model.md) | Data contracts and invariants |
| [docs/MICROSOFT_AI_APPLICABILITY.md](docs/MICROSOFT_AI_APPLICABILITY.md) | Microsoft dataset context |
| [docs/ELOUNDOU_EXPOSURE.md](docs/ELOUNDOU_EXPOSURE.md) | Eloundou scoring methodology |
| [docs/PRD-v1.1.md](docs/PRD-v1.1.md) | Product requirements |
| [ai_working/decisions/](ai_working/decisions/) | Architecture Decision Records |

## Tech Stack

- **Backend**: Python 3.12, FastAPI, PostgreSQL 16 + pgvector, SQLAlchemy 2.x, Alembic
- **Data/NLP**: pandas, scipy, sentence-transformers (all-MiniLM-L6-v2)
- **Frontend**: TypeScript, React 18, Vite, Recharts/D3
- **Dev**: black, ruff, mypy --strict, pytest, vitest, Playwright (E2E)

## Project Structure

```
workforce-ai-platform/
  CLAUDE.md                    # Claude Code project context (auto-loaded)
  AGENTS.md                    # Agent context for AI-assisted development
  docs/                        # Architecture docs, data contracts, guides
  ai_working/decisions/        # Architecture Decision Records (ADRs)
  src/
    backend/
      app/
        api/v1/                # FastAPI endpoints + Pydantic schemas
        models/                # SQLAlchemy ORM models (25+ tables)
        services/              # Ingestion, computation, transformations
      migrations/versions/     # Alembic migrations (001-012)
      scripts/                 # CLI tools for ingestion + computation
      tests/                   # pytest suite (90 tests)
    frontend/
      src/
        pages/               # SectorsPage, SectorDetailPage, OccupationsPage, DriftPage, SearchPage
        components/          # Layout (collapsible sidebar), TaskMatrix (overlay modes), MetricCard
        hooks/               # useApi (data fetching)
        lib/                 # api client, constants
      e2e/                   # Playwright E2E tests (4 suites, 18 tests)
      playwright.config.ts   # Playwright configuration
```
