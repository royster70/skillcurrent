# SkillCurrent

*Open intelligence for the changing world of work.*

[![Live demo](https://img.shields.io/badge/live%20demo-royster70.github.io%2Fskillcurrent-C2410C.svg)](https://royster70.github.io/skillcurrent/)
[![CI](https://github.com/royster70/skillcurrent/actions/workflows/ci.yml/badge.svg)](https://github.com/royster70/skillcurrent/actions/workflows/ci.yml)
[![Deploy static site](https://github.com/royster70/skillcurrent/actions/workflows/deploy-static.yml/badge.svg)](https://github.com/royster70/skillcurrent/actions/workflows/deploy-static.yml)
[![Code licence: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![Data licence: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-brightgreen.svg)](DATA_LICENSE)

**[▶ Explore the live site →](https://royster70.github.io/skillcurrent/)** — the full dashboard runs in your browser, no install and no backend.

[![SkillCurrent — the waterline across sectors](docs/images/skillcurrent-hero.png)](https://royster70.github.io/skillcurrent/)

AI capability is rising like a waterline across the work we do — not evenly, and not all at once. SkillCurrent reads where that line sits today, where it's heading, and which skills stay above it — at the level of individual **tasks**, not whole jobs. It combines the O\*NET occupational taxonomy, theoretical exposure research (Eloundou 2024), empirical AI-applicability data (Microsoft, Anthropic), and government employment statistics into workforce-planning intelligence.

## How to read it

A **current** is something you read and navigate — read it well, and it carries you forward. SkillCurrent measures where AI capability sits across the work we do, task by task, so you can read the waterline and choose your course.

[![Read the scale — every task gets a reading](docs/images/skillcurrent-read-the-scale.png)](https://royster70.github.io/skillcurrent/#read-the-scale)

Three things to know, then [read it yourself](https://royster70.github.io/skillcurrent/#read-the-scale):

1. **A job is a bundle of tasks.** AI doesn't take jobs whole — it reaches the tasks inside them, one by one. Some sink early; others barely feel it. So the unit of measure is the *task*, not the job.
2. **Two questions make the reading.** Could today's AI meaningfully do this task by itself? Could it with purpose-built tools on top? A task can score on both — which is why the exposure reading, **β** (beta), runs 0 to 1.5, not 0 to 1:
   > `β = E1 + 0.5·E2` — direct AI exposure (E1) plus half-weighted tool-assisted exposure (E2). From the Eloundou et al. 2024 task-exposure study ("GPTs are GPTs"), cross-checked against measured AI usage from Microsoft and Anthropic.
3. **The reading is a depth.** Low readings hold the high ground; high readings sit deeper. The waterline is today's AI capability — one tide, every job.

Each task's β sorts it into one of three **zones** — above the line, at it, or below:

| Zone | β range | What it means | What to do |
|------|---------|---------------|------------|
| 🟠 **E0 — Insulated** *(dry)* | β < 0.40 | Human-only work | Preserve and invest in these distinctly human skills |
| 🔵 **E1 — Augmented** *(at the line)* | 0.40 – 0.85 | AI assists, human leads | Upskill people to work alongside AI on the routine parts |
| 🟢 **E2 — Automated** *(submerged)* | β ≥ 0.85 | AI performs, human validates | Redesign the role around oversight and exceptions |

**Why the waterline keeps rising.** An *era* is a model generation — and they now arrive in months, not decades. Each new frontier model lifts the waterline, and work that sat safely above it slips under. That's the current these pages measure — rising an order of magnitude faster than past technological shifts, and never backward. → [See which tasks are rising, era over era](https://royster70.github.io/skillcurrent/tide).

> The skills that stay dry — judgment, care, direction — are the high ground. That's where you're headed.

## Who this is for

- **Contributors** — see [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup and the quality gate.
- **Researchers / citers** — the data compilation is CC BY 4.0; see [Licence](#licence) and [docs/data-sources.md](docs/data-sources.md) for per-source attribution.
- **Self-hosters** — run the full stack locally with one command (below); no external API keys required for the core dashboard.
- **Visitors** — [explore the live demo](https://royster70.github.io/skillcurrent/): the whole Tier 1 dashboard as a static build on GitHub Pages, no install and no backend. Prefer to run it yourself? See below.

## Running it

Three ways to run this, depending on how much you want to touch:

### 1. Docker (fastest — recommended)

Builds the backend, frontend, and a pgvector Postgres, and restores the committed [seed dataset](docs/SEED_DATASET.md) (40 tables, 240k rows) automatically on first boot — no data downloads required.

```bash
git clone https://github.com/royster70/skillcurrent.git
cd skillcurrent
docker compose up
```

- Frontend: http://localhost:3000
- API + docs: http://localhost:8000/docs

### 2. Native setup (for backend/frontend development)

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full dev setup (Python 3.12, Node 20+, pgvector Postgres, pre-commit hooks). Once your `.env` and database are set up:

```bash
cd src/backend
alembic upgrade head
python -m scripts.doctor           # preflight check — reports what's missing
python -m scripts.restore_seed     # loads the same seed dataset the Docker image uses
python -m uvicorn app.main:app --reload --port 8000

# separate terminal
cd src/frontend
npm install && npm run dev
```

Prefer the full, real dataset instead of the seed? See [docs/INGESTION_RUNBOOK.md](docs/INGESTION_RUNBOOK.md) — downloads and ingests every public source from scratch (~602k rows, takes longer, no API keys needed either).

### 3. Add a signal (contributing a new data source)

Every external data source is registered in `signal_source_registry` with a licence and a `redistribution_ok` flag — see [docs/data-sources.md](docs/data-sources.md) for the classification rules and [CONTRIBUTING.md](CONTRIBUTING.md#data-licensing-matters-for-any-new-data-source) for what's required before a new source can ship in the seed or a published export.

### Static mirror (no backend, no database)

The whole Tier 1 dashboard also runs as a **static site** — a visitor loads it
in a browser with no server. **It's live at
[royster70.github.io/skillcurrent](https://royster70.github.io/skillcurrent/).**
It reaches near-full parity with the Docker build (sectors, occupations,
composite analysis, drift, task matrix, search, plus a "similar occupations"
bonus); only the LLM-backed CompanyLookup is dropped. It's deployed to GitHub
Pages by `.github/workflows/deploy-static.yml`. To build it locally:

```bash
cd src/backend && python -m scripts.restore_seed && python -m scripts.build_static_site
cd ../frontend && VITE_DEPLOYMENT_MODE=cdn npm run build && npm run preview
```

See **[docs/STATIC_SITE.md](docs/STATIC_SITE.md)** for how it works.

## Architecture

**Two-tier design:**
- **Tier 1 — Industry Intelligence** (public data, no auth): Occupation-level AI exposure analysis, drift tracking, industry profiles. Fully built.
- **Tier 2 — Organisational Overlay** (requires HRIS upload): Maps client workforce to Tier 1 intelligence with privacy controls. Not yet built.

## Current Status

### Data loaded (~537,633 rows)

| Dataset | Rows | What it provides |
|---------|------|-----------------|
| O\*NET 28.1 | 346,440 | 1,016 occupations (923 in hierarchy after filtering 93 residual/military), 19k tasks, 65k titles, 2k DWAs |
| Eloundou 2024 | 18,460 | 923 occupation + 17,537 DWA-level exposure scores |
| Microsoft "Working with AI" | 34,396 | Empirical Copilot applicability (785 SOCs, 332 IWAs) |
| AEI (Anthropic) | 35,730 | Empirical Claude usage + 4-era temporal snapshots |
| BLS OEWS 2024 | 8,573 | US employment by occupation x NAICS sector |
| ABS/JSA 2025 | 2,743 | AU employment by occupation x ANZSIC division (FR-8.9) |
| Derived products | 15,794 | Drift metrics (4,605) + industry profiles (9,019 US+AU) + crosswalk (21) + ANZSCO concordance (491) + AU profiles (1,084 of 9,019) |
| ASX company data | 1,978 | ASX listed companies with GICS→ANZSIC→NAICS sector mapping (FR-8.5 company lookup) |
| Title embeddings | 66,512 | Layer 2 semantic search (all-MiniLM-L6-v2, pgvector HNSW) |
| OpenAI GDPval | 10,673 | 220 real-world knowledge tasks + 10,453 rubric items across 44 occupations (FR-8.7) |

### Tier 1 API (21 endpoints, live)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/sectors?region=US\|AU` | NAICS (US, default) or ANZSIC (AU) sectors with employment-weighted exposure stats (weighted_eloundou_beta, weighted_ms_applicability, weighted_aei_exposure, workers per zone) |
| `GET /api/v1/sectors/composite?codes=...&region=US\|AU` | Composite multi-sector analysis: blends 2+ sectors into employment-weighted profile with de-duplicated occupations, zone worker counts, and per-occupation sector badges |
| `GET /api/v1/sectors/{code}/occupations?region=US\|AU` | Occupations within a sector |
| `GET /api/v1/sectors/{code}/priorities?region=US\|AU` | Priority roles ranked by composite impact score (40% exposure, 30% headcount, 15% location quotient, 15% drift velocity) with risk factor badges |
| `GET /api/v1/occupations` | Filterable list (?sector, ?zone, ?classification) |
| `GET /api/v1/occupations/hierarchy` | SOC major group tree (923 occupations, 93 residual/military filtered) |
| `GET /api/v1/occupations/{soc}` | Three-tier detail + top sectors + drift + GDPval availability (gdpval_task_count, gdpval_available fields) |
| `GET /api/v1/occupations/{soc}/tasks` | Tasks with per-task drift velocity |
| `GET /api/v1/occupations/{soc}/matrix` | Task positioning matrix: importance (Y) vs AI capability (Eloundou, X), four quadrants (insulated, augmented, disrupted, routine). Three overlay modes: None, Usage Level (dot size), Usage Trend (rings), plus conditional GDPval overlay strip. Returns era_snapshots[] per task (with automation_pct, augmentation_pct) and available_eras[] for temporal views. Includes gdpval_benchmark_count. |
| `GET /api/v1/gdpval/summary` | GDPval benchmark overview: total tasks (220), occupations (44), rubric items (10,453), sectors list, per-occupation task counts |
| `GET /api/v1/gdpval/occupations/{soc_code}` | Full GDPval benchmark detail for one occupation: tasks with prompts + complete rubric items (criterion, score, required flag, tags) |
| `GET /api/v1/drift/summary` | Classification distribution |
| `GET /api/v1/drift/departing` | Tasks with fastest-growing AI usage |
| `GET /api/v1/drift/below-threshold` | Highest priority signal (will flip zone soon) |
| `GET /api/v1/drift/enduring` | Stable/declining AI usage tasks |
| `GET /api/v1/search?q=...` | Fuzzy search 65,496 O\*NET titles via pg\_trgm trigram similarity (two-pass: exact substring + fuzzy matching, results show similarity percentage) |
| `POST /api/v1/search/semantic` | Semantic search via sentence-transformers + pgvector HNSW over 66,512 title embeddings. Accepts query text and optional job description. |
| `GET /api/v1/datasets` | Data vintage for dashboard footers |
| `GET /api/v1/companies/search?q=...&region=AU` | pg_trgm fuzzy search across ASX companies and LLM classification cache; returns company_name, asx_code, sector names, ANZSIC/NAICS codes |
| `POST /api/v1/companies/classify` | Claude Haiku classifies any company name into ANZSIC/NAICS sectors; results cached in company_classifications table; returns 503 if ANTHROPIC_API_KEY not set |

OpenAPI docs: http://localhost:8000/docs

### Tier 1 Dashboard

Built with React 18, React Router, and Recharts, in the "warm instrument" design system — a light, brass-accented interface organised around the waterline metaphor, with zone colours (E0 insulated, E1 augmented, E2 automated) and a collapsible sidebar (Waterline · Sectors · Role Search · Occupations · Rising Tide).

[![Industry Sectors — the waterline across sectors](docs/images/skillcurrent-sectors.png)](https://royster70.github.io/skillcurrent/sectors)

<sub>*Each sector's workforce split across the exposure scale — the further right, the deeper its people already sit. [See it live →](https://royster70.github.io/skillcurrent/sectors)*</sub>

> **Note:** the detailed endpoint and page tables below describe the build as first shipped; some page names and routes have since evolved with the "warm instrument" redesign — the landing **Waterline** view now lives at `/`, with **Sectors** at `/sectors`. See the [live site](https://royster70.github.io/skillcurrent/) for the current navigation.

| Page | Route | Visualisations |
|------|-------|----------------|
| Sectors | `/` | Worker-count metric cards, zone pie toggle (workers/occupations), sector positioning bubble chart, weighted scores in sector table; SectorChipSelector for building composite multi-sector views; RegionSelector toggle (US/AU flag) switches all sector data between NAICS and ANZSIC via ?region= URL param; CompanyLookup collapsible card with type-ahead search (pg_trgm) across ~1,978 ASX companies with ASX code badges and AI classify button (Claude Haiku) |
| Composite Sector | `/sectors/composite` | Multi-sector blended analysis: employment-weighted metric cards (E0/E1/E2 + composite Beta), unified occupation table with multi-sector badges, auto-generated narrative summary panel |
| Sector Detail | `/sectors/:code` | Narrative summary, ContextualScoreCards with percentile context, priority roles view (composite impact ranking with risk badges), toggle to full occupation mix; clicking role navigates to /occupations?selected=SOC; GDPval coverage indicators on role rows; "GDPval Only" filter to show only benchmark occupations |
| Occupations | `/occupations` | SOC hierarchy tree (23 groups), GDPval filter toggle (narrows to 44 benchmark occupations), detail panel with ContextualScoreCards + interactive GDPval badge, tasks by AI usage (mini sparklines), redesigned TaskMatrix quadrant chart with era timeline sparklines — 2 temporal views (Baseline, By Era), 3 overlay modes (None, Usage Level, Usage Trend); AEI Task Intelligence panel (temporal trajectory, penetration ranking, auto/aug split, coverage ring); GDPval Benchmark panel (score range chart, rubric composition, tag frequency bars) |
| Drift Analysis | `/drift` | Classification pie chart, usage vs velocity scatter, alert panel, departing/enduring lists |
| Role Search | `/search` | Two modes: Text (pg\_trgm fuzzy) and Semantic (sentence-transformers + pgvector). Optional JD textarea. Results with zone badges, three-tier score pills, click-to-navigate to occupation |

Frontend dev server: http://localhost:5173

### Tests

246+ tests passing (144 backend + 56 component + 46 E2E). Backend at 83% coverage. Component tests via Vitest + @testing-library/react. E2E via Playwright across 6 suites (sectors, search-to-occupation, occupations, drift, composite, company-lookup).

```powershell
cd src/backend
python -m pytest tests/ -v                    # 144 backend tests
python -m pytest tests/ --cov=app             # with coverage

cd src/frontend
npm run test:e2e                              # 46 Playwright E2E tests
```

## Key Documentation

| Doc | Purpose |
|-----|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | **Start here** — functional (data-funnel) + solution architecture, with the DWA-pivot crosswalk diagram |
| [docs/SETUP.md](docs/SETUP.md) | Development environment setup |
| [docs/INGESTION_RUNBOOK.md](docs/INGESTION_RUNBOOK.md) | Data loading procedure and verification |
| [docs/SEED_DATASET.md](docs/SEED_DATASET.md) | Committed seed dataset — clone and run without the full ingest pipeline |
| [docs/STATIC_SITE.md](docs/STATIC_SITE.md) | The no-database static build (P4) — architecture + how to build it |
| [ai_working/REBUILD_RUNBOOK.md](ai_working/REBUILD_RUNBOOK.md) | Personal-machine disaster-recovery checklist (not a generic setup guide — see CONTRIBUTING.md for that) |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | All database tables, columns, join paths |
| [docs/data-sources.md](docs/data-sources.md) | Data sources, licences & attribution |
| [ai_working/decisions/README.md](ai_working/decisions/README.md) | Architecture Decision Records (index) |
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
- **Deployment**: Docker Compose (pgvector Postgres + backend + nginx-served frontend)

## Project Structure

```
skillcurrent/
  CLAUDE.md                    # Claude Code project context (auto-loaded)
  AGENTS.md                    # Agent context for AI-assisted development
  docker-compose.yml           # Full stack: pgvector Postgres + backend + frontend
  docs/                        # Architecture docs, data contracts, guides
  ai_working/decisions/        # Architecture Decision Records (ADRs)
  src/
    backend/
      app/
        api/v1/                # FastAPI endpoints + Pydantic schemas
        models/                # SQLAlchemy ORM models (25+ tables)
        services/              # Ingestion, computation, transformations
      data/seed/               # Committed seed dataset (docs/SEED_DATASET.md)
      migrations/versions/     # Alembic migrations
      scripts/                 # CLI tools: ingestion, doctor.py, build_seed.py/restore_seed.py
      tests/                   # pytest suite
      Dockerfile                # API image — migrates + restores the seed on first boot
    frontend/
      src/
        pages/               # SectorsPage, CompositeSectorPage, SectorDetailPage, OccupationsPage, DriftPage, SearchPage
        components/          # Layout (collapsible sidebar), TaskMatrix (redesigned with era sparklines), MetricCard, ContextualScoreCard, RegionSelector (US/AU toggle), CompanyLookup (ASX company search + AI classify)
        hooks/               # useApi (data fetching)
        lib/                 # api client, constants
      e2e/                   # Playwright E2E tests (6 suites, 46 tests)
      playwright.config.ts   # Playwright configuration
      Dockerfile             # Static build served behind nginx, proxies /api to the backend
```

## Licence

SkillCurrent is dual-licensed — code and data are distinct:

- **Code** — [MIT](LICENSE).
- **Data compilation** — [CC BY 4.0](DATA_LICENSE). The derived datasets are
  redistributable because every upstream source is CC BY / MIT / public domain.
- **Attribution** — see [NOTICE](NOTICE) for required per-source credit, and
  [docs/data-sources.md](docs/data-sources.md) for the full source registry.

Citation-only sources (e.g. AIOE, GDPval-AA, OpenAI's GDPval leaderboard scores)
are used only as cited references — never bundled, exported, or served.
