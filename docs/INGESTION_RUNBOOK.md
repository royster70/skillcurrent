# Ingestion Runbook

How to rebuild the Workforce AI Platform database from scratch. This covers environment setup, migrations, and all data ingestion scripts in the correct order.

---

## Prerequisites

- **Docker**: For running PostgreSQL with pgvector
- **Python 3.12**: With pip for dependency management
- **Python packages**: `cd src/backend && pip install -e ".[dev]"` (declared in `pyproject.toml` — there is no `requirements.txt`).
  - This pulls the **heavy processing deps** required for ingestion: `sentence-transformers` (→ PyTorch, hundreds of MB; needed by `embed_titles`, `build_anzsco_concordance`, and `build_dwa_asc_bridge`), `pyarrow` (parquet, needed by `ingest_gdpval`), `pyreadr` (R `.rda` files, needed by `ingest_asc`), plus `pandas`, `scipy`, `openpyxl`, `asyncpg`, `sqlalchemy`, `alembic`, `pgvector`, `pydantic-settings`. If any are missing after install, re-run the command.
- **Network access at ingest time**: `embed_titles` / `build_anzsco_concordance` / `build_dwa_asc_bridge` download the `all-MiniLM-L6-v2` model from HuggingFace on first run (cached to `~/.cache/huggingface`); `ingest_epoch_eci` downloads a CSV from epoch.ai (schema may drift — the loader guards optional columns).
- **Data files**: Downloaded to local directories (see per-dataset sections below). ASC v3.0 (section 4.14a) is acquired via the `runapp-aus/strayr` R package's `.rda` files rather than a direct CSV/Excel download — see `docs/data-sources.md` for acquisition notes.

---

## 1. Database Setup

### Start PostgreSQL with pgvector

```bash
docker run -d \
  --name workforce-ai-db \
  -e POSTGRES_USER=workforce_user \
  -e POSTGRES_PASSWORD=CHANGE_ME_TO_A_REAL_PASSWORD \
  -e POSTGRES_DB=workforce_ai \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

### Create .env file

Create `src/backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://workforce_user:CHANGE_ME_TO_A_REAL_PASSWORD@localhost:5432/workforce_ai
ONET_VERSION=28.1
ONET_DATA_PATH=C:\Users\royst\Projects\Data\ONet
```

Replace `CHANGE_ME_TO_A_REAL_PASSWORD` with actual credentials. Do not commit `.env` to source control.

---

## 2. Run Migrations

From `src/backend/`:

```bash
alembic upgrade head
```

This applies all migrations in order (currently 031), creating all tables documented in `docs/DATA_DICTIONARY.md`. Migration 031 adds `pipeline_run_id` to `transformation_log` (ADR-007 Phase 3, FR-8.8), chaining onto the FR-9 head (`030`).

> **Note (migrations 029/030):** `oews_employment.onet_soc` and
> `industry_occupation_profiles.onet_soc` hold a **6-digit BLS SOC** (e.g.
> `11-1011`), not the 8-digit O*NET-SOC (`11-1011.00`). Their original foreign
> keys to `onet_occupations` were dropped (migrations 029/030) because they can
> never match; the US profile compute prefix-joins O*NET (`onet_soc LIKE
> ow.onet_soc || '%'`), and Microsoft/AEI join at 6-digit exact. If a clean
> rebuild ever fails at `ingest_oews` with a FK violation, confirm migrations
> 029/030 are applied. Guarded by the OEWS-grain invariants in
> `tests/test_data_invariants.py`.

### Recommended: run the orchestrator instead of the manual steps below

`scripts/run_pipeline.py` (FR-8.8) executes every stage in this runbook in
dependency order, resolving source paths from `settings.data_root` (env
`DATA_ROOT`). The manual per-dataset commands below remain valid for running a
single stage or debugging.

```bash
python -m scripts.run_pipeline --stages all --dry-run   # preview the 27-stage plan
python -m scripts.run_pipeline --stages all             # full rebuild
```

---

## 3. Ingestion Order

**Required order:**
1. O*NET (must be first — other datasets have foreign keys to `onet_occupations`)
2. Eloundou, Microsoft AI, AEI labor market, AEI temporal, BLS OEWS (any order)
3. Eloundou DWA derivation (depends on O*NET + Eloundou data)
4. Drift computation (depends on AEI temporal data)
5. US Industry profiles computation (depends on OEWS + Eloundou + Microsoft AI + AEI + drift data)
6. Title embeddings (depends on O*NET sample + alternate titles being loaded)
7. GDPval ingestion (independent — no dependencies on other datasets)
   a. Ingest GDPval tasks + rubric items (section 4.11)
   b. Epoch ECI benchmarks — runtime download, no local file (section 4.11b)
   c. GDPval evaluation runner — requires Anthropic API key, ~$30-50 (section 4.11c)
8. AU data (optional, requires title embeddings for ANZSCO concordance):
   a. Industry crosswalk (NAICS↔ANZSIC mappings — no file dependencies)
   b. ABS employment ingestion (depends on ABS data file)
   c. ANZSCO→SOC concordance (depends on title embeddings + ABS structure files)
   d. AU industry profiles computation (depends on abs_employment + anzsco_soc_concordance + industry_crosswalk)
   e. Census WPP W12A (independent — ANZSIC division × ANZSCO major group Census 2021)
   f. Census WPP W13 (independent — ANZSCO sub-major group × Sex Census 2021)
   g. ANZSIC subdivisions (independent — 214 sub-sectors from JSA Industry Data Table 3)
   h. OSCA 2024 backbone (independent — depends only on the OSCA workbooks; also backfills a conservative `abs_employment.osca_code` for unique 6-digit matches)
   i. OSCA employment apportionment (depends on OSCA backbone (h) + ABS employment ingestion (b) — apportions all of `abs_employment` ANZSCO→OSCA, both granularities)
9. ASX company sectors (independent — downloads live from asx.com.au, no local file required; company_classifications table populated at API runtime via Haiku 4.5 with subdivision-enriched prompt)
10. FR-9.2 AU-native task layer (DWA pivot, ADR-011 — requires OSCA backbone (8h) for the ANZSCO→OSCA expansion; must run in this order):
    a. ASC v3.0 ingest (independent — depends only on the acquired `.rda` files)
    b. DWA↔ASC semantic bridge (depends on ASC ingest (a) + `onet_dwa_references` — embeds both sides, network required for the model on first run)
    c. AU task layer compute (depends on the bridge (b) + `eloundou_dwa_scores` + `osca_anzsco_map` from OSCA backbone (8h))
    d. US-vs-AU divergence (depends on the au task layer (c) + `onet_tasks_to_dwas` + `anzsco_soc_concordance`; writes `us_task_beta` + `divergence` onto `au_occupation_exposure`):
       `python -m scripts.compute_us_au_divergence`

---

## 4. Dataset Ingestion Details

All CLI commands run from `src/backend/`.

### 4.1 O*NET 28.1

**Source**: https://www.onetcenter.org/database.html (O*NET 28.1 Database download)

**Local path**: `C:\Users\royst\Projects\Data\ONet`

**Files** (9 tab-delimited .txt files):
- `Occupation Data.txt`
- `Task Statements.txt`
- `Task Ratings.txt`
- `DWA Reference.txt`
- `Tasks to DWAs.txt`
- `Work Activities.txt`
- `Sample of Reported Titles.txt`
- `Alternate Titles.txt`
- `Emerging Tasks.txt`

**Command**:
```bash
python -m scripts.ingest_onet --path "C:\Users\royst\Projects\Data\ONet" --version 28.1
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| onet_occupations | 1,016 |
| onet_task_statements | 18,796 |
| onet_task_ratings | 161,559 |
| onet_work_activities | 73,308 |
| onet_dwa_references | 2,087 |
| onet_tasks_to_dwas | 23,850 |
| onet_sample_titles | 7,953 |
| onet_alternate_titles | 57,543 |
| onet_emerging_tasks | 328 |
| **TOTAL** | **346,440** |

**Verification**:
```sql
SELECT 'onet_occupations' AS tbl, COUNT(*) FROM onet_occupations
UNION ALL SELECT 'onet_task_statements', COUNT(*) FROM onet_task_statements
UNION ALL SELECT 'onet_task_ratings', COUNT(*) FROM onet_task_ratings
UNION ALL SELECT 'onet_work_activities', COUNT(*) FROM onet_work_activities
UNION ALL SELECT 'onet_dwa_references', COUNT(*) FROM onet_dwa_references
UNION ALL SELECT 'onet_tasks_to_dwas', COUNT(*) FROM onet_tasks_to_dwas
UNION ALL SELECT 'onet_sample_titles', COUNT(*) FROM onet_sample_titles
UNION ALL SELECT 'onet_alternate_titles', COUNT(*) FROM onet_alternate_titles
UNION ALL SELECT 'onet_emerging_tasks', COUNT(*) FROM onet_emerging_tasks;
```

### 4.2 Eloundou Occupation Scores

**Source**: OpenAI supplementary data, mirrored at https://github.com/EIG-Research/AI-unemployment

**Local path**: `C:\Users\royst\Projects\Data\OpenAI-Exposure-Score`

**Files**: `occ_level.csv`

**Command**:
```bash
python -m scripts.ingest_eloundou --path "C:\Users\royst\Projects\Data\OpenAI-Exposure-Score"
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| eloundou_occ_scores | 923 |

**Verification**:
```sql
SELECT COUNT(*) FROM eloundou_occ_scores;
-- Should be 923
SELECT AVG(dv_beta_derived) FROM eloundou_occ_scores;
-- Should be approximately 0.47
```

### 4.3 Microsoft "Working with AI"

**Source**: https://github.com/microsoft/working-with-ai (CC-BY 4.0)

**Local path**: `C:\Users\royst\Projects\Data\microsoft-working-with-ai`

**Files** (6 CSV files):
- SOC-level applicability scores
- SOC-level detailed metrics
- IWA-level metrics
- SOC-to-IWA mappings
- Physical task classifications
- Task-level data

**Command**:
```bash
python -m scripts.ingest_microsoft_ai --path "C:\Users\royst\Projects\Data\microsoft-working-with-ai"
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| ms_ai_applicability_scores | 785 |
| ms_ai_soc_metrics | 785 |
| ms_ai_iwa_metrics | 332 |
| ms_ai_soc_to_iwas | 13,698 |
| ms_ai_physical_tasks | 18,796 |
| **TOTAL** | **34,396** |

**Verification**:
```sql
SELECT 'ms_ai_applicability_scores' AS tbl, COUNT(*) FROM ms_ai_applicability_scores
UNION ALL SELECT 'ms_ai_soc_metrics', COUNT(*) FROM ms_ai_soc_metrics
UNION ALL SELECT 'ms_ai_iwa_metrics', COUNT(*) FROM ms_ai_iwa_metrics
UNION ALL SELECT 'ms_ai_soc_to_iwas', COUNT(*) FROM ms_ai_soc_to_iwas
UNION ALL SELECT 'ms_ai_physical_tasks', COUNT(*) FROM ms_ai_physical_tasks;
```

### 4.4 AEI Labor Market

**Source**: https://huggingface.co/datasets/Anthropic/EconomicIndex (CC-BY)

**Local path**: `C:\Users\royst\Projects\Data\AEI`

**Files**: `job_exposure.csv`, `task_penetration.csv`

**Command**:
```bash
python -m scripts.ingest_aei --path "C:\Users\royst\Projects\Data\AEI"
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| aei_job_exposure | 756 |
| aei_task_penetration | 17,998 |
| **TOTAL** | **18,754** |

**Verification**:
```sql
SELECT 'aei_job_exposure' AS tbl, COUNT(*) FROM aei_job_exposure
UNION ALL SELECT 'aei_task_penetration', COUNT(*) FROM aei_task_penetration;
```

### 4.5 AEI Temporal Releases

**Source**: https://huggingface.co/datasets/Anthropic/EconomicIndex (CC-BY), all releases

**Local path**: `C:\Users\royst\Projects\Data\AEI\AEI-full`

**Structure**: 4 release directories within AEI-full, each containing task-level CSV files with snapshot dates and model era metadata.

**Command**:
```bash
python -m scripts.ingest_aei_temporal --path "C:\Users\royst\Projects\Data\AEI\AEI-full"
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| aei_task_snapshots | 16,976 |

(6 snapshots across 4 model eras)

**Verification**:
```sql
SELECT release_version, model_era, COUNT(*) FROM aei_task_snapshots
GROUP BY release_version, model_era ORDER BY release_version;
-- Should show 6 snapshot groups totaling 16,976
```

### 4.6 BLS OEWS Employment

**Source**: https://www.bls.gov/oes/current/oes_dl.htm (May 2024 release)

**Local path**: `C:\Users\royst\Projects\Data\BLS\oesm24in4`

**Files**: `natsector_M2024_dl.xlsx`

**Command**:
```bash
python -m scripts.ingest_oews --path "C:\Users\royst\Projects\Data\BLS\oesm24in4"
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| oews_employment | 8,573 |

**Verification**:
```sql
SELECT COUNT(*) FROM oews_employment;
-- Should be 8,573
SELECT COUNT(DISTINCT onet_soc) FROM oews_employment;
-- Number of unique SOC codes
```

### 4.7 Eloundou DWA Derivation (MUST BE LAST)

**Source**: Derived from already-loaded data (no external files). Uses `eloundou_occ_scores`, `onet_tasks_to_dwas`, `onet_task_ratings`, and `onet_dwa_references`.

**Command**:
```bash
python -m scripts.derive_eloundou_dwas
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| eloundou_dwa_scores | 17,537 |

**Verification**:
```sql
SELECT COUNT(*) FROM eloundou_dwa_scores;
-- Should be 17,537
SELECT COUNT(DISTINCT onet_soc) FROM eloundou_dwa_scores;
-- Number of occupations with DWA-level scores
SELECT AVG(importance_weight) FROM eloundou_dwa_scores;
-- Should be a small fraction (weights sum to 1.0 per occupation)
```

### 4.8 Drift Computation (FR-8.2/8.3)

**Source**: Derived from already-loaded data (no external files). Uses `aei_task_snapshots` temporal data.

**Command**:
```bash
python -m scripts.compute_drift
python -m scripts.compute_drift --platform 1p_api  # optional: specific platform
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| task_drift_metrics | 4,605 |

**Verification**:
```bash
python -m scripts.verify_drift
```
```sql
SELECT classification, COUNT(*) FROM task_drift_metrics GROUP BY classification ORDER BY classification;
-- departing: 558, enduring: 2,971, below_threshold: 4, unclassified (NULL): 1,072
```

### 4.9 Industry Profiles Computation (FR-8.4)

**Source**: Derived from already-loaded data (no external files). Uses `oews_employment`, `eloundou_occ_scores`, `ms_ai_applicability_scores`, `aei_job_exposure`, and `task_drift_metrics`.

**Command**:
```bash
python -m scripts.compute_industry_profiles                 # US, year 2024 (default)
python -m scripts.compute_industry_profiles --year 2024     # optional: specific release year
python -m scripts.compute_industry_profiles --region AU --year 2025  # AU profiles (see 4.12d)
```

**Expected row counts (US only)**:

| Table | Rows |
|-------|------|
| industry_occupation_profiles (US) | 7,935 |

(20 NAICS sectors, ~153M total workers. After AU profiles are added the table total is 9,019 — see section 4.12d.)

**Verification**:
```sql
SELECT COUNT(*) FROM industry_occupation_profiles;
-- Should be 7,935
SELECT COUNT(DISTINCT naics_code) FROM industry_occupation_profiles;
-- Should be 20
SELECT COUNT(*) FROM industry_occupation_profiles WHERE eloundou_beta IS NOT NULL;
-- Majority should have multi-source scoring populated
```

### 4.11 GDPval Benchmark (FR-8.7 Waterline Tracking)

**Source**: https://huggingface.co/datasets/openai/gdpval (MIT license)

**Local path**: `C:\Users\royst\Projects\Data\GDPval`

**Files**: `data/train-00000-of-00001.parquet`

**Command**:
```bash
python -m scripts.ingest_gdpval --path "C:\Users\royst\Projects\Data\GDPval"
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| gdpval_tasks | 220 |
| gdpval_rubric_items | 10,453 |
| gdpval_evaluations | 0 (future model-era scores) |

220 tasks, 44 occupations, 9 NAICS sectors. SOC codes mapped via exact O*NET title match (43/44 exact + 1 contextual). Registered in `dataset_versions` under name "gdpval".

Once ingested, GDPval data is served immediately by two API endpoints with no additional computation step required:
- `GET /api/v1/gdpval/summary` — portfolio overview (task counts, rubric items, sector list, per-occupation counts)
- `GET /api/v1/gdpval/occupations/{soc_code}` — full task + rubric detail for one occupation

The `GET /api/v1/occupations/{soc}` endpoint also returns `gdpval_task_count` and `gdpval_available` fields derived from a live COUNT subquery. Future model evaluation scores are written to `gdpval_evaluations` by a separate model-era scoring pipeline — see section 4.11c.

**Verification**:
```sql
SELECT COUNT(*) FROM gdpval_tasks;
-- Should be 220
SELECT COUNT(*) FROM gdpval_rubric_items;
-- Should be 10,453
SELECT occupation_title, onet_soc FROM gdpval_tasks GROUP BY occupation_title, onet_soc ORDER BY occupation_title;
-- Should show 44 distinct occupations, all with non-NULL onet_soc
```

### 4.11b Epoch ECI Benchmarks (FR-8.7 P0a — GPTVal Waterline)

Source: Epoch AI ECI benchmark data (CC-BY license, runtime HTTPS download from epoch.ai — no local file required).

```bash
cd src/backend
python -m scripts.ingest_epoch_eci
```

Target table: `gptval_benchmarks` — 408 rows (39 benchmarks × 32 model eras, covering Claude 2 through Claude 4.6 + GPT/Gemini/Llama families).

This is P0a of FR-8.7 (GPTVal Waterline). It enables the `GET /api/v1/gdpval/waterline` velocity endpoint. P0b (evaluation runner) is a separate step — see section 4.11c.

Pipeline stage: `epoch_eci` in `run_pipeline.py` DAG.

**Verification**:
```sql
SELECT count(*) FROM gptval_benchmarks;  -- expect 408
SELECT benchmark_name, count(*) FROM gptval_benchmarks GROUP BY benchmark_name ORDER BY count(*) DESC LIMIT 5;
```

### 4.11c GDPval Evaluation Runner (FR-8.7 P0b)

Requires: GDPval ingest (section 4.11) complete + Anthropic API credentials in `src/backend/.env`.

```bash
cd src/backend

# Cost estimate first:
python -m scripts.compute_gdpval_waterline --estimate

# Run all 4 eras (~$30-50):
python -m scripts.compute_gdpval_waterline

# Run specific eras:
python -m scripts.compute_gdpval_waterline --eras claude-4-sonnet claude-4.5-sonnet
```

Model eras: claude-4-sonnet, claude-4-opus, claude-4.5-sonnet, claude-4.5-opus. Judge model: claude-haiku-4-5.

Resume-safe: `ON CONFLICT DO NOTHING` — safe to re-run any era.

Expected rows in `gdpval_evaluations`: 880 (220 tasks × 4 eras) when complete.

**Verification**:
```sql
SELECT model_era, count(*), avg(completion_pct) FROM gdpval_evaluations GROUP BY model_era ORDER BY model_era;
```

See ADR-006 for the P0a/P0b acquisition pattern distinction.

### 4.12 Australian Data Integration (FR-8.9)

The AU data pipeline has three stages that must run in order. Title embeddings (step 4.10) must be loaded before stage c.

#### 4.12a Industry Crosswalk (NAICS ↔ ANZSIC)

**Source**: Hardcoded concordance derived from Statistics Canada NAICS↔ISIC concordance, UN Statistics Division ANZSIC↔ISIC comparison, and ABS ANZSIC 2006 Rev.2 classification structure. No external file download required.

**Command**:
```bash
python -m scripts.ingest_crosswalk
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| industry_crosswalk | 21 |

21 mappings covering all 20 NAICS sectors to 19 ANZSIC divisions (NAICS 51 Information splits into ANZSIC J + S, hence 21 rows). Match types: `exact` (1:1 conceptual match) or `partial` (overlapping scope with fractional weight).

**Verification**:
```sql
SELECT COUNT(*) FROM industry_crosswalk;
-- Should be 21
SELECT source_code, target_code, match_type, weight FROM industry_crosswalk ORDER BY source_code;
-- All 20 NAICS sectors represented, weights sum correctly within each NAICS sector
```

#### 4.12b ABS Employment Ingestion

**Source**: https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles

**Local path**: `C:\Users\royst\Projects\Data\ABS`

**Files**: `Occupation profiles data - November 2025 (Revised).xlsx`

Employment is distributed across top 3 ANZSIC industries per ANZSCO occupation using rank-weighted splits (50%/30%/20%). Release year is set to 2025.

**Command**:
```bash
python -m scripts.ingest_abs
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| abs_employment | 2,743 |

**Verification**:
```sql
SELECT COUNT(*) FROM abs_employment;
-- Should be 2,743
SELECT anzsic_code, anzsic_title, COUNT(*) AS occupations, SUM(employment) AS total_emp
FROM abs_employment WHERE release_year = 2025
GROUP BY anzsic_code, anzsic_title ORDER BY total_emp DESC;
-- Shows 19 ANZSIC divisions with occupation counts and employment totals
```

#### 4.12c ANZSCO → SOC Concordance

**Source**: Derived from ABS ANZSCO 2022 structure + title index Excel files (no separate download — uses the same data directory as ABS employment). Requires `onet_title_embeddings` to be loaded first.

**Local path**: `C:\Users\royst\Projects\Data\ANZSCO`

**Files**:
- `anzsco 2022 structure 062023.xlsx`
- `anzsco 2022 index of principal titles, alternative titles and specialisations 062023.xlsx`

The script embeds all ANZSCO title variants (principal + alternative + specialisations) using all-MiniLM-L6-v2 and finds the best O*NET SOC match per 4-digit unit group via pgvector cosine similarity. Confidence ≥0.85 is auto-accepted; 0.70–0.85 is flagged for review.

**Command**:
```bash
python -m scripts.build_anzsco_concordance
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| anzsco_soc_concordance | 491 |

**Verification**:
```sql
SELECT COUNT(*) FROM anzsco_soc_concordance;
-- Should be 491
SELECT COUNT(*) FROM anzsco_soc_concordance WHERE reviewed = true;
-- Auto-accepted rows (confidence >= 0.85)
SELECT COUNT(*) FROM anzsco_soc_concordance WHERE confidence < 0.70;
-- Low-confidence matches requiring manual review
```

#### 4.12d AU Industry Profiles Computation

**Source**: Derived from abs_employment, anzsco_soc_concordance, and industry_crosswalk (all loaded in prior steps). ANZSIC codes are stored in the `naics_code` column of `industry_occupation_profiles` for AU rows (pragmatic column reuse — discriminated by `region='AU'`).

**Command**:
```bash
python -m scripts.compute_industry_profiles --region AU --year 2025
```

**Expected row counts**:

| Table | Additional Rows |
|-------|----------------|
| industry_occupation_profiles (AU) | 1,084 |

After this step the table total is 9,019 (7,935 US + 1,084 AU).

**Verification**:
```sql
SELECT region, COUNT(*) FROM industry_occupation_profiles GROUP BY region;
-- US: 7935, AU: 1084
SELECT COUNT(DISTINCT naics_code) FROM industry_occupation_profiles WHERE region = 'AU';
-- Should reflect populated ANZSIC divisions
SELECT COUNT(*) FROM industry_occupation_profiles WHERE region = 'AU' AND eloundou_beta IS NOT NULL;
-- Most AU profiles should have exposure scores via the concordance join
```

**MS/AEI coverage check (must be >90% — not just row count):**
```sql
SELECT
    COUNT(*) AS total_au_profiles,
    COUNT(ms_ai_applicability) AS ms_coverage,
    COUNT(aei_exposure) AS aei_coverage,
    ROUND(COUNT(ms_ai_applicability)::numeric / COUNT(*) * 100, 1) AS ms_pct,
    ROUND(COUNT(aei_exposure)::numeric / COUNT(*) * 100, 1) AS aei_pct
FROM industry_occupation_profiles
WHERE region = 'AU';
-- Expected: ms_pct ~92%, aei_pct ~91%
-- If either is 0%: the server was not restarted after the fix, or the SUBSTRING join
-- is not in place. See ADR-004 Decision 7 for the SOC format mismatch background.
```

**Note on SOC code formats**: AU profiles join via `SUBSTRING(onet_soc FROM 1 FOR 7)` prefix match because `anzsco_soc_concordance` stores 8-digit SOC codes (e.g. `29-1141.00`) while Microsoft and AEI tables use 6-digit codes (e.g. `29-1141`). US profiles use exact equality because all US source tables share the 6-digit format. If MS/AEI coverage reads 0% after running this step, confirm that the latest version of `compute_industry_profiles.py` is loaded — on Windows, uvicorn `--reload` may not detect file changes; restart the server manually if needed.

#### 4.12e ABS Census WPP — W12A Industry × Occupation (FR-8.9)

**Source**: `2021Census_W12A_AUS_POW_AUS.csv` from ABS 2021 Census Working Population Profiles (CC-BY 4.0). Wide-format CSV, 1 header + 1 AUS data row, melted to long format.

```bash
python -m scripts.ingest_abs_census_wpp
python -m scripts.ingest_abs_census_wpp --dry-run  # parse without DB writes
```

Target table: `abs_census_wpp` — 180 rows (20 ANZSIC divisions × 9 ANZSCO major groups including "not stated"). Provides Census headcount cross-tabulation used for occupation mix endpoint and sector enrichment.

Verify:
```sql
SELECT count(*) FROM abs_census_wpp;  -- expect 180
SELECT anzsic_division_name, SUM(employed_count) FROM abs_census_wpp
  WHERE anzsco_major_group IS NOT NULL GROUP BY anzsic_division_name ORDER BY 2 DESC LIMIT 5;
```

#### 4.12f ABS Census WPP — W13 Occupation × Sex (FR-8.9)

**Source**: `2021Census_W13_AUS_POW_AUS.csv`. ANZSCO sub-major groups (~51 categories) × Sex (M/F/P), national level.

```bash
python -m scripts.ingest_abs_census_w13
python -m scripts.ingest_abs_census_w13 --dry-run
```

Target table: `abs_census_w13` — 159 rows. Gender breakdown per occupation category for diversity analytics.

Verify:
```sql
SELECT sex, count(*), sum(employed_count) FROM abs_census_w13 GROUP BY sex ORDER BY sex;
-- M: 53 rows, F: 53 rows, P: 53 rows; P total ~12M
```

#### 4.12g ANZSIC Subdivisions (FR-8.9)

**Source**: `industry_data_-_november_2025_revised.xlsx` Table 3 — Employment by sector. Same Excel file used for abs_employment (Table 1/5).

```bash
python -m scripts.ingest_anzsic_subdivisions
python -m scripts.ingest_anzsic_subdivisions --dry-run
```

Target table: `anzsic_subdivisions` — 214 rows (214 sub-sectors across 19 ANZSIC divisions with JSA 2025 employment headcounts). Injected into AU company classify prompt to give Haiku sub-sector context for multi-sector classification.

Verify:
```sql
SELECT count(*) FROM anzsic_subdivisions;  -- expect 214
SELECT anzsic_division_code, count(*) FROM anzsic_subdivisions GROUP BY 1 ORDER BY 1;
-- 19 divisions, Manufacturing (C) has the most subdivisions (55)
```

#### 4.12h OSCA 2024 Backbone (FR-9.1)

**Source**: ABS Occupation Standard Classification for Australia (OSCA) 2024 v1.0, released 6 Dec 2024 (CC BY 4.0). Establishes OSCA as the canonical AU occupation entity, replacing the retired ANZSCO (kept as a legacy dual key). See ADR-010 (`ai_working/decisions/ADR-010-anzsco-osca-employment-apportionment.md`) for the design.

**Local path**: `C:\Users\royst\Projects\Data\OSCA`

**Files**: `OSCA structure.xlsx`, `OSCA Category Descriptions.xlsx`, `OSCA correspondence tables v2.xlsx` (the fourth acquired file, the index-of-titles workbook, is not read by this script)

**Command**:
```bash
python -m scripts.ingest_osca
python -m scripts.ingest_osca --path "C:\Users\royst\Projects\Data\OSCA" --version 2024.1.0
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| osca_occupations | 1,156 |
| osca_main_tasks | 6,887 |
| osca_anzsco_map | 1,383 |
| osca_isco_map | 1,448 |

The script also backfills `abs_employment.osca_code` for 6-digit ANZSCO codes with a single unambiguous OSCA mapping — 1,501 of 2,743 rows. This is a conservative dual-key link only; it does not apportion the 4-digit or ambiguous rows (see 4.12i for the full apportionment).

**Verification**:
```sql
SELECT 'osca_occupations' AS tbl, COUNT(*) FROM osca_occupations
UNION ALL SELECT 'osca_main_tasks', COUNT(*) FROM osca_main_tasks
UNION ALL SELECT 'osca_anzsco_map', COUNT(*) FROM osca_anzsco_map
UNION ALL SELECT 'osca_isco_map', COUNT(*) FROM osca_isco_map;
SELECT COUNT(*) FROM abs_employment WHERE osca_code IS NOT NULL;
-- Should be 1,501
SELECT COUNT(*) FROM osca_main_tasks WHERE descriptor_only = true;
-- Should equal total row count — every row is descriptor_only, never an exposure carrier
```

#### 4.12i OSCA Employment Apportionment (FR-9.1, ADR-010)

**Source**: Derived from already-loaded data (no external files). Uses `abs_employment` and `osca_anzsco_map`. **Requires 4.12h (OSCA backbone) and 4.12b (ABS employment) to have run first.**

Apportions AU employment ANZSCO→OSCA per the ADR-010 ladder: A0 double-count guard (prefer 6-digit ANZSCO detail over 4-digit unit-group aggregates), A1 exact link (`link_method='full'`), A3 equal split (`link_method='apportioned_equal'`) where a source row splits across multiple OSCA targets with no finer employment to weight by. A2 (employment-weighted apportionment) is documented in ADR-010 but not yet implemented.

**Command**:
```bash
python -m scripts.compute_osca_employment
python -m scripts.compute_osca_employment --version 2024.1.0
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| abs_employment_osca | 2,997 |

**Verification**:
```sql
SELECT COUNT(*) FROM abs_employment_osca;
-- Should be 2,997
SELECT link_method, COUNT(*), ROUND(AVG(confidence)::numeric, 3), ROUND(SUM(apportioned_employment)::numeric)
FROM abs_employment_osca GROUP BY link_method;
-- full: 1,702 rows, confidence 1.000, ~5,839,240 employment (~61%)
-- apportioned_equal: 1,295 rows, avg confidence 0.485, ~3,772,926 employment (~39%)

-- Reconciliation invariant: must match exactly
SELECT ROUND(SUM(apportioned_employment)::numeric) FROM abs_employment_osca;
-- Should equal the de-duplicated ANZSCO base: 9,612,166
```

#### 4.12j Census Subdivision × Occupation (FR-8.9)

**Source**: ABS Census 2021 TableBuilder INDP × OCCP exports (CC-BY 4.0). Two
granularities coexist in `abs_census_subdivision_occ`, discriminated by
`indp_level` (migrations 021/022):

- **Level 2** (2-digit INDP pivot, all 19 divisions → 838 rows):
  `IndustyxOccupationxEmployment-table_2026-03-29_13-17-55.csv`
- **Level 3** (3-digit INDP long format, C/D/G/K divisions):
  `L3_CDGK_Industry_cat.csv`

Both live under `DATA_ROOT\ABS-2021-Census`. The pipeline runs this stage twice
(level 2 then level 3); manually:

```bash
python -m scripts.ingest_census_subdivision_occ "<DATA_ROOT>\ABS-2021-Census\IndustyxOccupationxEmployment-table_2026-03-29_13-17-55.csv" --level 2
python -m scripts.ingest_census_subdivision_occ "<DATA_ROOT>\ABS-2021-Census\L3_CDGK_Industry_cat.csv" --level 3
```

Verify:
```sql
SELECT indp_level, count(*) FROM abs_census_subdivision_occ GROUP BY 1 ORDER BY 1;
-- level 2: 838 rows (subdivision); level 3: C/D/G/K group rows
```

### 4.13 ASX Company Sectors (FR-8.5 Company Lookup)

**Source**: https://www.asx.com.au/asx/research/ASXListedCompanies.csv — free public CSV, no API key required, updated regularly by ASX.

**No local file required** — the script downloads the CSV directly at runtime.

**Prerequisites**: No Alembic migration required. The `ingest_asx_companies.py` script creates the `asx_company_sectors` and `company_classifications` tables directly using `CREATE TABLE IF NOT EXISTS`. The script does not depend on any other dataset.

**Command**:
```bash
python -m scripts.ingest_asx_companies
```

The script:
1. Downloads the ASX listed companies CSV from the public URL
2. Maps each company's GICS industry group to ANZSIC division(s) and NAICS sector(s) via hardcoded concordance tables
3. Upserts rows into `asx_company_sectors` (keyed on `asx_code`)

**Expected row counts**:

| Table | Rows |
|-------|------|
| asx_company_sectors | ~1,978 |
| company_classifications | 0 (populated at runtime by POST /api/v1/companies/classify) |

Row count may drift slightly as ASX adds or removes listed companies over time. The ~1,978 figure reflects the March 2026 download.

**Verification**:
```sql
SELECT COUNT(*) FROM asx_company_sectors;
-- Expect ~1,978

SELECT gics_group, COUNT(*) AS companies
FROM asx_company_sectors
GROUP BY gics_group
ORDER BY companies DESC
LIMIT 10;
-- Shows top industry groups (Energy, Materials, etc.)

SELECT COUNT(*) FROM company_classifications;
-- 0 at ingestion time; rows accumulate as users classify companies via the API
```

**LLM classify endpoint**: `POST /api/v1/companies/classify` uses `claude-haiku-4-5-20251001` (upgraded from claude-3-haiku on 2026-03-28) to classify any company name not found in the ASX list. The prompt is enriched with the top 6 ANZSIC subdivisions per division (from `anzsic_subdivisions`) so the model has sub-sector resolution for diversified companies. JSON fence stripping is applied to handle Haiku 4.5's markdown-wrapped responses. It requires `ANTHROPIC_API_KEY` to be set in the environment. If the key is absent the endpoint returns HTTP 503. Results are cached in `company_classifications` to avoid redundant API calls.

### 4.14 AU-Native Task Layer — the DWA Pivot (FR-9.2, ADR-011)

Three steps that **must run in order**: ASC ingest → semantic bridge → AU task layer compute. Requires the FR-9.1 OSCA backbone (section 4.12h) to have run first, for the ANZSCO→OSCA expansion. Not yet wired into `scripts/run_pipeline.py` — run manually. Full design: `ai_working/decisions/ADR-011-au-task-exposure-dwa-pivot-ladder.md`.

#### 4.14a ASC v3.0 Ingest

**Source**: Australian Skills Classification (ASC) v3.0, Jobs and Skills Australia (CC BY 4.0). Acquired via the `runapp-aus/strayr` R package's `.rda` files rather than a direct CSV/Excel download — read with `pyreadr` (declared dependency, `pyreadr>=0.5`).

**Local path**: `C:\Users\royst\Projects\Data\ASC`

**Files**: `asc_specialist_tasks.rda`, `asc_core_competencies.rda`, `asc_technology_tools.rda`

**Command**:
```bash
python -m scripts.ingest_asc
python -m scripts.ingest_asc --path "C:\Users\royst\Projects\Data\ASC" --version 3.0
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| asc_specialist_task | 10,963 |
| asc_core_competency | 6,000 |
| asc_technology_tool | 1,989 |
| **TOTAL** | **18,952** |

The published ASC v3.0 files carry no source-DWA/O*NET/IWA identifier column (B0 spike finding) — `asc_specialist_task.source_dwa_id` is always NULL. This is expected, not a bug; the DWA link is built semantically in the next step.

**Verification**:
```sql
SELECT 'asc_specialist_task' AS tbl, COUNT(*) FROM asc_specialist_task
UNION ALL SELECT 'asc_core_competency', COUNT(*) FROM asc_core_competency
UNION ALL SELECT 'asc_technology_tool', COUNT(*) FROM asc_technology_tool;
SELECT COUNT(*) FROM asc_specialist_task WHERE source_dwa_id IS NOT NULL;
-- Should be 0 (v3.0 has no lineage column)
SELECT COUNT(DISTINCT anzsco_code) FROM asc_specialist_task;
-- Should be 600
```

#### 4.14b DWA↔ASC Semantic Bridge

**Source**: Derived from already-loaded data (no external files). Embeds `onet_dwa_references` titles and distinct `asc_specialist_task` texts with `all-MiniLM-L6-v2` (same model as `embed_titles`/`build_anzsco_concordance` — downloads from HuggingFace on first run if not already cached), then records the top-3 nearest DWA per ASC task at a cosine floor of 0.60. **Requires 4.14a (ASC ingest) to have run first.**

**Command**:
```bash
python -m scripts.build_dwa_asc_bridge
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| dwa_embeddings | 2,087 |
| asc_task_embeddings | 1,925 |
| dwa_asc_bridge | 5,033 |

**Verification**:
```sql
SELECT 'dwa_embeddings' AS tbl, COUNT(*) FROM dwa_embeddings
UNION ALL SELECT 'asc_task_embeddings', COUNT(*) FROM asc_task_embeddings
UNION ALL SELECT 'dwa_asc_bridge', COUNT(*) FROM dwa_asc_bridge;
SELECT COUNT(DISTINCT specialist_task) FROM dwa_asc_bridge;
-- Should be 1,923 (of 1,925 distinct ASC task texts — 99.9% matched)
SELECT COUNT(*) FROM dwa_asc_bridge WHERE rank = 1 AND cosine_similarity >= 0.95;
-- Should be 1,201 (high-confidence rank-1 matches)
SELECT MIN(cosine_similarity) FROM dwa_asc_bridge;
-- Should be >= 0.60 (the floor)
```

#### 4.14c AU Task Layer Compute

**Source**: Derived from already-loaded data (no external files). Uses `asc_specialist_task`, `dwa_asc_bridge`, `eloundou_dwa_scores`, and `osca_anzsco_map`. Attaches global `AVG(dv_beta_derived)` exposure per matched DWA (cosine-weighted where a task matches multiple DWAs), expands each ASC task to its OSCA occupation(s) via the ADR-010 4-digit→OSCA expansion, and rolls up to a task-weighted occupation exposure. **Requires 4.14b (bridge) and the FR-9.1 OSCA backbone (4.12h) to have run first.**

**Command**:
```bash
python -m scripts.compute_au_task_layer
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| au_task | 20,329 |
| au_occupation_exposure | 960 |

**Verification**:
```sql
SELECT COUNT(*) FROM au_task;
-- Should be 20,329
SELECT COUNT(*) FILTER (WHERE task_level_available) FROM au_task;
-- Should be 20,322 (99.97% measured, all tier T2)
SELECT COUNT(*) FROM au_task WHERE task_source = 'OSCA_main' AND au_native_beta IS NOT NULL;
-- Should be 0 — enforced by the ck_au_task_osca_main_no_exposure CHECK constraint
SELECT COUNT(*) FROM au_occupation_exposure;
-- Should be 960 (of 1,156 OSCA occupations — remainder have no ASC coverage, task-level NA)
```

---

## 5. Full Rebuild Sequence

Drop and recreate everything from scratch. Run from `src/backend/`:

```bash
# Reset database (WARNING: destroys all data)
alembic downgrade base
alembic upgrade head

# Step 1: O*NET (must be first)
python -m scripts.ingest_onet --path "C:\Users\royst\Projects\Data\ONet" --version 28.1

# Step 2: Independent datasets (any order)
python -m scripts.ingest_eloundou --path "C:\Users\royst\Projects\Data\OpenAI-Exposure-Score"
python -m scripts.ingest_microsoft_ai --path "C:\Users\royst\Projects\Data\microsoft-working-with-ai"
python -m scripts.ingest_aei --path "C:\Users\royst\Projects\Data\AEI"
python -m scripts.ingest_aei_temporal --path "C:\Users\royst\Projects\Data\AEI\AEI-full"
python -m scripts.ingest_oews --path "C:\Users\royst\Projects\Data\BLS\oesm24in4"

# Step 3: Derived data (must be after ingestion, in this order)
python -m scripts.derive_eloundou_dwas
python -m scripts.compute_drift
python -m scripts.compute_industry_profiles

# Step 4: Embeddings (must be after O*NET titles are loaded)
python -m scripts.embed_titles

# Step 5: GDPval (independent — can run at any point after migrations)
python -m scripts.ingest_gdpval --path "C:\Users\royst\Projects\Data\GDPval"

# Step 5b: Epoch ECI benchmarks (P0a — runtime download, no local file required)
python -m scripts.ingest_epoch_eci

# Step 5c: GDPval evaluation runner (P0b — requires ANTHROPIC_API_KEY, ~$30-50)
# Run --estimate first to confirm cost before committing
python -m scripts.compute_gdpval_waterline --estimate
python -m scripts.compute_gdpval_waterline

# Step 6: Australian data (requires title embeddings from Step 4)
python -m scripts.ingest_crosswalk
python -m scripts.ingest_abs
python -m scripts.build_anzsco_concordance
python -m scripts.compute_industry_profiles --region AU --year 2025

# Step 6b: AU Census data (independent — no cross-dependencies within AU data)
python -m scripts.ingest_abs_census_wpp    # abs_census_wpp: 180 rows (W12A)
python -m scripts.ingest_abs_census_w13    # abs_census_w13: 159 rows (W13)
python -m scripts.ingest_anzsic_subdivisions  # anzsic_subdivisions: 214 rows
# Census subdivision × occupation (level 2 pivot + level 3 long)
python -m scripts.ingest_census_subdivision_occ "$DATA_ROOT/ABS-2021-Census/IndustyxOccupationxEmployment-table_2026-03-29_13-17-55.csv" --level 2
python -m scripts.ingest_census_subdivision_occ "$DATA_ROOT/ABS-2021-Census/L3_CDGK_Industry_cat.csv" --level 3

# Step 6c: OSCA backbone + employment apportionment (FR-9.1, ADR-010)
# ingest_osca must run before compute_osca_employment; both depend on Step 6's ingest_abs
python -m scripts.ingest_osca              # osca_occupations 1,156; osca_main_tasks 6,887; osca_anzsco_map 1,383; osca_isco_map 1,448
python -m scripts.compute_osca_employment  # abs_employment_osca: 2,997 rows

# Step 6d: ASC v3.0 ingest (FR-9.2, ADR-011 — independent of Step 6c, but requires the .rda files acquired via strayr)
python -m scripts.ingest_asc               # asc_specialist_task 10,963; asc_core_competency 6,000; asc_technology_tool 1,989

# Step 6e: DWA<->ASC semantic bridge (FR-9.2, ADR-011 L2 — requires Step 6d; network required for the model on first run)
python -m scripts.build_dwa_asc_bridge     # dwa_embeddings 2,087; asc_task_embeddings 1,925; dwa_asc_bridge 5,033

# Step 6f: AU task layer compute (FR-9.2 — requires Step 6e + Step 6c's osca_anzsco_map + Step 3's eloundou_dwa_scores)
python -m scripts.compute_au_task_layer    # au_task 20,329; au_occupation_exposure 960

# Step 7: ASX company sectors (independent — downloads live from asx.com.au)
# Note: requires anzsic_subdivisions to be loaded for enriched classify prompt
python -m scripts.ingest_asx_companies
```

## 4.10 Title Embeddings (Layer 2 Semantic Search)

**Source**: Derived from already-loaded data (no external files). Uses `onet_sample_titles` and `onet_alternate_titles`.

**Command**:
```bash
python -m scripts.embed_titles
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| onet_title_embeddings | 66,512 |

Embeds all sample titles (7,953) and alternate titles (57,543) using sentence-transformers (all-MiniLM-L6-v2) into 384-dimensional vectors stored in pgvector. HNSW index is created by migration 012 for fast cosine similarity search.

**Verification**:
```sql
SELECT COUNT(*) FROM onet_title_embeddings;
-- Should be 66,512
SELECT source, COUNT(*) FROM onet_title_embeddings GROUP BY source;
-- sample_titles: 7,953; alternate_titles: ~58,559
```

---

**Total expected rows across all tables: ~538,594** (455,200 + 66,512 embeddings + 10,673 GDPval + 408 gptval_benchmarks + 3,255 AU data: 2,743 abs_employment + 491 anzsco_soc_concordance + 21 industry_crosswalk + 1,978 asx_company_sectors + 553 Census/subdivisions: 180 abs_census_wpp + 159 abs_census_w13 + 214 anzsic_subdivisions), **plus ~13,871 from FR-9.1 OSCA (1,156 osca_occupations + 6,887 osca_main_tasks + 1,383 osca_anzsco_map + 1,448 osca_isco_map + 2,997 abs_employment_osca), plus ~49,286 from FR-9.2 AU task layer (10,963 asc_specialist_task + 6,000 asc_core_competency + 1,989 asc_technology_tool + 2,087 dwa_embeddings + 1,925 asc_task_embeddings + 5,033 dwa_asc_bridge + 20,329 au_task + 960 au_occupation_exposure) → ~601,751 total.** This figure has known drift against the `CLAUDE.md` Data Load Status total (~602,645) — both include OSCA and ASC, but predate a full reconciliation of `gdpval_evaluations`, `abs_census_subdivision_occ`, and `api_request_log` row counts across the two documents. Treat `CLAUDE.md`'s Data Load Status table as authoritative for current exact counts; this line is a rough sanity-check sum.

---

## 6. Post-Ingestion Verification

Run this query to verify all tables have expected row counts:

```sql
SELECT 'onet_occupations' AS tbl, COUNT(*) AS rows FROM onet_occupations
UNION ALL SELECT 'onet_task_statements', COUNT(*) FROM onet_task_statements
UNION ALL SELECT 'onet_task_ratings', COUNT(*) FROM onet_task_ratings
UNION ALL SELECT 'onet_work_activities', COUNT(*) FROM onet_work_activities
UNION ALL SELECT 'onet_dwa_references', COUNT(*) FROM onet_dwa_references
UNION ALL SELECT 'onet_tasks_to_dwas', COUNT(*) FROM onet_tasks_to_dwas
UNION ALL SELECT 'onet_sample_titles', COUNT(*) FROM onet_sample_titles
UNION ALL SELECT 'onet_alternate_titles', COUNT(*) FROM onet_alternate_titles
UNION ALL SELECT 'onet_emerging_tasks', COUNT(*) FROM onet_emerging_tasks
UNION ALL SELECT 'eloundou_occ_scores', COUNT(*) FROM eloundou_occ_scores
UNION ALL SELECT 'eloundou_dwa_scores', COUNT(*) FROM eloundou_dwa_scores
UNION ALL SELECT 'ms_ai_applicability_scores', COUNT(*) FROM ms_ai_applicability_scores
UNION ALL SELECT 'ms_ai_soc_metrics', COUNT(*) FROM ms_ai_soc_metrics
UNION ALL SELECT 'ms_ai_iwa_metrics', COUNT(*) FROM ms_ai_iwa_metrics
UNION ALL SELECT 'ms_ai_soc_to_iwas', COUNT(*) FROM ms_ai_soc_to_iwas
UNION ALL SELECT 'ms_ai_physical_tasks', COUNT(*) FROM ms_ai_physical_tasks
UNION ALL SELECT 'aei_job_exposure', COUNT(*) FROM aei_job_exposure
UNION ALL SELECT 'aei_task_penetration', COUNT(*) FROM aei_task_penetration
UNION ALL SELECT 'aei_task_snapshots', COUNT(*) FROM aei_task_snapshots
UNION ALL SELECT 'oews_employment', COUNT(*) FROM oews_employment
UNION ALL SELECT 'task_drift_metrics', COUNT(*) FROM task_drift_metrics
UNION ALL SELECT 'industry_occupation_profiles', COUNT(*) FROM industry_occupation_profiles
UNION ALL SELECT 'onet_title_embeddings', COUNT(*) FROM onet_title_embeddings
UNION ALL SELECT 'gdpval_tasks', COUNT(*) FROM gdpval_tasks
UNION ALL SELECT 'gdpval_rubric_items', COUNT(*) FROM gdpval_rubric_items
UNION ALL SELECT 'gdpval_evaluations', COUNT(*) FROM gdpval_evaluations
UNION ALL SELECT 'abs_employment', COUNT(*) FROM abs_employment
UNION ALL SELECT 'anzsco_soc_concordance', COUNT(*) FROM anzsco_soc_concordance
UNION ALL SELECT 'industry_crosswalk', COUNT(*) FROM industry_crosswalk
UNION ALL SELECT 'asx_company_sectors', COUNT(*) FROM asx_company_sectors
UNION ALL SELECT 'company_classifications', COUNT(*) FROM company_classifications
UNION ALL SELECT 'abs_census_wpp', COUNT(*) FROM abs_census_wpp
UNION ALL SELECT 'abs_census_w13', COUNT(*) FROM abs_census_w13
UNION ALL SELECT 'anzsic_subdivisions', COUNT(*) FROM anzsic_subdivisions
UNION ALL SELECT 'osca_occupations', COUNT(*) FROM osca_occupations
UNION ALL SELECT 'osca_main_tasks', COUNT(*) FROM osca_main_tasks
UNION ALL SELECT 'osca_anzsco_map', COUNT(*) FROM osca_anzsco_map
UNION ALL SELECT 'osca_isco_map', COUNT(*) FROM osca_isco_map
UNION ALL SELECT 'abs_employment_osca', COUNT(*) FROM abs_employment_osca
UNION ALL SELECT 'asc_specialist_task', COUNT(*) FROM asc_specialist_task
UNION ALL SELECT 'asc_core_competency', COUNT(*) FROM asc_core_competency
UNION ALL SELECT 'asc_technology_tool', COUNT(*) FROM asc_technology_tool
UNION ALL SELECT 'dwa_embeddings', COUNT(*) FROM dwa_embeddings
UNION ALL SELECT 'asc_task_embeddings', COUNT(*) FROM asc_task_embeddings
UNION ALL SELECT 'dwa_asc_bridge', COUNT(*) FROM dwa_asc_bridge
UNION ALL SELECT 'au_task', COUNT(*) FROM au_task
UNION ALL SELECT 'au_occupation_exposure', COUNT(*) FROM au_occupation_exposure
ORDER BY tbl;
```

---

## 7. Start API Server

After data is loaded, start the Tier 1 API:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

21 Tier 1 endpoints available (including POST /api/v1/search/semantic for Layer 2 semantic search; all 4 sector endpoints accept ?region=US|AU for AU/ANZSIC data; GET /api/v1/sectors returns employment-weighted scores and workers-per-zone; GET /api/v1/companies/search for ASX company lookup; POST /api/v1/companies/classify for LLM sector classification) — see `README.md` for the full endpoint table.
