# Microsoft "Working with AI" — Data Context

This doc covers the Tomlinson et al. (2025) dataset, the platform's **current empirical baseline for AI applicability scoring**. Read this before implementing anything in FR-4 or FR-8 scoring pipelines.

## What This Dataset Is

Tomlinson et al. (2025) measured how Bing Copilot is actually being used for work activities by US workers from January to September 2024. Unlike Eloundou (theoretical: "could AI do this?"), this dataset measures empirical reality: "is AI being used for this, and does it work?"

Conversations were classified using an LLM pipeline mapping user goals and AI actions to O*NET 29.0 Intermediate Work Activities (IWAs).

**Citation**: Tomlinson, Jaffe, Wang, Counts, Suri (2025). *Working with AI: Measuring the Applicability of Generative AI to Occupations.* arXiv:2507.07935
**License**: CC-BY 4.0
**Source**: https://github.com/microsoft/working-with-ai

---

## What's Available

### Database tables (all loaded)

| Table | Rows | What it provides |
|-------|------|-----------------|
| `ms_ai_applicability_scores` | 785 | Composite AI applicability score per SOC occupation |
| `ms_ai_soc_metrics` | 785 | Detailed metrics per SOC: coverage, completion, feedback, impact, applicability |
| `ms_ai_iwa_metrics` | 332 | IWA-level metrics: share, completion, impact, feedback, composite scores |
| `ms_ai_soc_to_iwas` | 13,698 | Which IWAs are relevant to each SOC occupation |
| `ms_ai_physical_tasks` | 18,796 | Physical task flag per O*NET task ID (physical tasks excluded from AI scoring) |

### Key metrics

**SOC-level** (`ms_ai_soc_metrics`):
- `coverage_user` / `coverage_ai` — fraction of occupation's IWAs with Copilot usage
- `completion_user` / `completion_ai` — task success rate from user/AI perspective
- `feedback_positive_fraction_user/ai` — user satisfaction (thumbs-up ratio)
- `impact_scope_user` / `impact_scope_ai` — scope of influence (moderate or higher)
- `ai_applicability_score_user` — user-goal perspective composite
- `ai_applicability_score_ai_nonphysical` — AI-action perspective, excluding physical tasks
- `ai_applicability_score` (in applicability_scores table) — average of both perspectives

**IWA-level** (`ms_ai_iwa_metrics`):
- Same metrics as SOC but at the work activity level
- `completion_x_scope_x_coverage_user/ai` — composite: completion x scope x coverage

---

## Score Characteristics

- **Range**: 0.0 to ~0.49 (no occupation exceeds 50% applicability)
- **Mean**: ~0.16 across all 785 occupations
- **Top occupations**: Interpreters/Translators (0.49), Historians (0.46), Writers/Authors (0.45)
- **Bottom occupations**: Physical/manual roles score near 0.0

The relatively low ceiling (max 0.49) reflects empirical reality — even for the most AI-applicable occupations, less than half of work activities are successfully handled by current AI.

---

## Join Paths to O*NET

### SOC code mapping
Microsoft uses 6-digit SOC codes (`11-1011`). O*NET uses 8-digit codes (`11-1011.00`).

```sql
-- Join Microsoft scores to O*NET occupations
SELECT o.onet_soc, o.title, m.ai_applicability_score
FROM onet_occupations o
JOIN ms_ai_applicability_scores m
  ON o.onet_soc LIKE m.soc_code || '%'
```

Coverage: 785 Microsoft SOC codes map to 916 of 1,016 O*NET occupations (90%). The many-to-one is because O*NET has sub-specialties (e.g., `11-1011.00` and `11-1011.03` both match `11-1011`).

### IWA-to-DWA linkage
Microsoft IWA codes match O*NET DWA references via `iwa_id`:

```sql
-- Join Microsoft IWA metrics to O*NET DWAs
SELECT d.dwa_id, d.dwa_title, m.completion_ai, m.impact_scope_ai
FROM onet_dwa_references d
JOIN ms_ai_iwa_metrics m ON d.iwa_id = m.iwa_code
```

Coverage: 332/332 IWAs match — perfect linkage. Each IWA is a parent of multiple DWAs, so this provides activity-group-level scoring that can be distributed across child DWAs.

### Physical task flags
Task IDs match `onet_task_statements.task_id` directly:

```sql
-- Join physical flags to task statements
SELECT t.onet_soc, t.task, p.physical
FROM onet_task_statements t
JOIN ms_ai_physical_tasks p ON t.task_id = p.task_id
```

Coverage: 18,796 rows matches task statements exactly.

---

## Relationship to Other Data Sources

### vs Eloundou 2023 (PARKED)
| | Eloundou | Microsoft |
|--|---------|-----------|
| Measures | Theoretical: "could AI reduce time by 50%?" | Empirical: "is AI being used, does it work?" |
| Method | Expert + GPT-4 rubric scoring | Bing Copilot conversation analysis |
| Level | Occupation (published), DWA (unpublished) | SOC + IWA (both published) |
| Scale | E0/E1/E2 binary labels, Beta 0.0–1.0 | Continuous 0.0–0.49 |
| Calibration | GPT-3.5 (early 2023) | Bing Copilot (Jan–Sept 2024) |
| Status | **LOADED** — 923 occupation-level scores | **LOADED** — 785 SOC + 332 IWA scores |

The gap between theoretical exposure (Eloundou) and empirical applicability (Microsoft) is analytically significant — it reveals adoption gaps.

### vs AEI (Anthropic Economic Index)
Both are empirical usage datasets but from different AI platforms:
- **Microsoft**: Bing Copilot (consumer search-assistant context)
- **AEI**: Claude (conversation/API context, enterprise + consumer)

Together they provide cross-platform empirical coverage. Differences between them signal platform-specific usage patterns rather than universal AI applicability.

### Three-Tier Evidence Stack
1. **Eloundou 2024** — theoretical exposure baseline: "could AI do this?" (LOADED, occupation-level)
2. **Microsoft "Working with AI"** — empirical applicability: "is AI being used for this?" (LOADED)
3. **AEI** — empirical usage patterns from Claude: "how is Claude being used?" (pending ingestion)
4. **GPTVal** — longitudinal capability trajectory: "how fast is AI improving?" (pending ingestion)

---

## Sanity Checks After Ingestion

- Mean applicability across all SOC codes should be ~0.16
- Max score should be ~0.49 (Interpreters and Translators)
- Physical task count matches `onet_task_statements` count (18,796)
- All 332 IWA codes match `onet_dwa_references.iwa_id`
- SOC code prefix match covers >=900 O*NET occupations

---

## Version Registry

Registered in `dataset_versions` as:
- `dataset_name`: `microsoft_working_with_ai`
- `version_key`: `2025-07`
- Source URL: https://github.com/microsoft/working-with-ai

---

## Related Files
- `docs/ELOUNDOU_EXPOSURE.md` — Eloundou data contract (parked)
- `docs/domain-model.md` — Section 2a: Microsoft AI scoring details
- `docs/fr8-role-evolution.md` — Drift engine integration
- `CLAUDE.md` — Data sources quick reference
