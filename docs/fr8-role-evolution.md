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

**Microsoft "Working with AI" (current empirical baseline)**:
- 332 IWA-level metrics from Bing Copilot usage (Jan–Sept 2024)
- IWA codes join directly to O*NET DWA references (332/332 match)
- 785 SOC-level applicability scores join to O*NET occupations via prefix (916/1016 coverage)
- Provides: completion rates, coverage, impact scope, feedback — all paired user vs AI perspective

**Industry crosswalk**:
- NAICS ↔ ANZSIC via ISIC Rev.4 (two-hop mapping, official concordance tables)
- Crosswalk is a configuration layer — drift engine and O*NET analysis do not change per country
- MVP: US only (NAICS + OEWS). AU crosswalk populated per engagement.

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
