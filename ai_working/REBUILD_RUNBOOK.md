# Laptop Rebuild Runbook — SkillCurrent

> **This is Roy's personal-machine disaster-recovery checklist** (his own
> `Data/` backup, Claude Code global config/memory, drive layout) — filed here
> in `ai_working/` as a dev-journal artifact, not a `docs/` product doc. If
> you're setting up a contributor or self-hoster environment, see
> [CONTRIBUTING.md](../CONTRIBUTING.md) or [docs/SETUP.md](../docs/SETUP.md)
> instead — the data-rebuild steps below (`docs/INGESTION_RUNBOOK.md`, the
> `$DATA_ROOT` paths) are generic and still apply; the Claude Code
> config/memory sections are not.

Complete instructions to rebuild the skillcurrent development environment from scratch on a fresh Windows 11 machine, including PostgreSQL in Docker, all data ingestion, and Claude Code configuration.

**Repo**: `royster70/skillcurrent` (GitHub, private)
**Source data**: `$DATA_ROOT\` (outside repo)
**Claude Code config**: Global `~\.claude\` + project `.claude\` (in repo)

---

## Phase 1 — Prerequisites to Install

| Software | Version | Install Method |
|----------|---------|---------------|
| Windows 11 Home | Latest | Clean install |
| WSL2 | Latest | `wsl --install` in admin PowerShell, then restart |
| Docker Desktop | Latest | docker.com — uses WSL2 backend |
| Git | Latest | git-scm.com — ensure it's on PATH |
| Python | 3.12+ | python.org installer (NOT Microsoft Store — see note below) |
| Node.js | 18+ | nodejs.org (npm 9+ included) |
| Claude Code | Latest | `npm install -g @anthropic-ai/claude-code` |
| pre-commit | Latest | `pip install pre-commit` |

**Python install note:** Use the python.org installer, NOT Microsoft Store. The Store version has path alias issues (`python3` vs `python`), different install locations, and permission quirks that cause problems with venvs and pre-commit hooks. Download from https://www.python.org/downloads/ and check "Add to PATH" during install.

**Verify:**
```powershell
wsl --status
docker --version
git --version
python --version
node --version && npm --version
claude --version
```

---

## Phase 2 — Back Up Before Rebuild

### Critical files to save (NOT in the git repo)

```
$DATA_ROOT\           # All source data (13 directories)
  ABS\
  ABS-2021-Census\
  AEI\                                  # includes AEI\geographic\ (acquired, not yet ingested)
  AIOE\                                  # acquired, not yet ingested — citation-only licence, NOT CC-BY
  ANZSCO\
  ASX\
  BLS\
  GDPval\
  JSA-GenAI\                            # acquired, not yet ingested
  microsoft-working-with-ai\
  ONet\
  OpenAI-Exposure-Score\
  OSCA\                                  # OSCA 2024 v1.0 (ABS) — FR-9.1 backbone, LOADED
  ASC\                                    # Australian Skills Classification v3.0 (JSA), strayr .rda files — FR-9.2 task layer, LOADED

C:\Users\royst\.claude\                 # Global Claude Code config
  settings.json                         # Plugins, global permissions
  .credentials.json                     # OAuth tokens (re-auth may be needed)

C:\Users\royst\.claude\projects\        # Project-specific memory
  C--Users-royst-Projects-skillcurrent\memory\
    MEMORY.md                           # Memory index
    user_preferences.md                 # Working style preferences
    project_roadmap.md                  # Feature roadmap
    project_session_*.md                # Session logs (6 files)
```

### ⚠ DB tables that CANNOT be regenerated from `Data\` — dump BEFORE rebuild

Most tables re-ingest from source files, but these are **paid API output / LLM caches**
that exist only in the database. The 2026-07 rebuild lost `gdpval_evaluations`
(~$50 of Claude API evals) because no dump existed. Do not repeat that:

```powershell
docker exec workforce-pg pg_dump -U workforce -d workforce_ai --data-only `
  -t gdpval_evaluations -t company_classifications > db_paid_tables_backup.sql
# Restore after migrations on the new machine:
#   Get-Content db_paid_tables_backup.sql | docker exec -i workforce-pg psql -U workforce -d workforce_ai
```

### Files in the git repo (restored by clone)
- `.claude/settings.json` — project permissions, hooks, env vars
- `.claude/settings.local.json` — 115 granular permission rules
- `.claude/launch.json` — dev server configurations
- `.claude/agents/*.md` — 5 custom agents
- `.claude/commands/*.md` — 2 custom commands
- `.claude/skills/*/SKILL.md` — 2 custom skills
- `.pre-commit-config.yaml` — git hooks
- `.git/hooks/post-merge` — data invariant hook
- `CLAUDE.md` — project instructions

---

## Phase 3 — Clone & Restore

### 3.1 Clone the repository
```powershell
mkdir C:\Users\royst\Projects
cd C:\Users\royst\Projects
git clone https://github.com/royster70/skillcurrent.git
cd skillcurrent
```

### 3.2 Restore data directory
Copy the backed-up `Data\` folder to `$DATA_ROOT\`

### 3.3 Restore Claude Code global config
Copy backed-up files to `C:\Users\royst\.claude\`:
- `settings.json`
- `.credentials.json` (you'll likely need to re-auth: `claude login`)

### 3.4 Restore Claude Code memory
Copy the entire backed-up `memory\` directory to:
`C:\Users\royst\.claude\projects\C--Users-royst-Projects-skillcurrent\memory\`

---

## Phase 4 — PostgreSQL Database (Docker)

```powershell
docker run -d --name workforce-pg `
  -e POSTGRES_USER=workforce `
  -e POSTGRES_PASSWORD=dev_only `
  -e POSTGRES_DB=workforce_ai `
  -p 5432:5432 `
  pgvector/pgvector:pg16
```

Uses `pgvector/pgvector:pg16` which bundles PostgreSQL 16 + pgvector extension (for semantic search embeddings). The `pg_trgm` extension is enabled by migration 011.

**Verify:** `docker ps` shows `workforce-pg` on port 5432.

---

## Phase 5 — Backend Setup

```powershell
cd C:\Users\royst\Projects\skillcurrent\src\backend

# Virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1

# Install all dependencies (core + dev)
pip install -e ".[dev]"

# Create .env (MUST be UTF-8, not UTF-16!)
python -c "open('.env', 'w', encoding='utf-8').write('DATABASE_URL=postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai\n')"

# Optional: point the pipeline at source data outside the default location
python -c "open('.env', 'a', encoding='utf-8').write('DATA_ROOT=C:\\\\Users\\\\royst\\\\Projects\\\\Data\n')"

# Optional: add Anthropic key for LLM features
python -c "open('.env', 'a', encoding='utf-8').write('ANTHROPIC_AUTH_TOKEN=sk-ant-...\n')"

# Run all database migrations
python -m alembic upgrade head
```

**Note:** If using miniconda instead of venv, update `.claude/launch.json` to point to the correct Python path (currently `C:\Users\royst\miniconda3\python.exe`).

### Data-processing prerequisites (beyond `pip install`)

`pip install -e ".[dev]"` installs everything declared, but data processing has conditions pip can't satisfy:

- **Heavy ML dependencies are pulled** — `sentence-transformers` (→ PyTorch, several hundred MB) and `pyarrow` are core deps required by `embed_titles` / `build_anzsco_concordance` (embeddings) and `ingest_gdpval` (parquet). Allow time and disk on first install. If either is missing after install, re-run `pip install -e ".[dev]"`.
- **Network access is required at ingest time** — some stages download at runtime:
  - `embed_titles` / `build_anzsco_concordance` download the `all-MiniLM-L6-v2` model from HuggingFace on first run (cached to `~/.cache/huggingface`).
  - `ingest_epoch_eci` downloads the ECI benchmark CSV from epoch.ai. **The upstream schema can drift** (Epoch has dropped columns before) — the loader tolerates missing optional columns; row counts may differ from this doc.
- **`pre-commit install` (Phase 8) is not restored by `git clone`** — run it before committing or commits silently bypass black/ruff/mypy.

---

## Phase 6 — Data Ingestion

### Option A: Full pipeline (recommended)

`scripts/run_pipeline.py` is a working rebuild path (FR-8.8): each of the 27
stages (Tier 1 + AU/Census/ASX + the FR-9 OSCA/ASC AU-native layer) invokes the
corresponding ingest script's shared `run()` entry point in dependency order,
tagging every derived-computation row with a `pipeline_run_id` (ADR-007 Phase 3). Source-data locations are resolved from `settings.data_root`
(env `DATA_ROOT`, default `$DATA_ROOT`) — set `DATA_ROOT` in
`src/backend/.env` if your data lives elsewhere.

```powershell
cd C:\Users\royst\Projects\skillcurrent\src\backend

# Point the orchestrator at your source data (skip if using the default path)
# Add to src\backend\.env:  DATA_ROOT=C:\path\to\Data

# Dry run first — prints the 30-stage plan without executing
python -m scripts.run_pipeline --stages all --dry-run

# Execute all 30 stages (Tier 1 core + optional AU/Census/ASX/FR-9 OSCA overlay + terminal snapshot_derived_products, ADR-012)
python -m scripts.run_pipeline --stages all

# Selective runs:
python -m scripts.run_pipeline --stages tier1        # US Tier 1 core only
python -m scripts.run_pipeline --stages au           # AU/Census/ASX overlay only
python -m scripts.run_pipeline --from-stage 7        # resume from stage N (0-indexed)
```

Notes:
- **Idempotent**: every stage verifies an integrity hash (ADR-002) and skips or
  replaces unchanged data, so a re-run or a `--from-stage` resume is safe.
- **`epoch_eci` / `ingest_asx_companies` download live** from epoch.ai / asx.com.au
  at runtime — these need network access; their row counts drift as the upstream
  sources update.
- The GDPval evaluation runner (Stage 5 below) is **not** part of the pipeline
  (it needs an Anthropic API key and costs ~$30–50) — run it separately.

### Option B: Manual step-by-step (fallback, or to run a single stage)

**Stage 1 — O*NET (MUST be first):**
```powershell
python -m scripts.ingest_onet --path "$DATA_ROOT\ONet" --version 28.1
```

**Stage 2 — Independent datasets (any order):**
```powershell
python -m scripts.ingest_eloundou --path "$DATA_ROOT\OpenAI-Exposure-Score"
python -m scripts.ingest_microsoft_ai --path "$DATA_ROOT\microsoft-working-with-ai"
python -m scripts.ingest_aei --path "$DATA_ROOT\AEI"
python -m scripts.ingest_aei_temporal --path "$DATA_ROOT\AEI\AEI-full"
python -m scripts.ingest_oews --path "$DATA_ROOT\BLS\oesm24in4"
python -m scripts.ingest_gdpval --path "$DATA_ROOT\GDPval"
python -m scripts.ingest_epoch_eci
```

**Stage 3 — Derived computations (order matters):**
```powershell
python -m scripts.derive_eloundou_dwas
python -m scripts.compute_drift
python -m scripts.embed_titles
python -m scripts.compute_industry_profiles
```

**Stage 4 — Australian data:**
```powershell
python -m scripts.ingest_crosswalk
python -m scripts.ingest_abs
python -m scripts.build_anzsco_concordance
python -m scripts.compute_industry_profiles --region AU --year 2025
python -m scripts.ingest_abs_census_wpp
python -m scripts.ingest_abs_census_w13
# Census subdivision × occupation — run twice: level 2 (pivot) + level 3 (long)
python -m scripts.ingest_census_subdivision_occ "$env:DATA_ROOT\ABS-2021-Census\IndustyxOccupationxEmployment-table_2026-03-29_13-17-55.csv" --level 2
python -m scripts.ingest_census_subdivision_occ "$env:DATA_ROOT\ABS-2021-Census\L3_CDGK_Industry_cat.csv" --level 3
python -m scripts.ingest_anzsic_subdivisions
python -m scripts.ingest_osca                # FR-9.1 OSCA backbone (ADR-010) — requires ingest_abs to have run first
python -m scripts.compute_osca_employment     # ANZSCO->OSCA employment apportionment — requires ingest_osca
python -m scripts.ingest_asc                  # FR-9.2 ASC v3.0 ingest (ADR-011) — requires the .rda files acquired via strayr, in Data\ASC\
python -m scripts.build_dwa_asc_bridge        # semantic DWA<->ASC bridge (ADR-011 L2) — requires ingest_asc; needs the all-MiniLM-L6-v2 model (network on first run)
python -m scripts.compute_au_task_layer       # AU task layer + occupation exposure rollup — requires build_dwa_asc_bridge + ingest_osca's osca_anzsco_map
python -m scripts.compute_us_au_divergence    # US-vs-AU occupation exposure divergence — requires compute_au_task_layer + O*NET tasks + anzsco_soc_concordance
python -m scripts.ingest_asx_companies
```

All ingest scripts now default their `--path`/`--file` arguments from
`settings.data_root`, so the explicit paths above are only needed when overriding
the default location.

**Stage 5 — GDPval waterline (optional, requires API key ~$30-50):**
```powershell
python -m scripts.compute_gdpval_waterline --estimate
```

### Verification
```powershell
python -m pytest tests/test_data_invariants.py -v
```
Expected: ~602,600 total rows across 50 data tables (see `CLAUDE.md` Data Load Status for the authoritative per-table breakdown, including the FR-9.1 OSCA tables: `osca_occupations`, `osca_main_tasks`, `osca_anzsco_map`, `osca_isco_map`, `abs_employment_osca`, and the FR-9.2 AU task layer tables: `asc_specialist_task`, `asc_core_competency`, `asc_technology_tool`, `dwa_embeddings`, `asc_task_embeddings`, `dwa_asc_bridge`, `au_task`, `au_occupation_exposure`). All invariant tests pass.

---

## Phase 7 — Frontend Setup

```powershell
cd C:\Users\royst\Projects\skillcurrent\src\frontend
npm install
npx playwright install   # For E2E tests
```

---

## Phase 8 — Git Hooks

```powershell
cd C:\Users\royst\Projects\skillcurrent

# Install pre-commit hooks (black + ruff + mypy + standard hooks)
pre-commit install

# Verify
pre-commit run --all-files
```

The `post-merge` hook is already in `.git/hooks/post-merge` (restored by clone) — runs `test_data_invariants.py` after every `git pull`/merge.

---

## Phase 9 — Claude Code Configuration

### 9.1 Global plugins
After running `claude` for the first time, verify plugins are enabled. The `~\.claude\settings.json` should contain:

```json
{
  "enabledPlugins": {
    "playground@claude-plugins-official": true,
    "claude-md-management@claude-plugins-official": true,
    "explanatory-output-style@claude-plugins-official": true,
    "huggingface-skills@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "feature-dev@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "security-guidance@claude-plugins-official": true,
    "arckit@arc-kit": true
  },
  "extraKnownMarketplaces": {
    "arc-kit": {
      "source": { "source": "github", "repo": "tractorjuice/arc-kit" }
    }
  }
}
```

If restoring from backup, these are already set. If fresh, re-enable via `/plugins` in Claude Code.

### 9.2 Project-level config (already in repo)
These files are version-controlled and restored by `git clone`:

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Permissions (pytest, black, ruff, git, npm, alembic), PostToolUse hook (auto-format Python), PYTHONPATH env var |
| `.claude/settings.local.json` | 115 granular bash command permissions |
| `.claude/launch.json` | Dev server configs (backend :8000, frontend :5174) |
| `.claude/agents/docs-updater.md` | Syncs documentation after features |
| `.claude/agents/fr2-matching.md` | O*NET title matching specialist |
| `.claude/agents/fr8-drift-engine.md` | Tier 1 intelligence specialist |
| `.claude/agents/privacy-reviewer.md` | Tier 2 privacy compliance |
| `.claude/agents/security-reviewer.md` | Security review agent |
| `.claude/commands/build-tier1.md` | Build Tier 1 pipeline command |
| `.claude/commands/validate-privacy.md` | Privacy validation command |
| `.claude/skills/performance-monitoring/SKILL.md` | P95 + ADR-007 checks |
| `.claude/skills/pipeline-diagnostics/SKILL.md` | Data lineage diagnostics |

### 9.3 Fix launch.json Python path
If Python is installed in a different location than miniconda3, update `.claude/launch.json`:
```json
"runtimeExecutable": "C:\\Users\\royst\\miniconda3\\python.exe"
```
Change to match your new Python installation path (e.g., `C:\\Python312\\python.exe`).

### 9.4 Session-only items to recreate each session
These are NOT persisted and need manual recreation:
- **Governance crons** (fire while coding):
  - `pipeline-diagnostics` every 2h at :17
  - `performance-monitoring` every 2h at :43
- These auto-expire after 7 days anyway

---

## Phase 10 — Verify Everything Works

### Backend
```powershell
cd src\backend
python -m uvicorn app.main:app --reload --port 8000
# Check: http://localhost:8000/health -> {"status":"ok"}
# Check: http://localhost:8000/api/v1/datasets -> lists all loaded datasets
# Check: http://localhost:8000/docs -> OpenAPI docs
```

### Frontend
```powershell
cd src\frontend
npm run dev
# Check: http://localhost:5173 -> dashboard loads with data
```

### Tests
```powershell
cd src\backend
python -m pytest tests/ -v                        # ~161 tests
python -m pytest tests/test_data_invariants.py -v  # Data integrity
python -m pytest tests/test_performance.py -m slow  # P95 thresholds

cd ../frontend
npm run test                                       # Vitest unit tests
npm run test:e2e                                   # Playwright E2E (needs both servers running)
```

### Code quality
```powershell
cd src\backend
python -m black app/ tests/ scripts/ --check
ruff check app/ tests/ scripts/
mypy app/
```

---

## Phase 11 — MCP Servers & Connected Services

MCP servers are NOT configured via `mcp.json` files — they come from **plugins** and **Claude Code connected services**. After rebuild:

### Plugin-provided MCP servers (auto-installed with plugins)
These come back when you re-enable the plugins in Phase 9.1:
- **Playwright** (`mcp__MCP_DOCKER__*`) — browser automation via Docker
- **HuggingFace** (`mcp__1a8b2ec2-*`) — model/dataset/paper search, Hub queries
- **Mermaid** (`mcp__ccaa57e4-*` and `mcp__2dacd1d1-*`) — diagram rendering and validation
- **ArcKit** (`arckit@arc-kit`) — enterprise architecture skills and commands

### Desktop app connected services (re-connect manually)
These are configured through the Claude Code desktop app UI, not files:
- **Claude in Chrome** — requires Chrome extension install from Chrome Web Store
- **Computer Use** — desktop automation
- **Claude Preview** — dev server preview
- **Gamma** — presentation generation
- **PDF Tools** — PDF viewing and editing
- **Scheduled Tasks** — cron-like task scheduling
- **MCP Registry** — connector discovery

### No config files needed
All MCP server state is managed by Claude Code internally. No `mcp.json` to back up or restore.

---

## Quick Reference — Daily Dev Startup

```powershell
# Option A: manual
docker start workforce-pg
cd src\backend && .venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --port 8000   # Terminal 1
cd src\frontend && npm run dev                          # Terminal 2

# Option B: dev scripts
docker start workforce-pg
.\scripts\dev.ps1 start     # Starts both backend + frontend
.\scripts\dev.ps1 status    # Check status
.\scripts\dev.ps1 stop      # Stop both
```

---

## Environment Variables Summary

| Variable | Required | Where | Purpose |
|----------|----------|-------|---------|
| `DATABASE_URL` | Yes | `src/backend/.env` | PostgreSQL connection string |
| `DATA_ROOT` | Optional | `src/backend/.env` | Root of external source data (default `$DATA_ROOT`). All ingest scripts + the pipeline derive dataset paths from this. |
| `ANTHROPIC_AUTH_TOKEN` | Optional | `src/backend/.env` | Claude API for company classification + GDPval evals |
| `PYTHONPATH` | Auto | `.claude/settings.json` | Set to `src/backend` by Claude Code |

Per-dataset path overrides (e.g. `ONET_DATA_PATH`, `CENSUS_SUBDIVISION_L3_FILE`)
are also honoured when a single dataset lives outside the standard `DATA_ROOT`
layout — see `app/core/config.py` for the full list.

---

## Common Issues

| Issue | Solution |
|-------|----------|
| "password authentication failed" | `.env` not UTF-8 or not found. Recreate with Python (see Phase 5) |
| "column X does not exist" | Migrations not run. `python -m alembic upgrade head` |
| Docker container won't start | Check WSL2: `wsl --status`. If missing: `wsl --install` then restart |
| Port 5432 in use | `Get-NetTCPConnection -LocalPort 5432` to find process, or change port |
| Port 8000 in use (WinError 10013) | `Get-NetTCPConnection -LocalPort 8000 \| Select OwningProcess` then `Stop-Process -Id <PID> -Force` |
| `ModuleNotFoundError` | Run `pip install -e ".[dev]"` from `src/backend/` |
| `No module named 'sentence_transformers'` at `embed_titles` | Declared core dep; ensure `pip install -e ".[dev]"` completed |
| `Unable to find a usable engine` / parquet read fails (`ingest_gdpval`) | `pyarrow` missing — re-run `pip install -e ".[dev]"` |
| `ingest_epoch_eci` `KeyError` on a CSV column | Upstream Epoch schema drift; the loader guards optional columns — patch if a *required* column changes |
| `ingest_oews` FK violation (`onet_soc` not in `onet_occupations`) | FIXED in migrations 029/030 (drop the wrong 6-vs-8-digit FKs on `oews_employment` + `industry_occupation_profiles`). If it recurs, run `alembic upgrade head` to apply them. `onet_soc` there is a 6-digit BLS SOC, joined to O*NET by prefix. |
| Commit bypasses black/ruff/mypy | `pre-commit install` not run (Phase 8) |
| pre-commit hooks not running | Run `pre-commit install` from project root |
