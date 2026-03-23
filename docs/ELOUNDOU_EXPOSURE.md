# Eloundou Exposure Scores — Data Context

> **STATUS: OCCUPATION-LEVEL DATA LOADED.** 923 occupation scores with dual raters (GPT-4 + human) ingested from `occ_level.csv`. DWA-level scores are NOT in the published data — Strategy A (derive from occupation-level via task importance weighting) is the next computation step. Strategy B (LLM rubric) fills remaining gaps. See also `docs/MICROSOFT_AI_APPLICABILITY.md` for the complementary empirical baseline.

This doc covers the Eloundou et al. (2024) "GPTs are GPTs" dataset.
It is the **theoretical baseline for FR-4 AI exposure scoring**, complemented by Microsoft "Working with AI" (empirical) and AEI (empirical usage). The E0/E1/E2 framework and Beta formula originate from this research.

## What This Dataset Is

Eloundou et al. (2024) scored every O*NET task and DWA for LLM exposure using
a rubric applied by both human annotators and GPT-4. The exposure threshold is:
**would an LLM reduce time to complete this task by ≥50% at equivalent quality?**

Three measures are produced per occupation:
- **E1 (α)** — direct LLM exposure (ChatGPT/Claude alone)
- **E2 (β component)** — LLM-powered software exposure (requires complementary tools)
- **Beta = E1 + 0.5×E2** — preferred composite measure (used throughout this platform)

These map directly to the platform's E0/E1/E2 zones:
- E0 zone (0–39%): tasks with low beta — insulated from LLM impact
- E1 zone (40–84%): tasks with mid beta — augmented by LLMs
- E2 zone (85–100%): tasks with high beta — substantially automated

**Citation**: Eloundou, Manning, Mishkin, Rock (2024). *Science* 384:1306-1308.
https://arxiv.org/abs/2303.10130

---

## What's Publicly Available

### Pre-computed file (use this first)
```
File:   gptsRgpts_occ_lvl.csv
Level:  Occupation (SOC 2018, 6-digit)
Source: Paper's companion GitHub, mirrored at EIG-Research/AI-unemployment
        https://github.com/EIG-Research/AI-unemployment
Place:  /data/eloundou/gptsRgpts_occ_lvl.csv
```

This gives E1, E2, and beta scores per SOC occupation. It does **not** contain
per-DWA binary labels — those were used internally to produce the occ-level scores
but are not in the public release.

### What's not available
The raw per-DWA annotation labels (E0/E1/E2 per DWA) were not published.
For DWA-level scores, we either derive them (see Strategy A below) or re-score
them using the rubric (Strategy B).

---

## Getting to Usable Exposure Scores

Two strategies. Use both: A for the majority, B for gaps.

### Strategy A — Derive from pre-computed occ-level scores (~80% coverage)

Join the occupation-level beta scores to O*NET DWAs via the task crosswalk,
weighted by O*NET task importance. This is the standard approach in the literature.

**Files needed** (all from https://www.onetcenter.org/database.html, O*NET 28.0):
```
Task Statements.txt       — task_id, occ_soc_8, task_desc, importance
Tasks to DWAs.txt         — task_id → dwa_id mapping
DWA Reference.txt         — dwa_id, dwa_title
```

**Join path**:
```
gptsRgpts_occ_lvl.csv  (SOC 6-digit beta scores)
    JOIN Task Statements on occ_soc[:7]
    JOIN Tasks to DWAs on task_id
    JOIN DWA Reference on dwa_id
    → assign beta proportional to task importance weight
```

**Allocation formula**:
```python
# For each DWA under an occupation:
weight = task_importance / sum(all_task_importances_for_occ)
dwa_beta = occ_beta * weight
```

This distributes the occupation's aggregate exposure across its DWAs in proportion
to how important each task is to the role — higher-importance tasks carry more of
the exposure signal.

**Expected output**: ~85%+ of O*NET DWAs covered with a derived beta score.

### Strategy B — Re-score using Eloundou rubric (fills remaining ~20%)

For DWAs with no occupation match, re-run the original rubric via LLM.
This is what the Eisfeldt et al. (2023) paper and radoshi/gptsaregpts both did
independently, achieving ~0.72 correlation with the original Eloundou scores.

**Rubric prompt** (from Appendix A.1 of the paper):
```
Classify this task/DWA for LLM exposure.

Task: {task_description}
Occupation: {occupation_title}

Would access to an LLM (e.g. ChatGPT, Claude) or LLM-powered software
reduce the time required to complete this task by at least 50%, while
maintaining equivalent output quality?

- E0: No — LLM provides no meaningful time reduction
- E1: Yes — LLM alone achieves ≥50% time reduction
- E2: Yes — but only with complementary software/tools built on LLMs

Respond with ONLY: E0, E1, or E2
```

Use temperature=0.0. Budget ~500 calls/day (well within FR-4 LLM rate limit).

---

## Database Tables

```sql
-- Occupation-level scores (ingested directly from CSV)
CREATE TABLE eloundou_occ_scores (
    occ_soc_6        VARCHAR(10) NOT NULL,  -- SOC 2018, e.g. "15-1252"
    occ_title        VARCHAR(255),
    e1_human         NUMERIC(5,4),
    e1_gpt4          NUMERIC(5,4),
    e2_human         NUMERIC(5,4),
    e2_gpt4          NUMERIC(5,4),
    beta_human       NUMERIC(5,4),
    beta_gpt4        NUMERIC(5,4),          -- preferred: use this for scoring
    dataset_version  VARCHAR(30) NOT NULL,  -- "eloundou_2024_science"
    ingested_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (occ_soc_6, dataset_version)
);

-- DWA-level scores (derived via Strategy A, gaps filled via Strategy B)
CREATE TABLE eloundou_dwa_scores (
    occ_soc_6        VARCHAR(10) NOT NULL,
    dwa_id           VARCHAR(20) NOT NULL,
    dwa_title        VARCHAR(500),
    beta             NUMERIC(5,4) NOT NULL,  -- E1 + 0.5*E2
    e1               NUMERIC(5,4),
    e2               NUMERIC(5,4),
    source           VARCHAR(20) NOT NULL,   -- "derived" | "llm_rubric"
    importance_weight NUMERIC(5,4),          -- O*NET task importance weight used
    dataset_version  VARCHAR(30) NOT NULL,
    onet_version     VARCHAR(10) NOT NULL,   -- "28.0"
    PRIMARY KEY (occ_soc_6, dwa_id, dataset_version)
);
```

---

## FR-4 Lookup Contract

FR-4 scoring calls this function. Implement here, not in FR-4 directly:

```python
def get_dwa_exposure(occ_soc: str, dwa_id: str, db) -> dict:
    """
    Returns beta score for a DWA within an occupation.
    Source priority: derived occ scores → LLM rubric fallback.
    Raises if neither source produces a result.
    """
    score = db.query(EloundouDwaScore).filter_by(
        occ_soc_6=occ_soc[:7],
        dwa_id=dwa_id,
        dataset_version="eloundou_2024_science"
    ).first()

    if score:
        return {"beta": score.beta, "e1": score.e1, "e2": score.e2,
                "source": score.source}

    # Fallback: re-score via rubric (Strategy B)
    # Rate-limited — see security.md
    return score_via_rubric(occ_soc, dwa_id, db)
```

---

## SOC Version Note

The pre-computed CSV uses **SOC 2018**. O*NET 28.0 also uses SOC 2018.
No crosswalk needed for the primary pipeline.

If you later add complementary datasets (Eisfeldt 2023, Felten AIOE, Webb 2022),
those use SOC 2010 or older schemes — use the BLS crosswalk at
https://www.bls.gov/soc/2018/soc_2018_crosswalk.xlsx

---

## Audit Requirements (RA-6)

Every ingestion run must log:
```python
{
    "event": "eloundou_ingestion",
    "dataset_version": "eloundou_2024_science",
    "onet_version": "28.0",
    "occ_rows": <int>,
    "dwa_rows": <int>,
    "source_file": "gptsRgpts_occ_lvl.csv"
}
```

---

## Quick Sanity Checks After Ingestion

- Mean beta across all occupations should be ~0.40–0.55 (paper reports ~0.47)
- DWA coverage should be ≥85% of O*NET 28.0 DWAs
- No beta scores outside [0, 1]
- All FR-2 matched SOC codes should resolve to at least one DWA score

---

## Related Files
- `AGENTS.md` — FR-4 scoring spec (consumer of this data)
- `AGENTS.md` — FR-3 task retrieval spec (supplies dwa_id inputs)
- `security.md` — rate limiting for Strategy B LLM calls
- `/data/eloundou/gptsRgpts_occ_lvl.csv` — source file
- `/data/onet/28.0/` — O*NET database files
