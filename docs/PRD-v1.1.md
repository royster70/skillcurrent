# Workforce AI Impact Analysis Platform — PRD v1.1

**Version:** 1.1 (consolidated)
**Date:** 2026-03-21
**Status:** Current
**Changes from v1.0:** Two-tier architecture; FR-8 Role Evolution Intelligence (AEI, GPTVal, OEWS, industry crosswalk); updated data model (E0/E1/E2); updated build dependencies; longitudinal capability tracking.

---

## 1. Executive Summary

Organizations are investing heavily in AI but lack a clear, task-level view of how AI will change work across their workforce, by reporting line, role, and specific tasks. Internal role catalogs are messy and inconsistent, which prevents leadership from applying high-quality AI research (Anthropic, OpenAI, Pew, O*NET-based studies) to their own people decisions.

This platform addresses this in two layers. **Tier 1** delivers industry-level intelligence using entirely public data — requiring no client data whatsoever — enabling immediate value demonstration. **Tier 2** maps an organization's actual workforce to the Tier 1 intelligence, providing team-level specificity once the client is ready to share HRIS data.

The platform provides leaders with dashboards and exports showing where AI can automate, where it should augment, and where work remains fundamentally human — enabling targeted investment in tools, automation, and reskilling rather than generic productivity programs.

**Critical insight added in v1.1:** AI capability advancement follows a compounding, directional pattern — a rising waterline across task landscapes. The Eloundou 2023 academic baseline was computed against GPT-3.5 capabilities. Empirical AEI data and GPTVal longitudinal benchmarks now reveal the gap between that 2023 baseline and current reality, and allow the platform to track where the waterline is heading. This delta is the core consulting value proposition.

---

## 2. Problem Statement

### 2.1 Business Problem

- Organizations have thousands of unique job titles that do not align with standardized occupational taxonomies.
- Research from Anthropic, OpenAI, and Pew shows AI exposure at the level of standardized occupations and detailed work activities, not custom internal titles.
- The academic baseline (Eloundou 2023) was calibrated against GPT-3.5 in early 2023. Capabilities have advanced substantially — agentic tool use, computer use, multimodal reasoning, extended thinking — but no recalibration has been published.
- CFOs, CHROs, and business leaders cannot answer: "Which roles and tasks are most suitable for automation or augmentation?" or "Where should we focus tool investment vs reskilling?"

### 2.2 Current State

- Internal HRIS exports contain messy titles, inconsistent hierarchies, and limited task information.
- AI investments are justified using generic vendor claims rather than role- and task-level analysis grounded in work content.
- Existing analytics focus on digital behavior, not the intrinsic nature of work tasks.
- Every insight is gated behind HRIS data sharing — preventing fast client value demonstration.

### 2.3 Risks of Doing Nothing

- Misallocation of AI budgets to roles with low automation potential.
- Over- or under-estimating workforce impacts — poor planning, change resistance, reputational risk.
- Inability to leverage the growing body of O*NET-based AI research to guide internal strategy.
- Missing the strategic window: as AI capabilities advance, the waterline rises faster than most organisations are tracking.

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Provide immediate industry-level intelligence with zero client data (Tier 1).
- Map organization's roles to O*NET and score tasks for automation/augmentation potential (Tier 2).
- Track how AI capability growth is changing task exposure over time (longitudinal, using AEI + GPTVal).
- Support global industry framing via NAICS (US) and ANZSIC (AU/NZ) crosswalk.
- Highlight where to focus AI tool investment and reskilling investment.

### 3.2 Non-Goals (MVP)

- Real-time HRIS integration (batch CSV sufficient).
- Employee-level performance or behavioral analytics.
- Building a full workforce planning suite or HRIS replacement.
- Occupation classification crosswalk (O*NET SOC is used throughout; only the industry filter is localised for non-US clients).

---

## 4. Target Users and Key Decisions

### 4.1 CFO / Finance Leadership
- Prioritize AI/automation investment by function and role.
- Understand how much routine work exists in finance and adjacent functions.

### 4.2 CHRO / People & Culture
- Identify roles with high concentrations of automatable tasks; plan reskilling or role redesign.
- Communicate AI impacts using a task-based, evidence-driven narrative.

### 4.3 Business Unit / Function Leaders
- See, by reporting line, which tasks are candidates for automation or augmentation.
- Prioritize process changes and tool rollouts.

### 4.4 Strategy / Workforce Planning Teams (new in v1.1)
- Assess industry-level AI impact without requiring internal data disclosure.
- Track how the impact is changing across model generations.
- Identify "just below threshold" tasks that will flip zone in the next capability cycle.

---

## 5. Core Conceptual Model

### 5.1 O*NET as the Normalization Layer

O*NET's SOC taxonomy (~1,016 occupations) and content model (work activities, skills, context) is the common language of work throughout the platform. Internal roles map to O*NET-SOC codes; all research datasets align to this taxonomy.

### 5.2 Task and Autonomy Model

For each occupation (and mapped internal role):
- Work is broken into O*NET Detailed Work Activities (DWAs) — approximately 19,500 across all occupations.
- Each task is characterized by: repetitiveness, cognitive/physical/social demands, decision-making autonomy (1–5 scale), exception handling frequency, and physical proximity requirements.

### 5.3 AI Suitability Zones

Three zones using the E0/E1/E2 framework from Eloundou 2023:

| Zone | Label | Beta Score | Meaning |
|------|-------|-----------|---------|
| E2 | Automated (Green) | ≥ 0.85 | High automation potential |
| E1 | Augmented (Blue) | 0.40 – 0.84 | AI substantially reduces effort; human retains responsibility |
| E0 | Insulated (Orange) | < 0.40 | AI has limited effect; strategic, relational, or ethical complexity |

**Beta = E1 + 0.5 × E2** (Eloundou 2023 methodology — coefficient is fixed).

### 5.4 The Rising Waterline (v1.1)

AI capability advances directionally and compounds. Tasks sit at different "elevations" — routine tasks are low ground, judgment/relationship tasks are high ground. The waterline (AI capability threshold) rises with each model generation.

Three task trajectories:
- **Departing**: Rising automation ratio across AEI snapshots — these tasks are being submerged
- **Enduring**: Low AEI usage, high O*NET importance — reliably above the waterline
- **Emerging**: New task patterns appearing as AI reshapes workflows — need developing now

"Just below threshold" tasks (40–50% automation, positive velocity) are the highest-priority signal for workforce planning — they will likely flip zone in the next 1–2 capability cycles.

---

## 6. Two-Tier Product Architecture (v1.1)

### Tier 1 — Industry Intelligence (Public Data Only)

**Data required:** O*NET (public domain), AEI (CC-BY HuggingFace), Eloundou scores (published), BLS OEWS (public), GPTVal benchmarks, industry classification tables.
**Client data required:** None.
**Privacy controls required:** None (no PII).
**Time to first value:** Immediate on platform setup.

Delivers:
- Task drift analysis across AEI temporal snapshots (how automation ratios are changing)
- GPTVal-tracked waterline velocity (how fast exposure is rising per task cluster)
- Departing / enduring / emerging task classification per occupation
- Industry-weighted occupation profiles via NAICS (US) or ANZSIC (AU/NZ)
- "Three-tier evidence stack" per occupation: academic baseline (Eloundou) + empirical usage (AEI) + recalibrated assessment

### Tier 2 — Organisational Overlay (Requires HRIS)

**Data required:** Client HRIS CSV (employee_id, job_title, department, manager_id).
**Depends on:** Tier 1 scores and occupation profiles.
**Full privacy controls apply.**

Delivers:
- O*NET mapping of the client's actual job titles (3-layer cascade)
- Org hierarchy with reporting line scope
- Privacy-controlled dashboards: team-level exposure, FTE-hours by zone, top automation opportunities

**Architectural rule (non-negotiable):** Tier 1 pipelines and Tier 2 pipelines are completely separate. Tier 2 queries never bypass privacy controls. Tier 1 public endpoints never touch employee records.

---

## 7. Functional Requirements

### FR-1: Data Ingestion and Validation (Tier 2)

- **FR-1.1**: Accept single CSV containing: `employee_id`, `job_title`, `department`, `manager_id` (location optional).
- **FR-1.2**: Validate hierarchy integrity — every `manager_id` exists as an `employee_id` or is top-level.
- **FR-1.3**: Build org hierarchy using `WITH RECURSIVE` CTE; generate `hierarchy_path TEXT[]` per employee.
- **FR-1.4**: Calculate `is_leaf_node` (has no direct reports) and `depth` per employee.
- **FR-1.5**: Report orphaned or circular reporting relationships in a validation log (target: ≤1% orphans).

### FR-2: O*NET Role Matching (Tier 2)

3-layer matching cascade. **Stops at first match meeting confidence threshold — does not continue to find a "better" match.**

- **FR-2.1**: Layer 1 — Dictionary lookup against O*NET Sample Reported Titles (~37k titles). Fuzzy normalisation. Target: ~75% of volume. Threshold: ≥0.90.
- **FR-2.2**: Layer 2 — Sentence-transformer embeddings + pgvector cosine similarity. Include department context. Target: ~20% of volume. Threshold: ≥0.70.
- **FR-2.3**: Layer 3 — LLM fallback (claude-haiku). Rate-limited to <5% of volume. Any result <0.60 confidence goes to review queue.
- **FR-2.4**: Store per match: `onet_soc`, `confidence`, `matching_layer`, `method`, `onet_version`.
- **FR-2.5**: Low-confidence matches → review queue. Confirmed corrections persisted to `onet_match_corrections` table.
- **FR-2.6**: **One employee maps to exactly one O*NET SOC code.**

### FR-3: Task and Attribute Retrieval (Tier 2)

- **FR-3.1**: For each matched occupation, retrieve associated DWAs with importance and level ratings.
- **FR-3.2**: Create `role_task_inventory` linking each internal role to O*NET task identifiers, descriptions, and importance weightings.

### FR-4: AI Suitability and Exposure Scoring (Tier 2, uses Tier 1 scores)

- **FR-4.1**: Assign E0/E1/E2 exposure scores from Eloundou 2023 pre-computed dataset (~80% DWA coverage).
- **FR-4.2**: LLM rubric fallback for DWAs without pre-computed scores (~20%). Store source as `'llm_fallback'`.
- **FR-4.3**: Compute Beta = E1 + 0.5×E2 per DWA. Classify into E0/E1/E2 zones using configurable thresholds (defaults: E2 ≥ 0.85, E1 0.40–0.84, E0 < 0.40).
- **FR-4.4**: Assign autonomy level (1–5) per task from O*NET context descriptors.
- **FR-4.5**: **Invariant: E0 ≥ max(E1, E2) always.** Flag violations as data quality issues; do not silently fix.

### FR-5: Aggregation and Analytics (Tier 2)

- **FR-5.1**: Compute per internal role: zone distribution, autonomy distribution, FTE-hours per zone.
- **FR-5.2**: Aggregate by department, manager/reporting line, location.
- **FR-5.3**: Generate CSV outputs for BI tools (Power BI, Tableau).

### FR-6: Reporting and Visualisation (Tier 2)

- **FR-6.1**: Periodic table of job families view — tile per job family with automation indicator.
- **FR-6.2**: Role detail view — task list with zone badges, autonomy level, automation score per task.
- **FR-6.3**: Department/reporting line dashboards — heatmap of FTE-hours by autonomy × zone; ranked "top automation opportunities."
- **FR-6.4**: **All FR-6 queries MUST go through FR-7 privacy views. Direct queries to raw `employees` table are prohibited.**

### FR-7: Privacy Controls (Tier 2)

**Critical dependency: FR-7 cannot be implemented until FR-1.3/FR-1.4 (hierarchy_path) are complete.**

- **FR-7.1 (N≥5)**: All aggregates (department, team, occupation, zone) must contain ≥5 employees or be suppressed. No estimation or adjacent-group combining. Manager with <5 reports: show manager's own role only; suppress team aggregates with explanation.
- **FR-7.2 (Leaf node anonymisation)**: `is_leaf_node = TRUE` → display as "Team Member", employee_id "***", email NULL. Applied at database view level, not application layer. Cannot be disabled by any user role.
- **FR-7.3 (Reporting line scope)**: Manager role queries filtered to `hierarchy_path @> ARRAY[user.employee_id]`. Executive role: aggregates only. Analyst: own record only.
- **FR-7.4 (C-suite protection)**: `is_executive = TRUE` → Admin access only.
- **FR-7.5 (Privacy views)**: Create `manager_team_view` and `executive_dashboard_view` enforcing all above rules at database level. These views are created in a migration that runs after FR-1.3/FR-1.4 complete.
- **FR-7.6 (Audit logging)**: Every individual employee view, CSV upload, and manual O*NET correction written to `audit_logs` with: user_id, action, resource_id, timestamp, onet_version, aei_version.

### FR-8: Role Evolution Intelligence (Tier 1 — public data only)

#### FR-8.1: AEI Data Ingestion
- Ingest all available AEI snapshot CSV files from HuggingFace (4+ releases as of 2026).
- Store in `aei_task_snapshots` as append-only records — never update historical rows.
- Unique constraint: `(task_text, snapshot_date, platform)`.
- Compute on ingest: `automation_pct = directive_pct + feedback_loop_pct`, `augmentation_pct = task_iteration_pct + learning_pct + validation_pct`.
- Platform field: `'claude_ai'` (consumer), `'1p_api'` (enterprise, available Sept 2025+), `'global'`.
- Absence of AEI data for a DWA is a meaningful signal — store as explicit null, not zero.
- Support scheduled re-ingestion on new HuggingFace releases; new snapshots append without reprocessing existing data.

#### FR-8.2: Task Drift Calculation
- Compute per O*NET task across available AEI snapshots: velocity (linear regression slope of `automation_pct` over time), snapshot count, first/latest date, peak automation.
- Store results in `task_drift_metrics` table.
- Update drift metrics incrementally when new AEI snapshots are ingested.

#### FR-8.3: Task Classification
- Classify each O*NET task as: `departing` (high automation + positive velocity), `enduring` (low AEI usage + high O*NET importance + stable), `emerging` (new workflow patterns), `below_threshold` (40–50% automation + positive velocity — highest priority signal).
- "Below threshold" tasks must be prominently surfaced in dashboards, not buried.

#### FR-8.4: Industry Occupation Profiles
- Ingest BLS OEWS annual release to build `industry_occupation_profiles` — headcount by occupation × NAICS industry.
- Use OEWS headcount to weight occupation-level drift scores for a given industry sector.
- Pre-configure NAICS sector groupings for target industries (utilities, energy, finance, healthcare, etc.).
- For AU/NZ clients: load ABS/JSA employment data as alternative headcount source (see FR-8.9).

#### FR-8.5: Tier 1 Dashboard
- Sector selector: filter by NAICS industry code (or ANZSIC if AU crosswalk loaded).
- For selected sector: top departing occupations (by headcount × velocity), enduring task profiles, emerging task patterns.
- Waterline visualisation: tasks plotted by current Beta score and velocity.
- "Three-tier evidence stack" per occupation: Eloundou 2023 baseline → AEI empirical → recalibrated delta.
- "Just below threshold" tasks panel — highest-priority forward-looking signal.
- Data vintage footer: show version/date of O*NET, AEI, OEWS contributing to displayed metrics.
- Dashboard must load in <3 seconds.

#### FR-8.6: GPTVal Integration
- Ingest GPTVal capability benchmarks per model era (sonnet-3.5, 3.7, 4, 4.5...).
- Store in `gptval_benchmarks` by `(metric_name, model_era, measurement_date)` — immutable compound key.
- Never merge or average scores across model eras.

#### FR-8.7: Longitudinal Waterline Tracking
- Compute waterline velocity: rate of Beta score change per model era transition.
- Identify tasks approaching zone thresholds within next 1–2 model generations.
- Surface these as "next to flip" signals in Tier 1 dashboard and Tier 2 role cards.

#### FR-8.8: Data Refresh Pipeline
- Monitor → Ingest → Version → Recompute → Notify workflow for all Tier 1 data sources.
- AEI: append new snapshot on HuggingFace release, trigger drift recalculation.
- OEWS: annual refresh, recompute industry profiles.
- O*NET: annual version bump, triggers full Tier 2 re-matching and re-scoring.
- All refreshes logged to `data_refresh_log` with source, version, records affected, recomputation cascade triggered.
- MVP: manual admin trigger. Automated monitoring post-MVP.

#### FR-8.9: International Industry Crosswalk
- Maintain `industry_crosswalk` table mapping NAICS ↔ ANZSIC via ISIC Rev.4 (two-hop, official concordance tables).
- Fields: `source_system`, `source_code`, `target_system`, `target_code`, `bridge_system`, `bridge_code`, `match_type` (exact/partial/split/merge), `weight`, `curated_by`.
- MVP: US data only (NAICS + OEWS); crosswalk table exists but AU side is empty.
- Per engagement: populate AU side from ABS concordance tables and load JSA/ABS employment data.
- The drift engine and O*NET analysis are completely unchanged regardless of which industry classification is active. The crosswalk only affects: industry label display and headcount weighting source.

---

## 8. Technical Architecture

### 8.1 Components

- **Tier 1 Pipeline**: AEI ingest, drift calculation, GPTVal tracking, OEWS industry profiles, international crosswalk.
- **Data Ingestion Service (Tier 2)**: CSV parsing, validation, hierarchy build (WITH RECURSIVE CTE).
- **Matching Engine (Tier 2)**: 3-layer cascade — dictionary, embeddings (pgvector), LLM fallback.
- **O*NET Data Store**: Local versioned files from onetcenter.org (not the web API).
- **Scoring Engine**: Applies E0/E1/E2 from Eloundou + AEI context + GPTVal velocity.
- **Privacy Layer (Tier 2)**: Database views enforcing N≥5, leaf node anonymisation, RBAC.
- **Analytics & Export**: Aggregation, CSV/Power BI export, audit logging.
- **Visualisation**: React frontend, Tier 1 public dashboard + Tier 2 role-gated dashboards.

### 8.2 Build Dependency Chain

```
Tier 1 (no blockers — start immediately):
  FR-8.1 AEI Ingest → FR-8.2 Drift → FR-8.3 Classification
  FR-8.4 OEWS Profiles → FR-8.9 Crosswalk → FR-8.5 Tier 1 Dashboard
  FR-8.6 GPTVal → FR-8.7 Longitudinal Tracking
  FR-8.8 Refresh Pipeline (wraps all above)

Tier 2 (sequential):
  FR-1 (CSV + Hierarchy) ──→ FR-7 (Privacy) ──→ FR-6 (Dashboards)
       ↓
  FR-2 (Matching) → FR-3 (Tasks) → FR-4 (Scoring) → FR-5 (Analytics)
```

**Critical blockers:**
- FR-7 cannot start until FR-1.3/FR-1.4 (`hierarchy_path`, `is_leaf_node`) are complete.
- FR-6 must query exclusively through FR-7 privacy views.

### 8.3 Key Technologies

- **Backend**: Python 3.12, FastAPI, PostgreSQL 16 + pgvector, Alembic, SQLAlchemy
- **Embeddings**: sentence-transformers (`all-MiniLM-L6-v2`), stored in pgvector
- **LLM fallback**: claude-haiku (rate-limited); claude-sonnet for complex scoring tasks
- **Frontend**: TypeScript, React 18, Recharts/D3
- **Data sources**: O*NET files (tab-delimited), AEI CSVs from HuggingFace, BLS OEWS CSV, GPTVal benchmarks

### 8.4 Data Source Reference

| Source | Version | Refresh | What It Provides |
|--------|---------|---------|-----------------|
| O*NET | 28.1 | Annual (July) | 1,016 SOC codes, ~19,500 DWAs, 37k+ sample job titles |
| Eloundou 2023 | Static | None (recalibrated as consulting IP) | E0/E1/E2 pre-computed for ~80% of DWAs |
| AEI (Anthropic) | Multi-release | ~Quarterly (append) | Empirical task usage, automation/augmentation ratios, model-era breakdown |
| GPTVal | Per model release | Per Anthropic release | Longitudinal AI capability benchmarks |
| BLS OEWS | Annual (May) | Annual | US occupation × industry headcount |
| ABS / JSA | Annual | Per engagement | AU occupation × industry headcount |
| NAICS ↔ ANZSIC | Via ISIC Rev.4 | Static (official concordance) | Industry crosswalk for international clients |

---

## 9. Success Metrics

### Tier 1
- AEI drift computed for ≥3,000 O*NET tasks
- All available AEI releases ingested within 24 hours of platform setup
- Occupation drift profiles for all 1,016 O*NET-SOC codes
- Tier 1 dashboard loads in <3 seconds
- Sector filtering available for ≥10 industry sectors

### Tier 2
- ≥95% of internal job titles mapped automatically (≤5% to review queue)
- ≤1% orphaned employees in hierarchy build
- Hierarchy build for 10,000 employees completes in <5 seconds
- N≥5 enforcement: 100% of aggregate views
- Backend test coverage: ≥80%

### Business Outcomes
- Identification of top roles accounting for ≥60–70% of automatable FTE-hours in pilot org
- Executive users can name top 10 automation/augmentation opportunities and explain why, with task-level evidence
- "Three-tier evidence stack" demonstrable: Eloundou baseline → AEI empirical → recalibrated delta

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Low-quality HRIS data | Inaccurate mappings | Strong validation, review queues, corrections table |
| Misinterpretation as job elimination tool | Change resistance | Frame as task-level analysis; focus on redesign and investment |
| Eloundou scores outdated | Underestimates current exposure | AEI empirical data provides the "real world" update; recalibration is the consulting IP |
| AEI coverage gaps (~3,500 of 19,500 tasks) | Incomplete drift picture | Classify absence explicitly; combine with Eloundou floor |
| LLM cost/latency | Higher run costs | Embeddings + dictionary as first pass; LLM for <5% of cases only |
| O*NET annual updates | Data drift | Versioned O*NET store; version stored with every derived record |
| ANZSIC crosswalk accuracy | Incorrect industry filtering for AU clients | Official concordance tables with manual review; `curated_by` field tracks what was reviewed |

---

## 11. Roadmap

### Phase 0 — Platform Foundation (current)
- Project scaffold, Claude Code setup, MCP configuration
- O*NET data import, schema migration framework

### Phase 1 — Tier 1 Intelligence (no client data)
- FR-8.1–8.3: AEI ingest, drift calculation, task classification
- FR-8.4: OEWS industry profiles
- FR-8.5: Tier 1 dashboard (sector filter, waterline view, departing/enduring/emerging)
- FR-8.6–8.7: GPTVal integration, longitudinal tracking

### Phase 2 — Tier 2 Core (with client data)
- FR-1: CSV ingest, hierarchy build
- FR-2: 3-layer O*NET title matching
- FR-3–4: Task retrieval and exposure scoring
- FR-7: Privacy controls (depends on FR-1 completion)

### Phase 3 — Full Platform
- FR-5–6: Analytics aggregation and org dashboards (depends on FR-7)
- FR-8.8: Automated data refresh pipeline
- FR-8.9: International crosswalk (ANZSIC, AU employment data)
- Review queue UI, manual correction workflow

### Phase 4 — Advanced
- Scenario modelling ("what if we automate these tasks?")
- HRIS connector integrations
- Recalibrated exposure scoring (consulting IP layer)
- Broader international industry profiles

---

## 12. Responsible AI

- **Task-level framing**: All results framed as task and role-level automation potential, not individual performance or job elimination decisions.
- **Privacy by design**: N≥5 enforcement, leaf node anonymisation, and RBAC enforced at database level in Tier 2.
- **Transparency**: Dashboard footers display data vintage (O*NET version, AEI release, OEWS year).
- **Audit trail**: All Tier 2 data accesses and corrections logged with user, action, timestamp, and dataset versions.
- **Explainability**: Every score traceable to source DWA, Eloundou values, AEI usage data, and matching method.
