# Development Setup Guide

How to get the SkillCurrent running from scratch on a new machine.

---

## Prerequisites

### Required software

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| **Python** | 3.12+ | Backend runtime | [python.org](https://www.python.org/downloads/) or Microsoft Store |
| **Node.js** | 18+ | Frontend build tools | [nodejs.org](https://nodejs.org/) |
| **Docker Desktop** | Latest | PostgreSQL database | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Git** | Latest | Version control | [git-scm.com](https://git-scm.com/) |

### Windows-specific notes

- Docker Desktop uses WSL2 backend on Windows 11 Home (no Hyper-V/Pro required)
- If WSL2 is not installed: run `wsl --install` in PowerShell as admin, then restart
- Python from Microsoft Store works fine; ensure it's on PATH
- Claude Code: `npm install -g @anthropic-ai/claude-code`

### Verify installations

```powershell
python --version    # 3.12+
node --version      # 18+
npm --version       # 9+
docker --version    # 20+
git --version       # 2+
```

---

## 1. Clone the repository

```powershell
git clone https://github.com/royster70/skillcurrent.git
cd skillcurrent
```

---

## 2. Start PostgreSQL

The platform uses PostgreSQL 16 with the pgvector extension. The `pgvector/pgvector:pg16` Docker image includes both.

```powershell
docker run -d --name workforce-pg `
  -e POSTGRES_USER=workforce `
  -e POSTGRES_PASSWORD=dev_only `
  -e POSTGRES_DB=workforce_ai `
  -p 5432:5432 `
  pgvector/pgvector:pg16
```

Verify it's running:

```powershell
docker ps
# Should show workforce-pg on port 5432
```

To stop/start later:

```powershell
docker stop workforce-pg
docker start workforce-pg
```

---

## 3. Backend setup

### Create virtual environment (recommended)

```powershell
cd src\backend
python -m venv .venv
.venv\Scripts\Activate.ps1    # PowerShell
# or: source .venv/bin/activate  # bash/WSL
```

### Install Python dependencies

```powershell
pip install -e ".[dev]"
```

This installs all dependencies from `pyproject.toml`:
- **Core**: FastAPI, SQLAlchemy, asyncpg, Alembic, Pydantic, pandas, scipy, openpyxl
- **Dev**: pytest, pytest-asyncio, pytest-cov, black, ruff, mypy, httpx

### Create .env file

The `.env` file must be **UTF-8 encoded** (not UTF-16 which PowerShell `echo >` creates).

```powershell
# Use Python to create a properly encoded .env:
python -c "open('.env', 'w', encoding='utf-8').write('DATABASE_URL=postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai\n')"
```

Or manually create `src/backend/.env` with:

```
DATABASE_URL=postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai
```

**Important**: PowerShell's `echo "..." > file` writes UTF-16LE which breaks pydantic-settings. Always use Python or a text editor that saves as UTF-8.

### Run database migrations

```powershell
python -m alembic upgrade head
```

This creates all tables (migrations 001-012).

### Start the API server

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

---

## 4. Frontend setup

```powershell
cd src\frontend
npm install
npm run dev
```

- Dev server: http://localhost:5173
- API proxy: `/api` routes to `http://localhost:8000` (configured in `vite.config.ts`)

### Dashboard pages (5 pages, all functional)

| Page | Route | What it shows |
|------|-------|---------------|
| Sectors | `/` | Zone distribution donut chart, three-tier evidence bar chart, metric cards, interactive sector table |
| Sector Detail | `/sectors/:code` | Employment by occupation (zone-coloured bars), three-tier score comparison, occupation table |
| Occupations | `/occupations` | SOC hierarchy tree (23 major groups, expandable), detail panel with score chips, tasks by AI usage (mini sparklines), task positioning matrix with 2 temporal views (Baseline, By Era) and 3 overlay modes (None, Usage Level, Usage Trend) |
| Drift Analysis | `/drift` | Classification pie chart, usage vs velocity scatter plot, alert panel, departing/enduring lists |
| Role Search | `/search` | Two modes: Text (pg\_trgm fuzzy) and Semantic (sentence-transformers + pgvector). Optional JD textarea. Results with zone badges, three-tier score pills, click-to-navigate to occupation |

---

## Daily Operations — Startup & Shutdown

### Starting everything (in order)

**Step 1 — Database** (if not already running):
```powershell
docker start workforce-pg
```

Verify: `docker ps` should show `workforce-pg` on port 5432.

**Step 2 — API server** (from `src/backend/`):
```powershell
cd src\backend
python -m uvicorn app.main:app --reload --port 8000
```

Verify: http://localhost:8000/health should return `{"status":"ok"}`

**Step 3 — Frontend** (new terminal, from `src/frontend/`):
```powershell
cd src\frontend
npm run dev
```

Verify: http://localhost:5173 should show the dashboard.

### Stopping everything

**Frontend**: `Ctrl+C` in the frontend terminal.

**API server**: `Ctrl+C` in the backend terminal.

**Database** (optional — can leave running):
```powershell
docker stop workforce-pg
```

### Restarting after code changes

| What changed | What to restart |
|-------------|----------------|
| Frontend code (`.tsx`, `.ts`, `.css`) | Nothing — Vite HMR auto-reloads |
| Backend code (`.py` in `app/`) | Nothing if `--reload` flag is set — uvicorn auto-restarts |
| New migration added | Run `python -m alembic upgrade head` from `src/backend/` |
| New Python package | Run `pip install -e ".[dev]"` from `src/backend/` |
| New npm package | Run `npm install` from `src/frontend/` |
| Database schema conflict | Stop API, run `alembic upgrade head`, restart API |

### Quick health checks

```powershell
# Database running?
docker ps | findstr workforce-pg

# API responding?
curl http://localhost:8000/health

# API data loaded?
curl http://localhost:8000/api/v1/datasets

# Frontend proxy working?
curl http://localhost:5173/api/v1/drift/summary

# Port in use? Find what's using it:
netstat -ano | findstr :8000
# Kill by PID:
taskkill /PID <number> /F
```

### Full restart from scratch

If something is broken and you need a clean restart:

```powershell
# Stop everything
docker stop workforce-pg

# Remove and recreate database container (WARNING: deletes all data)
docker rm workforce-pg
docker run -d --name workforce-pg -e POSTGRES_USER=workforce -e POSTGRES_PASSWORD=dev_only -e POSTGRES_DB=workforce_ai -p 5432:5432 pgvector/pgvector:pg16

# Wait a few seconds for PostgreSQL to initialise, then:
cd src\backend
python -m alembic upgrade head

# Re-ingest all data (see docs/INGESTION_RUNBOOK.md for full sequence)
python -m scripts.ingest_onet
# ... (remaining ingestion scripts)

# Restart servers
python -m uvicorn app.main:app --reload --port 8000
# (new terminal)
cd src\frontend && npm run dev
```

---

## 5. Load data

See `docs/INGESTION_RUNBOOK.md` for the full data loading procedure. Summary:

### Download source datasets

| Dataset | Source | Local path |
|---------|--------|-----------|
| O\*NET 28.1 | [onetcenter.org](https://www.onetcenter.org/database.html) (Text format) | `Data/ONet/` |
| Eloundou | OpenAI supplementary data | `Data/OpenAI-Exposure-Score/` |
| Microsoft AI | [github.com/microsoft/working-with-ai](https://github.com/microsoft/working-with-ai) | `Data/microsoft-working-with-ai/` |
| AEI | [huggingface.co/Anthropic/EconomicIndex](https://huggingface.co/datasets/Anthropic/EconomicIndex) | `Data/AEI/` |
| BLS OEWS | [bls.gov/oes](https://www.bls.gov/oes/tables.htm) | `Data/BLS/` |

### Run ingestion (from `src/backend/`)

```powershell
# 1. O*NET (must be first - other datasets FK to this)
python -m scripts.ingest_onet --path "C:\Users\royst\Projects\Data\ONet"

# 2-5. These can run in any order
python -m scripts.ingest_eloundou --path "C:\Users\royst\Projects\Data\OpenAI-Exposure-Score"
python -m scripts.ingest_microsoft_ai --path "C:\Users\royst\Projects\Data\microsoft-working-with-ai"
python -m scripts.ingest_aei --path "C:\Users\royst\Projects\Data\AEI"
python -m scripts.ingest_aei_temporal --path "C:\Users\royst\Projects\Data\AEI\AEI-full"
python -m scripts.ingest_oews --path "C:\Users\royst\Projects\Data\BLS\oesm24in4"

# 6. Derived computations (must be after ingestion)
python -m scripts.derive_eloundou_dwas
python -m scripts.compute_drift
python -m scripts.compute_industry_profiles

# 7. Title embeddings for semantic search (must be after O*NET load)
python -m scripts.embed_titles
```

### Verify

```powershell
python -m scripts.cross_dataset_insights
```

---

## 6. Run tests

### Backend tests (90 tests, 83% coverage)

```powershell
cd src\backend

# All tests
python -m pytest tests/ -v

# With coverage
python -m pytest tests/ --cov=app --cov-report=term

# Specific test file
python -m pytest tests/test_drift.py -v
```

### E2E browser tests (18 tests via Playwright)

```powershell
cd src\frontend

# Install Playwright browsers (first time only)
npx playwright install

# Run all E2E tests
npm run test:e2e

# Run a specific suite
npx playwright test e2e/sectors.spec.ts
```

E2E tests require both the backend API (port 8000) and frontend dev server (port 5173) to be running. Test suites cover: sectors, search-to-occupation navigation, occupations, and drift.

---

## 7. Code quality

```powershell
cd src\backend

# Format
python -m black app/ tests/ scripts/

# Lint
python -m ruff check app/ tests/ scripts/

# Type check
python -m mypy app/
```

> **The pre-commit hooks — not the venv's `python -m black` — are the formatting source of truth.**
> `git commit` runs black/ruff in pre-commit's own isolated environments, pinned by `rev:` in
> [`.pre-commit-config.yaml`](../.pre-commit-config.yaml). The `[dev]` extra in
> `src/backend/pyproject.toml` pins black and ruff to the **same** versions (black `24.10.0`,
> ruff `0.8.6`) so that `python -m black --check` locally agrees with the commit gate. If the two
> ever drift, a file can look clean under `python -m black --check` yet be reformatted by the hook
> on commit (and vice-versa). **When bumping a formatter, change both files together** — the
> `rev:` in `.pre-commit-config.yaml` and the pin in `pyproject.toml`. After changing the pin,
> re-sync your venv with `pip install -e ".[dev]"`.

---

## Common issues

### "password authentication failed"
The `.env` file is not being read or is in the wrong encoding. Recreate it with Python (see step 3).

### "column X does not exist"
Migrations haven't been run. Run `python -m alembic upgrade head`.

### Docker container won't start
Check WSL2: `wsl --status`. If not installed: `wsl --install` then restart.

### "ModuleNotFoundError: No module named 'fastapi'"
Dependencies not installed. Run `pip install -e ".[dev]"` from `src/backend/`.

### Port 5432 already in use
Another PostgreSQL instance is running. Stop it or change the Docker port mapping:
```powershell
docker run -d --name workforce-pg -p 5433:5432 ...
# Then update .env: postgresql+asyncpg://workforce:dev_only@localhost:5433/workforce_ai
```

### Port 8000 already in use / WinError 10013
A previous uvicorn process is still holding the port. This commonly happens when the server was started in the background or a terminal was closed without stopping it.

```powershell
# Find the process holding port 8000:
Get-NetTCPConnection -LocalPort 8000 | Select-Object LocalPort,OwningProcess,State

# Kill it by PID (replace 12345 with the OwningProcess number from above):
Stop-Process -Id 12345 -Force

# Then start the server normally:
python -m uvicorn app.main:app --reload --port 8000
```

Alternative — use a different port (but you'll need to update `vite.config.ts` proxy target too):
```powershell
python -m uvicorn app.main:app --reload --port 8001
```

---

## Project structure

```
skillcurrent/
  CLAUDE.md              # Claude Code project instructions
  AGENTS.md              # Agent context and sub-agent definitions
  docs/                  # Architecture docs, ADRs, data contracts
  ai_working/            # Decisions, discoveries, implementation status
  src/
    backend/
      app/
        api/v1/          # FastAPI route handlers + Pydantic schemas
        core/            # Settings, config
        db/              # Database session, base model
        models/          # SQLAlchemy ORM models (all tables)
        services/        # Ingestion, computation, transformation logic
      migrations/        # Alembic migration files (001-012)
      scripts/           # CLI scripts for ingestion + computation
      tests/             # pytest test suite
      pyproject.toml     # Python dependencies + tool config
      alembic.ini        # Alembic config
    frontend/
      src/
        pages/           # SectorsPage, SectorDetailPage, OccupationsPage, DriftPage, SearchPage
        components/      # Layout (collapsible dark sidebar), TaskMatrix (3 temporal views), MetricCard
        hooks/           # useApi (data fetching hook)
        lib/             # api client, constants (zone colours, thresholds)
      package.json       # Node dependencies
      vite.config.ts     # Vite build + dev proxy config
```
