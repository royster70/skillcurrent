# Domain Model Reference

Written for AI-assisted development. Contains data source contracts, invariants, and rules Claude Code must follow. For product rationale and consulting framing, see PRD.md.

---

## 1. O*NET 28.1 — File Contracts

**Source**: Downloaded files from onetcenter.org/database.html — use versioned files, NOT the web API
**Format**: Tab-delimited .txt, UTF-8
**SOC code format**: `"XX-XXXX.XX"` (e.g., `"15-1252.00"`) — always with decimal, always quoted in SQL
**Version field**: Store `"28.1"` with every derived record; bump triggers full re-matching + re-scoring

| File | Rows | Key Columns |
|------|------|-------------|
| `Occupation Data.txt` | 1,016 | `O*NET-SOC Code`, `Title`, `Description` |
| `Task Statements.txt` | ~19,500 | `O*NET-SOC Code`, `Task ID`, `Task`, `Incumbents Responding`, `Importance`, `Relevance` |
| `Work Activities.txt` | ~73k | `O*NET-SOC Code`, `Element ID`, `Element Name`, `Scale ID`, `Data Value` |
| `Sample of Reported Titles.txt` | 37,000+ | `O*NET-SOC Code`, `Reported Job Title`, `Shown in My Next Move` |
| `DWA Reference.txt` | ~2,000 | `Element ID`, `DWA Title` |

**DWA vs Task Statement distinction (CRITICAL)**:
- `Work Activities.txt` contains DWA codes (`Element ID` like `"4.A.2.a.4"`) — abstract activity descriptors
- `Task Statements.txt` contains task statements — specific, occupation-level task descriptions
- Eloundou 2023 scores map to **DWA codes**, not task statements (PARKED — data not publicly available)
- Microsoft "Working with AI" scores map to **IWA codes** (332 IWAs) and **SOC codes** (785 occupations) — currently active empirical baseline
- AEI data maps to **task statement text** (verbatim O*NET task text)
- To join Microsoft AI ↔ O*NET DWAs: IWA code in `ms_ai_iwa_metrics` matches `iwa_id` in `onet_dwa_references` (332/332 perfect match)
- To join AEI ↔ Eloundou (when available): task statement → O*NET-SOC code → DWA → Eloundou score

---

## 2. AI Applicability Scoring — Current Empirical Baseline

### 2a. Microsoft "Working with AI" (Tomlinson et al. 2025) — ACTIVE

**Source**: https://github.com/microsoft/working-with-ai (CC-BY 4.0)
**Basis**: Empirical Bing Copilot usage data, Jan–Sept 2024, US users
**O\*NET version**: 29.0 (SOC 2018 codes — compatible with our O\*NET 28.1)

| Table | Rows | Key columns |
|-------|------|-------------|
| `ms_ai_applicability_scores` | 785 | `soc_code`, `ai_applicability_score` (0.0–0.49) |
| `ms_ai_soc_metrics` | 785 | coverage, completion, feedback, impact scope — paired user/AI |
| `ms_ai_iwa_metrics` | 332 | IWA-level metrics — joins to `onet_dwa_references.iwa_id` (332/332 match) |
| `ms_ai_soc_to_iwas` | 13,698 | SOC → IWA mapping |
| `ms_ai_physical_tasks` | 18,796 | Physical task flags (matches `onet_task_statements` count) |

**SOC code join**: Microsoft uses 6-digit SOC codes (`11-1011`). Join to O\*NET via prefix: `onet_occupations.onet_soc LIKE ms.soc_code || '%'`. Covers 916 of 1,016 O\*NET occupations.

**IWA-to-DWA join**: `ms_ai_iwa_metrics.iwa_code` matches `onet_dwa_references.iwa_id` directly. All 332 IWAs link through to DWAs.

**Key metrics for scoring**:
- `ai_applicability_score` — composite score averaging user-goal and AI-action perspectives
- `completion_ai` — fraction of work activities where AI successfully completed the goal
- `coverage_ai` — weighted IWA representation for each occupation
- `impact_scope_ai` — scope of AI influence classified as moderate or higher

### 2b. Eloundou 2024 Exposure Scores — LOADED (occupation-level)

**Source**: OpenAI supplementary data (`occ_level.csv`)
**Level**: Occupation (923 O\*NET SOC codes, 8-digit format — direct FK join)
**Raters**: Both GPT-4 (`dv_`) and human annotator scores
**DWA-level**: Not published — must be derived via Strategy A/B (see `docs/ELOUNDOU_EXPOSURE.md`)

**Column mapping from source CSV**:
- `alpha` → E1 (direct LLM exposure)
- `beta` → E2 (complementary/tools exposure)
- `gamma` → E0 (overall exposure)
- `dv_beta_derived` = E1 + 0.5×E2 (computed on ingest, can exceed 1.0)

| Column | Meaning |
|--------|---------|
| `dwa_code` | O*NET Element ID (`"4.A.2.a.4"`) |
| `E0` | Overall exposure — headline figure |
| `E1` | Direct exposure α — AI alone reduces task time ≥50% |
| `E2` | Complementary exposure β — AI + tools combination achieves same |

**INVARIANT**: `E0 >= max(E1, E2)` — always. Verified: zero violations in the loaded dataset for both rater types.

**Beta score**: `Beta = E1 + (0.5 * E2)` — the 0.5 weight is from the paper methodology. Do not change this coefficient. Note: Beta can exceed 1.0 (max observed: 1.5 for GPT-4 rater).

**Baseline context**: Eloundou scores were calibrated against GPT-3.5 capabilities in early 2023. They represent a floor estimate. The gap between Eloundou theoretical exposure and Microsoft/AEI empirical usage is analytically significant — it reveals adoption gaps.

**DWA-level derivation** (pending computation): See Strategy A in `docs/ELOUNDOU_EXPOSURE.md` — distribute occupation Beta through task-to-DWA mapping weighted by task importance. The O\*NET data for this is loaded (23,850 task-to-DWA mappings, 161,559 task ratings).

---

## 3. Anthropic Economic Index (AEI) — Temporal Snapshots

**Source**: HuggingFace dataset (CC-BY). Multiple releases; append on each new release.
**Content**: O*NET task statements matched to Claude conversation patterns (empirical usage data)

**CRITICAL ingestion rules**:
- Snapshots are **immutable once ingested** — new releases always append to `aei_task_snapshots`; never UPDATE existing rows
- Each snapshot has a `release_version` (e.g., `'2025-02-10'`) and `model_era` (e.g., `'sonnet-3.7'`)
- **Never merge or average scores across model eras** — sonnet-3.5 data and sonnet-4 data are distinct points on the capability curve
- `platform` field: `'claude_ai'` (consumer) vs `'1p_api'` (enterprise, available Sept 2025+). For workforce planning, weight enterprise API data more heavily
- Missing AEI data for a DWA is a meaningful signal: classify explicitly as `null` (no data) vs `0.0` (zero usage). The absence pattern is analytically significant — may indicate adoption gap rather than low AI relevance

**Key derived columns to compute on ingest**:
```python
automation_pct = directive_pct + feedback_loop_pct
augmentation_pct = task_iteration_pct + learning_pct + validation_pct
```

**Unique constraint**: `(task_text, snapshot_date, platform)` — prevents duplicate ingestion

---

## 4. GPTVal — Longitudinal Capability Tracking

**Purpose**: Tracks AI capability growth across model generations — the "velocity" of the rising waterline
**Versioning**: One record per (capability_dimension, model_era). Never update existing records.
**Model eras** (sequential): `sonnet-3.5` → `sonnet-3.7` → `sonnet-4` → `sonnet-4.5` → ...

**What GPTVal enables**:
- Compute waterline velocity: how fast task exposure Beta is changing per model generation
- Identify "threshold tasks" — tasks approaching the E1→E2 zone boundary in the next 1-2 capability cycles
- Weight forward projections: which task clusters will flip zones soonest

**Storage rule**: GPTVal scores are stored by `(metric_name, model_era, measurement_date)`. Compound key is immutable.

---

## 5. Industry Classification & Crosswalk

**US**: NAICS 2022 — 20 sectors, used with BLS OEWS for headcount weighting
**Australia/NZ**: ANZSIC 2006 Rev.2 — 19 divisions (A–S), used with ABS/JSA data
**Bridge**: ISIC Rev.4 — UN standard that both NAICS and ANZSIC map to via official concordance tables

**ANZSIC 2006 hierarchy** (4 levels, platform uses top 2):
- **Divisions** (19: A–S) — sector-level analysis, stored in `industry_occupation_profiles.naics_code` for AU rows
- **Subdivisions** (96 codes, 214 named sub-sectors in JSA data) — LLM classify prompt context only (ADR-008)
- Groups (216 codes) — not currently used
- Classes (506 codes) — not currently used; would require ABS TableBuilder access

Last revision: 2006 (Rev.2, current). ABS consulted on ISIC Rev.5 adoption in 2022; next revision TBD.

**Crosswalk table** (`industry_crosswalk`):
```
(source_system, source_code) ← e.g. ('NAICS_2022', '2211')
     ↕ via bridge_system / bridge_code (ISIC_REV4)
(target_system, target_code) ← e.g. ('ANZSIC_2006', 'D261')
```

**Match type field**: `'exact'`, `'partial'`, `'split'`, `'merge'`
**Weight field**: For one-to-many splits (e.g., one NAICS → two ANZSIC at 0.6/0.4 proportion)
**MVP scope**: Populate US side only (NAICS + OEWS). ANZSIC crosswalk populated per engagement.

**CRITICAL**: The drift engine and O*NET task analysis are completely independent of which industry classification system is active. Industry crosswalk affects only: (a) which NAICS/ANZSIC label is shown in the UI, and (b) which headcount weighting source is used. The underlying SOC codes and task drift calculations never change.

**AU Census tables** (loaded as of 2026-03-29):

| Table | Rows | Source | Purpose |
|-------|------|--------|---------|
| `abs_census_wpp` | 180 | ABS 2021 Census W12A | ANZSIC division × ANZSCO major group headcounts — drives `GET /sectors/{code}/occupation-mix` |
| `abs_census_w13` | 159 | ABS 2021 Census W13 | ANZSCO sub-major group × Sex — diversity analytics |
| `anzsic_subdivisions` | 214 | JSA Industry Data Table 3 | Sub-sector employment labels and headcounts — injected into AU LLM classify prompt |

**ANZSIC subdivision context rule**: The `anzsic_subdivisions` table is used only as prompt context for LLM classification. It does not affect sector codes stored in `industry_occupation_profiles` or `asx_company_sectors`. The platform's sector analysis remains at ANZSIC division level (A–S). If subdivision-level routing is ever required, that is a schema change, not a prompt change.

---

## 5a. OSCA 2024 — AU Occupation Backbone & ANZSCO→OSCA Employment Apportionment (FR-9.1)

**Source**: ABS Occupation Standard Classification for Australia (OSCA) 2024 v1.0, released 6 Dec 2024. Licence CC BY 4.0. Four workbooks: "OSCA structure.xlsx", "OSCA Category Descriptions.xlsx", "OSCA correspondence tables v2.xlsx", "OSCA index of principal titles...xlsx" (index file not yet ingested).

**Status**: OSCA is now the canonical AU occupation entity, replacing the retired ANZSCO. ANZSCO is retained as a legacy dual key during the transition, bridged via `osca_anzsco_map`. Full design rationale: `ai_working/decisions/ADR-010-anzsco-osca-employment-apportionment.md`.

**Tables** (migrations 023, 024 — see `docs/DATA_DICTIONARY.md` for full column detail):
- `osca_occupations` (1,156) — 6-digit OSCA occupation backbone
- `osca_main_tasks` (6,887) — **descriptor_only**; GenAI-generated by ABS, few and broad, no O*NET/DWA linkage
- `osca_anzsco_map` (1,383) — official OSCA↔ANZSCO v1.3 correspondence, `full`/`partial` flag
- `osca_isco_map` (1,448) — official OSCA↔ISCO-08 correspondence
- `abs_employment_osca` (2,997) — AU employment apportioned ANZSCO→OSCA, method-tagged

**Invariant — OSCA main tasks are never an exposure carrier**: `osca_main_tasks.descriptor_only` is always `true`. These rows are validation/descriptor text only; they must never be joined into any Eloundou/Microsoft/AEI exposure scoring path. The task-level exposure carrier for AU occupations is the Australian Skills Classification (ASC) specialist task layer, built in FR-9.2 — see section 5b below.

**Invariant — apportionment reconciliation (ADR-010)**: `abs_employment` publishes AU employment at two overlapping ANZSCO granularities (4-digit unit group and 6-digit occupation). `abs_employment_osca` applies a double-count guard (A0): 6-digit rows are always the apportionment source; a 4-digit row is used only for the portion with no 6-digit children in `abs_employment`. `SUM(abs_employment_osca.apportioned_employment)` reconciles exactly to the de-duplicated ANZSCO base — verified 9,612,166 = 9,612,166. Apportionment redistributes; it never creates or destroys employment.

**Invariant — method-tagging, no invented proportions**: ABS's own OSCA↔ANZSCO correspondence publishes no split proportions for one-to-many links (only a `full`/`partial` flag). Every `abs_employment_osca` row carries `link_method`:
- `full` (confidence 1.0) — a 6-digit ANZSCO code with exactly one OSCA target. Measured, not modelled. 1,702 rows, ~61% of total employment.
- `apportioned_equal` (confidence 0.4–0.5) — a source row splitting across N OSCA targets with no finer employment to weight by; divided equally, labelled, never presented as measured. 1,295 rows, ~39% of total employment.

ADR-010 documents a third rung, `apportioned_employment` (A2 — weighted by held employment of finer ANZSCO detail), but **this is not yet implemented**; only A1 (`full`) and A3 (`apportioned_equal`) are live in `app/services/osca_apportionment.py`. Do not assume A2 exists when reading code or writing queries against `abs_employment_osca.link_method`.

**`abs_employment.osca_code` vs `abs_employment_osca`**: `abs_employment.osca_code` (added migration 023) is a conservative, additive dual-key backfill — populated only for 6-digit ANZSCO rows with a single unambiguous OSCA match (1,501 of 2,743 rows). It is not apportioned and does not reconcile to full employment coverage on its own. For employment-weighted OSCA analysis, use `abs_employment_osca`, which apportions all rows including 4-digit and ambiguous n:m mappings.

**`industry_occupation_profiles.osca_code`**: Added (migration 023), nullable, **not yet populated**. Populating it requires the `onet_soc → anzsco → osca` chain with employment apportionment for many-to-many correspondences — deliberately left to a future AU-profile compute step rather than backfilled in the schema migration, so split correspondences apportion correctly rather than double-count.

**Versioning**: `osca_version` (currently `"2024.1.0"`) is stored on every OSCA-derived record, following the same rule as `onet_version` elsewhere in this document.

---

## 5b. AU Task-Level Exposure — the DWA Pivot (FR-9.2, ADR-011)

**Problem**: the platform's AI-exposure signals (Eloundou, Microsoft) are scored at O\*NET **DWA** grain (17,537 `eloundou_dwa_scores` rows). OSCA's main tasks have no DWA linkage (5a above), so there is no direct way to give Australian occupations task-level exposure detail the way US occupations have it via `onet_tasks_to_dwas`.

**Solution — pivot on the DWA, with the Australian Skills Classification (ASC) specialist task as the carrier**. Full design, the L0–L4 decision ladder, and the B0 gating-spike finding: `ai_working/decisions/ADR-011-au-task-exposure-dwa-pivot-ladder.md`.

**Source**: Australian Skills Classification (ASC) v3.0 (Jobs and Skills Australia), acquired via the `runapp-aus/strayr` R package `.rda` files (read with `pyreadr`, a declared dependency). Licence CC BY 4.0. Three layers, all keyed on 4-digit ANZSCO:
- `asc_specialist_task` (10,963) — the exposure carrier; built from O*NET DWAs per JSA methodology, but the **published files carry no source-DWA/O*NET/IWA identifier column** (confirmed by the B0 spike, 2026-07-12)
- `asc_core_competency` (6,000) — 10 competencies × score/proficiency/anchor
- `asc_technology_tool` (1,989)

**B0 finding — why the bridge must be semantic**: because ASC v3.0 exposes no lineage column, an `L1 dwa_lookup` join is impossible. `asc_specialist_task.source_dwa_id` stays `NULL` and is reserved only in case a future ASC release publishes lineage. The live measured rung is **L2 — semantic**: O\*NET DWA titles and distinct ASC specialist-task texts are embedded with the existing `all-MiniLM-L6-v2` + pgvector stack (`dwa_embeddings`, `asc_task_embeddings`), and top-3 nearest DWA per task is recorded in `dwa_asc_bridge` at a cosine floor of 0.60. This is reliable specifically because ASC tasks are reworded DWAs, so the texts are close by construction — verified: 1,923/1,925 distinct tasks matched (99.9%), 1,201 rank-1 matches ≥0.95 cosine similarity.

**Attachment**: each ASC task's exposure is the cosine-weighted average of `AVG(dv_beta_derived)` (global, per matched DWA — the same distributed-DWA scale the existing US task_matrix uses, so US and AU task exposure are directly comparable) across its matched DWA(s), weighted at the occupation level by ASC's own `percent_of_time_spent_on_task`. Tasks are expanded from their 4-digit ANZSCO code to OSCA occupation(s) by reusing the ADR-010 4-digit→OSCA expansion pattern, then rolled up to a task-weighted occupation exposure in `au_occupation_exposure`.

**Tables** (migrations 025–027 — see `docs/DATA_DICTIONARY.md` for full column detail): `asc_specialist_task`, `asc_core_competency`, `asc_technology_tool`, `dwa_embeddings`, `asc_task_embeddings`, `dwa_asc_bridge`, `au_task`, `au_occupation_exposure`.

**Invariant — availability vs confidence are separate fields, never conflated**: `au_task.task_level_available` (boolean) is `true` iff a task reached a *measured* rung (L1 or L2); `au_task.task_level_method` records which rung (`T2` for all currently-measured rows — there is no live L1). `au_task.confidence` is always the bridge cosine similarity, never a fabricated or blended score. Headline/publishable metrics use L1+L2 only; the derived rungs (L3a/L3b) described in ADR-011 are not yet implemented.

**Invariant — OSCA main tasks reject task-level exposure**: `au_task` has a database CHECK constraint (`ck_au_task_osca_main_no_exposure`: `task_source <> 'OSCA_main' OR au_native_beta IS NULL`), enforcing the 5a rule at the schema level, not just by convention.

**Invariant — US-imported and AU-native exposure never blend**: `au_task.us_imported_beta` (reserved, not yet populated) and `au_task.au_native_beta` are separate columns. A `us_au_divergence` boolean (reserved, not yet populated) is intended to flag disagreement between the two as a first-class, publishable insight — not silently averaged away.

**Coverage (verified, 2026-07-12)**: 20,329 `au_task` rows, 99.97% measured (20,322/20,329, all tier T2). 960 of 1,156 OSCA occupations carry at least one measured AU-native task; the remaining 196 have no ASC coverage and are task-level `NA` — which is not the same as "no exposure": `au_occupation_exposure`/`eloundou_occ_scores` remain the near-complete occupation-level plane per ADR-011 L0, so "no task detail" never reads as "no exposure".

---

## 6. O*NET Title Matching — 3-Layer Cascade

One employee maps to exactly one O*NET SOC code. The cascade stops at the first match meeting the confidence threshold.

| Layer | Method | Target Volume | Confidence Threshold |
|-------|--------|--------------|---------------------|
| 1 | Dictionary lookup — O*NET Sample Reported Titles exact/fuzzy | ~75% | ≥0.90 |
| 2 | Sentence-transformer embeddings + pgvector cosine similarity | ~20% | ≥0.70 |
| 3 | LLM fallback (claude-haiku) | <5% | any (flags for review if <0.60) |

**Rules**:
- Do NOT run all layers and pick the "best" result — stop at first match above threshold
- Do NOT call Layer 3 for titles that Layer 2 can handle — LLM calls are rate-limited
- Low confidence matches (<0.60 regardless of layer) → review queue, not best guess
- Store with every match: `onet_soc`, `confidence`, `matching_layer`, `method`, `onet_version`

---

## 7. Task Drift & Classification

Tasks are classified based on their AEI automation trajectory across snapshots:

| Class | Signal | Workforce Implication |
|-------|--------|----------------------|
| **Departing** | Automation ratio rising across snapshots, positive velocity | Don't hire for; retrain incumbents |
| **Enduring** | Low AEI usage, high O*NET importance, stable | Invest — differentiates human workers |
| **Emerging** | New task patterns in AI workflows; may not exist yet in O*NET | Develop now; competitive advantage |

**"Just Below Threshold" tasks** — highest priority signal for workforce planning:
- Current automation ratio 40–50% with positive velocity
- These will likely flip zone in the next 1-2 model generations
- Surface these prominently in dashboards, not buried in tables

**Velocity calculation**: Linear regression over automation_pct across snapshot dates for each task. Positive slope = departing trajectory. Negative slope = enduring.

---

## 8. Privacy Rules (Tier 2 Only)

These are hard constraints derived from privacy law and ethical requirements. They are not UI preferences.

```
N≥5 rule:
  - ALL aggregates (department, team, occupation, zone) must have ≥5 employees
  - If count < 5: suppress the row entirely — return 403 or omit from results
  - Do not estimate, impute, or combine with adjacent groups

Manager with <5 reports (edge case):
  - Do not show team aggregates
  - Show only: the manager's own role/exposure, their individual tasks
  - UI must clearly indicate why team view is unavailable

Leaf node anonymisation:
  - is_leaf_node = TRUE → display as "Team Member", employee_id as "***", email NULL
  - This applies in manager views regardless of team size
  - Cannot be disabled by any user role (including Admin in UI)
  - Admin can see de-anonymised data via dedicated admin endpoints only

Reporting line scope:
  - Manager role: can only query employees where manager's employee_id is in employee.hierarchy_path
  - Executive role: aggregates only — individual record access returns 403
  - Analyst role: own record only

C-suite protection:
  - is_executive = TRUE → only Admin role can access individual records
  - Excluded from all non-admin dashboards
```

**Database implementation**: All Tier 2 dashboard queries must use privacy views (`manager_team_view`, `executive_dashboard_view`), never raw `employees` table. Views enforce the above rules at database level.

**Audit requirement**: Every individual employee view, every CSV upload, every manual O*NET correction must be written to `audit_logs` with user_id, action, resource_id, timestamp, and dataset versions.

---

## 9. Data Refresh Schedule

| Source | Cadence | Action |
|--------|---------|--------|
| AEI snapshots | On each new HuggingFace release (~quarterly) | Append to `aei_task_snapshots`; recompute drift |
| O*NET | Annual (usually July) | Version bump; re-run matching + scoring for all employees |
| BLS OEWS | Annual (May release) | Update `oews_employment` table; recompute industry profiles |
| ABS/JSA Occupation Profiles | Annual | Update per engagement when loaded |
| ABS Census WPP (W12A/W13) | Per Census release (~5 years) | Re-run `ingest_abs_census_wpp.py` + `ingest_abs_census_w13.py`; 2026 Census expected |
| ANZSIC subdivisions | Per JSA Industry Data release (~annual) | Re-run `ingest_anzsic_subdivisions.py` from Table 3 of JSA Industry Data |
| OSCA backbone + correspondences | Per ABS OSCA release (new — no precedent yet) | Re-run `ingest_osca.py`, then `compute_osca_employment.py` (depends on `ingest_osca` + latest `abs_employment`) |
| ASC + DWA-ASC bridge + AU task layer | Per JSA ASC release (new — no precedent yet) | Re-run `ingest_asc.py`, then `build_dwa_asc_bridge.py` (re-embeds and re-matches — network required for the model on first run), then `compute_au_task_layer.py` (depends on the bridge + latest `osca_anzsco_map` + `eloundou_dwa_scores`) |
| GPTVal | Per model release | Append new model era rows; update velocity calculations |
| Microsoft "Working with AI" | Per paper release | Update on new dataset release; re-score occupations |
| Eloundou scores | Static (occupation-level loaded) | DWA-level derivation is a computation step, not a new data load |

Platform must expose the current version of each dataset in: API response headers, dashboard footers, and all audit log entries.

---

## 10. Schema Naming Conventions

```sql
-- Tables (snake_case, plural)
employees, onet_matches, aei_task_snapshots, onet_occupations,
exposure_scores, audit_logs, industry_crosswalk, gptval_benchmarks,
role_task_snapshots, industry_occupation_profiles

-- Views (descriptive role, singular intent)
manager_team_view, executive_dashboard_view

-- Key columns
onet_soc          -- TEXT, format "XX-XXXX.XX"
hierarchy_path    -- TEXT[], e.g. ['CEO', 'VP1', 'MGR1', 'IC1']
is_leaf_node      -- BOOLEAN
is_executive      -- BOOLEAN
exposure_e0/e1/e2 -- FLOAT, 0.0–1.0
beta_score        -- FLOAT, computed as E1 + 0.5*E2
automation_zone   -- TEXT, one of 'E0', 'E1', 'E2'
release_version   -- TEXT, e.g. '2025-02-10' for AEI, '28.1' for O*NET
model_era         -- TEXT, e.g. 'sonnet-3.7'
snapshot_date     -- DATE
```
