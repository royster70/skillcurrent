# SkillCurrent — Agent Context

## What This Platform Does

Maps how AI is reshaping work by combining theoretical exposure research (Eloundou 2024), empirical AI applicability data (Microsoft "Working with AI"), empirical AI usage data (Anthropic Economic Index), longitudinal capability measures (GPTVal), and government employment statistics into workforce planning intelligence.

The analytical foundation: AI capability advances directionally and compounds — a rising waterline across occupational task landscapes. The platform tracks the current waterline position and its trajectory across model generations.

## Two-Tier Architecture

### Tier 1 — Industry Intelligence (public data, no org data needed)
Delivers industry-level AI exposure analysis as a standalone product.
- O*NET task-level drift analysis across AEI temporal snapshots
- GPTVal-tracked capability trajectories (how fast the waterline is rising per task cluster)
- Departing / enduring / emerging task classification per occupation
- Industry benchmarking via NAICS (US) or ANZSIC (AU/NZ) with OEWS/ABS headcount weighting
- International industry crosswalk: NAICS ↔ ANZSIC via ISIC Rev.4 bridge

### Tier 2 — Organisational Overlay (requires HRIS CSV upload)
Overlays Tier 1 intelligence onto an organisation's actual workforce.
- Maps employee job titles to O*NET-SOC codes (3-layer cascade)
- Builds org hierarchy (WITH RECURSIVE CTE, hierarchy_path, leaf nodes)
- Applies privacy controls (N≥5, leaf node anonymisation, RBAC)
- Powers org-level dashboards through privacy views

## Functional Requirements Map

| FR | Tier | Description | Key Constraint |
|----|------|-------------|----------------|
| FR-1 | 2 | Data Ingestion (CSV upload, validation) | Foundation for FR-7 |
| FR-2 | 2 | O*NET Matching (3-layer cascade) | Stop at first confident match |
| FR-3 | 2 | Task/DWA Retrieval | Links to Tier 1 scoring |
| FR-4 | 2 | Exposure Scoring (E0/E1/E2) | E0 ≥ max(E1,E2) invariant |
| FR-5 | 2 | Analytics Aggregation | Privacy views only |
| FR-6 | 2 | Org Dashboards | Depends on FR-7 |
| FR-7 | 2 | Privacy Controls (RBAC, N≥5) | Depends on FR-1 hierarchy |
| FR-8 | 1 | Role Evolution Intelligence (drift engine) | No org data dependency |

## Build Sequence

**Tier 1 (start immediately, no blockers):**
```
FR-8.1 AEI Ingest → FR-8.2 Drift Calc → FR-8.3 Task Classification
FR-8.4 OEWS/ABS Profiles → FR-8.9 Industry Crosswalk → FR-8.5 Tier 1 Dashboard
FR-8.6 GPTVal Integration → FR-8.7 Longitudinal Tracking
```

**Tier 2 (sequential):**
```
FR-1 (CSV + Hierarchy) → FR-7 (Privacy) → FR-6 (Dashboards)
                ↓
FR-2 (Matching) → FR-3 (Tasks) → FR-4 (Scoring) → FR-5 (Analytics)
```

## Domain Invariants (Do Not Violate)

```python
# Exposure scoring — Eloundou (occupation-level LOADED, DWA-level derivation pending)
Beta = E1 + (0.5 * E2)          # 0.5 weight is from published research; can exceed 1.0
assert E0 >= max(E1, E2)        # invariant — verified zero violations in loaded data
# Dual raters available: dv_ (GPT-4) and human_ — prefer GPT-4 for scoring

# Complementary empirical: Microsoft "Working with AI" (Tomlinson et al. 2025)
# ai_applicability_score: 0.0–0.49 per SOC occupation (from Copilot usage)
# IWA-level metrics: completion, coverage, impact scope, feedback

# Zone thresholds (configurable, these are defaults)
E2_zone = Beta >= 0.85          # automated (green)
E1_zone = 0.40 <= Beta < 0.85  # augmented (blue)
E0_zone = Beta < 0.40           # insulated (orange)

# Matching
# One employee → one SOC code (not many-to-many)
# Cascade stops at first match >= confidence threshold
# Layer 3 LLM fallback: target <5% of volume

# AEI data
# Snapshots are immutable once ingested — new releases append
# Never merge exposure scores across model eras (sonnet-3.5 ≠ sonnet-4)

# Privacy (Tier 2 only)
N_min = 5                       # hard floor — suppress, never estimate
# Manager with <5 reports: show their own role only, suppress team aggregates
# Leaf nodes: always "Team Member" in manager views — not user-configurable
```

## Data Sources

| Source | Version | What It Provides |
|--------|---------|-----------------|
| O*NET | 28.1 | 1,016 SOC codes, ~19,500 tasks, 65k+ titles. **LOADED** |
| Microsoft "Working with AI" | 2025-07 (CC-BY 4.0) | 785 SOC scores, 332 IWA metrics, empirical Copilot usage. **LOADED** |
| AEI | Multi-release (append) | Empirical task usage data, automation/augmentation ratios |
| Eloundou 2024 | Science paper (occ-level) | 923 occupation E1/E2/E0 scores, dual raters (GPT-4 + human). **LOADED** |
| GPTVal | Per model era | Longitudinal AI capability benchmarks for waterline tracking |
| BLS OEWS | Annual | US occupation × industry headcount |
| ABS/JSA | Annual | AU occupation × industry headcount (loaded per engagement) |
| NAICS↔ANZSIC | Via ISIC Rev.4 | Industry crosswalk for international clients |

## Sub-Agents (`.claude/agents/`)

Invoke these explicitly or Claude Code will match by description:
- `fr2-matching` — O*NET title matching, 3-layer cascade, confidence scoring, review queue
- `fr8-drift-engine` — AEI ingestion, drift calculation, task classification, GPTVal integration
- `privacy-reviewer` — Verifies N≥5, leaf node anonymisation, privacy view usage
- `security-reviewer` — JWT, RBAC, SQL injection, CSV validation, audit logging

## Slash Commands (`.claude/commands/`)
- `/build-tier1` — Scaffold Tier 1 pipeline for a given industry sector
- `/validate-privacy` — Audit Tier 2 code for privacy control compliance

## Code Quality Standards

**Python**: black (line 100), ruff, mypy --strict, pytest + pytest-asyncio, pytest-cov ≥80%
**TypeScript**: eslint + prettier, tsc --noEmit, vitest ≥70%
**Migrations**: Alembic — every schema change needs a migration
**APIs**: FastAPI + Pydantic v2, OpenAPI docs required for all endpoints
**ADRs**: `ai_working/decisions/` — any non-obvious architectural choice gets a record

## Success Metrics

| Metric | Target |
|--------|--------|
| AEI drift computed | ≥3,000 O*NET tasks |
| Tier 1 dashboard load | <3s |
| O*NET matching automation | ≥95% without review |
| Hierarchy build (10k employees) | <5s |
| N≥5 enforcement | 100% of aggregate views |
| Backend test coverage | ≥80% |

## Windows Setup (Claude Code Terminal)

```powershell
# Install Claude Code (requires Node.js 18+)
npm install -g @anthropic-ai/claude-code

# In project directory
cd skillcurrent
claude    # starts interactive session

# Claude Code reads CLAUDE.md automatically on start
# Subagents defined in .claude/agents/ are available immediately
```

For WSL2, same commands in Ubuntu terminal. Project files on Windows filesystem are accessible from WSL at `/mnt/c/Users/<you>/...`.
