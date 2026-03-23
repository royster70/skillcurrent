# Ingestion Runbook

How to rebuild the Workforce AI Platform database from scratch. This covers environment setup, migrations, and all data ingestion scripts in the correct order.

---

## Prerequisites

- **Docker**: For running PostgreSQL with pgvector
- **Python 3.12**: With pip/uv for dependency management
- **Python packages**: Install from `src/backend/requirements.txt` (or equivalent)
  - Key dependencies: `asyncpg`, `sqlalchemy`, `alembic`, `pandas`, `openpyxl`, `pydantic-settings`
- **Data files**: Downloaded to local directories (see per-dataset sections below)

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

This applies all 10 migrations in order, creating all tables documented in `docs/DATA_DICTIONARY.md`.

---

## 3. Ingestion Order

**Required order:**
1. O*NET (must be first — other datasets have foreign keys to `onet_occupations`)
2. Eloundou, Microsoft AI, AEI labor market, AEI temporal, BLS OEWS (any order)
3. Eloundou DWA derivation (depends on O*NET + Eloundou data)
4. Drift computation (depends on AEI temporal data)
5. Industry profiles computation (depends on OEWS + Eloundou + Microsoft AI + AEI + drift data)

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
python -m scripts.compute_industry_profiles
python -m scripts.compute_industry_profiles --year 2024  # optional: specific release year
```

**Expected row counts**:

| Table | Rows |
|-------|------|
| industry_occupation_profiles | 7,935 |

(20 NAICS sectors, ~153M total workers)

**Verification**:
```sql
SELECT COUNT(*) FROM industry_occupation_profiles;
-- Should be 7,935
SELECT COUNT(DISTINCT naics_code) FROM industry_occupation_profiles;
-- Should be 20
SELECT COUNT(*) FROM industry_occupation_profiles WHERE eloundou_beta IS NOT NULL;
-- Majority should have multi-source scoring populated
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
```

**Total expected rows across all tables: ~455,200**

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

10 Tier 1 endpoints available — see `README.md` for the full endpoint table.
