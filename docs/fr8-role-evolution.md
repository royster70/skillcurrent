---
meta:
  name: fr8-role-evolution
  description: "Tier 1 Role Evolution Intelligence — AEI ingestion, task drift, GPTVal longitudinal tracking, industry profiling"
---

You specialise in FR-8: Role Evolution Intelligence (Tier 1 — public data only).

## Scope
FR-8.1 AEI ingestion · FR-8.2 Drift calculation · FR-8.3 Task classification
FR-8.4 OEWS/ABS industry profiles · FR-8.5 Tier 1 dashboard · FR-8.6 GPTVal integration
FR-8.7 Longitudinal waterline tracking · FR-8.9 Industry crosswalk (NAICS↔ANZSIC)

## Critical Rules (read docs/domain-model.md for full contracts)

**AEI data**:
- Snapshots are append-only — never UPDATE existing rows
- Unique constraint: `(task_text, snapshot_date, platform)`
- Never merge scores across model eras
- Absence of AEI coverage ≠ zero; store explicitly as null; it's an analytically meaningful signal

**Drift calculation**:
- Velocity = linear regression slope of `automation_pct` over time per task
- Classify: departing (positive slope + high automation), enduring (low/stable), emerging (new patterns)
- "Just below threshold" tasks (40–50% automation, positive velocity) = highest-priority dashboard signal

**GPTVal integration**:
- Waterline velocity tracks how fast AI applicability/exposure changes per model era transition
- Eloundou Beta scores provide the theoretical baseline (923 occupations loaded); Microsoft AI applicability provides the empirical complement
- Store by `(metric_name, model_era, measurement_date)` — immutable compound key
- **P0a (implemented)**: `scripts/ingest_epoch_eci.py` — downloads Epoch AI ECI data at runtime (CC-BY, no local file). Loads 408 rows into `gptval_benchmarks` (39 benchmarks × 32 model eras, Claude 2 through Claude 4.6 + GPT/Gemini/Llama). Enables `GET /api/v1/gdpval/waterline` — velocity per benchmark sorted by descending rate of improvement, overall +0.030/era. Pipeline stage: `epoch_eci`.
- **P0b (in progress)**: `scripts/compute_gdpval_waterline.py` — Claude API runner grading 220 GDPval tasks × 4 model eras (claude-4-sonnet, claude-4-opus, claude-4.5-sonnet, claude-4.5-opus) → `gdpval_evaluations`. Uses Claude Haiku as judge model. `ON CONFLICT DO NOTHING` — resume-safe across runs. ~$30-50 for all 4 eras. Target: 880 rows when complete (220 tasks × 4 eras).
- See ADR-006 for the P0a/P0b acquisition pattern distinction.

**Microsoft "Working with AI" (current empirical baseline)**:
- 332 IWA-level metrics from Bing Copilot usage (Jan–Sept 2024)
- IWA codes join directly to O*NET DWA references (332/332 match)
- 785 SOC-level applicability scores join to O*NET occupations via prefix (916/1016 coverage)
- Provides: completion rates, coverage, impact scope, feedback — all paired user vs AI perspective

**Industry crosswalk**:
- NAICS ↔ ANZSIC via ISIC Rev.4 (two-hop mapping, official concordance tables)
- Crosswalk is a configuration layer — drift engine and O*NET analysis do not change per country
- MVP: US only (NAICS + OEWS). AU crosswalk populated per engagement.

**Australian Census data (FR-8.9 extension, 2026-03-29)**:
- `abs_census_wpp` (W12A): 180 rows — ANZSIC division × ANZSCO major group, Census 2021 headcounts. Primary source for occupation mix per AU sector.
- `abs_census_w13` (W13): 159 rows — ANZSCO sub-major group × Sex (M/F/P), national level. Enables gender diversity analytics at occupation-category level.
- `anzsic_subdivisions`: 214 rows — JSA Industry Data Table 3 sub-sector employment (e.g., "Electricity Generation", "Electricity Distribution", "Gas Supply" within Division D). Injected into AU classify prompt to give the LLM sub-sector resolution for diversified company classification.
- These three tables are loaded independently via `ingest_abs_census_wpp.py`, `ingest_abs_census_w13.py`, and `ingest_anzsic_subdivisions.py` respectively (see INGESTION_RUNBOOK sections 4.12e–g).

## Key Schema

```sql
-- AEI snapshots (append-only)
CREATE TABLE aei_task_snapshots (
    id                  SERIAL PRIMARY KEY,
    task_text           TEXT NOT NULL,
    onet_soc_codes      TEXT[],
    snapshot_date       DATE NOT NULL,
    release_version     TEXT NOT NULL,       -- '2025-02-10'
    model_era           TEXT NOT NULL,       -- 'sonnet-3.7'
    automation_pct      FLOAT,               -- directive + feedback_loop
    augmentation_pct    FLOAT,               -- task_iteration + learning + validation
    platform            TEXT DEFAULT 'global', -- 'claude_ai', '1p_api', 'global'
    UNIQUE(task_text, snapshot_date, platform)
);

-- Drift metrics (per task, updated on new snapshot ingest)
CREATE TABLE task_drift_metrics (
    onet_task_id        TEXT NOT NULL,
    task_text           TEXT NOT NULL,
    first_seen_date     DATE,
    latest_date         DATE,
    snapshot_count      INTEGER,
    velocity            FLOAT,               -- regression slope
    classification      TEXT,               -- 'departing'|'enduring'|'emerging'|'below_threshold'
    latest_automation   FLOAT,
    peak_automation     FLOAT,
    PRIMARY KEY(onet_task_id)
);

-- GPTVal benchmarks (one row per model era per metric)
CREATE TABLE gptval_benchmarks (
    metric_name         TEXT NOT NULL,
    model_era           TEXT NOT NULL,
    measurement_date    DATE NOT NULL,
    score               FLOAT,
    notes               TEXT,
    PRIMARY KEY(metric_name, model_era)
);

-- GDPval model-era evaluation scores (populated by compute_gdpval_waterline.py — P0b)
CREATE TABLE gdpval_evaluations (
    task_id             TEXT NOT NULL,
    model_era           TEXT NOT NULL,
    model_name          TEXT,
    evaluation_date     DATE,
    total_score         FLOAT,
    max_possible_score  FLOAT,
    completion_pct      FLOAT,
    notes               TEXT,
    PRIMARY KEY(task_id, model_era)
);

-- Industry crosswalk
CREATE TABLE industry_crosswalk (
    source_system   TEXT NOT NULL,           -- 'NAICS_2022'
    source_code     TEXT NOT NULL,           -- '2211'
    target_system   TEXT NOT NULL,           -- 'ANZSIC_2006'
    target_code     TEXT NOT NULL,           -- 'D261'
    bridge_system   TEXT,                   -- 'ISIC_REV4'
    bridge_code     TEXT,
    match_type      TEXT NOT NULL,           -- 'exact'|'partial'|'split'|'merge'
    weight          FLOAT DEFAULT 1.0,
    PRIMARY KEY(source_system, source_code, target_system, target_code)
);
```

## AU Occupation Mix Endpoint (FR-8.9 extension)

`GET /api/v1/sectors/{code}/occupation-mix` — returns Census W12A occupation mix for an AU sector (ANZSIC division). Response shape: `{ anzsic_code, occupation_mix: [{ anzsco_major_group, employed_count, share_pct }] }`.

This endpoint powers the `occupation_mix` array that is now included on:
- `GET /api/v1/sectors?region=AU` — list endpoint includes occupation mix per division
- `GET /api/v1/sectors/composite?region=AU` — composite sector response includes blended occupation mix weighted by division employment

The `_load_au_occupation_mix()` helper in `composite_sector.py` blends occupation mix arrays from multiple ANZSIC divisions, weighting by each division's employment share.

**Classifier enrichment**: The AU LLM classify prompt (`POST /api/v1/companies/classify`) now injects the top 6 subdivisions per ANZSIC division (with headcounts) from `anzsic_subdivisions`. This gives Claude Haiku 4.5 sub-sector context to distinguish, for example, AGL (generation + gas supply + retail telco) from AusNet (distribution + transmission only) within Division D.

**`ClassifyResponse` additions**:
- `workforce_profile` — W12A Census occupation mix blended across the company's classified sectors (powered by `_load_workforce_profile()`)
- `single_sector_asx` — boolean flag on `CompanySearchResult`; set when an ASX lookup maps to exactly one sector, indicating the company may be a candidate for LLM reclassification to capture secondary business lines

## Task Matrix API Enrichment (FR-8.7)

The `GET /api/v1/occupations/{soc}/matrix` endpoint now returns:
- `automation_pct` and `augmentation_pct` per era snapshot (sourced from `aei_task_snapshots`)
- `gdpval_benchmark_count` per occupation (count of matching `gdpval_tasks`)

These fields power the GDPval overlay strip on the TaskMatrix chart and the AEI auto/aug split visualisation on the Occupations page.

### GDPval Waterline Endpoint

`GET /api/v1/gdpval/waterline` — returns velocity per benchmark from `gptval_benchmarks`, sorted by descending rate of improvement. Powered by P0a (Epoch ECI ingest). Overall waterline: +0.030/era across all 39 benchmarks.

Response shape: `{ benchmarks: [{ benchmark_name, velocity, model_eras_covered, latest_score }], overall_velocity }`.

Once P0b evaluation scores are loaded into `gdpval_evaluations`, this endpoint will be extended to include occupation-level waterline trajectories per model era.

## Success Metrics
- AEI drift computed for ≥3,000 O*NET tasks
- All 4+ AEI releases ingested within 24h of platform setup
- Occupation drift profiles for all 1,016 O*NET-SOC codes
- Tier 1 dashboard loads in <3s
- Sector filtering available for ≥10 industry sectors

## After Implementation
- Document AEI-to-O*NET join approach in `ai_working/discoveries/aei-onet-join-patterns.md`
- Create ADR if non-obvious schema decisions made
- Update `ai_working/context/implementation-status.md`
