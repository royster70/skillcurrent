# Data Dictionary

All database tables for the SkillCurrent. Grouped by domain.

---

## Infrastructure

### dataset_versions

Central version registry for all reference datasets (ADR-002). Every ingested version of O*NET, AEI, Eloundou, OEWS, Microsoft AI, or GPTVal gets a row here.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| dataset_name | TEXT | NO | Dataset identifier (e.g., "onet", "aei_temporal") |
| version_key | TEXT | NO | Version string (e.g., "28.1", "2024-09") |
| ingested_at | TIMESTAMP | NO | Server default NOW() |
| row_count | INTEGER | NO | Number of rows ingested |
| integrity_hash | TEXT | NO | SHA hash of source data for reproducibility |
| source_url | TEXT | YES | URL of source dataset |
| metadata | JSONB | YES | Arbitrary metadata (mapped as `metadata_` in Python) |

- **Primary key**: `id`
- **Unique constraint**: (`dataset_name`, `version_key`) — defined in migration
- **Migration**: 003

### dataset_version_deltas

Pre-computed diffs between dataset versions (ADR-002). Answers "what changed between O*NET 28.0 and 28.1?"

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| dataset_name | TEXT | NO | Dataset identifier |
| from_version_id | INTEGER | YES | FK to dataset_versions.id (NULL for initial load) |
| to_version_id | INTEGER | NO | FK to dataset_versions.id |
| computed_at | TIMESTAMP | NO | Server default NOW() |
| records_added | INTEGER | NO | Default 0 |
| records_removed | INTEGER | NO | Default 0 |
| records_changed | INTEGER | NO | Default 0 |
| delta_detail | JSONB | NO | Detailed diff payload |

- **Primary key**: `id`
- **Migration**: 003

### transformation_log

Lineage tracking for all derived computations (ADR-001). Populated by the `@tracked_transformation` decorator.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| name | TEXT | NO | Transformation name |
| source_tables | JSONB | NO | Array of source table names |
| target_table | TEXT | NO | Output table name |
| started_at | TIMESTAMP | NO | Server default NOW() |
| completed_at | TIMESTAMP | YES | Set on completion |
| rows_affected | INTEGER | YES | Row count produced |
| status | TEXT | NO | "running", "success", or "failed" |
| error_message | TEXT | YES | Error details if failed |
| parameters | JSONB | YES | Run parameters for reproducibility |
| pipeline_run_id | TEXT | YES | Batch correlation key (UUID4) for a pipeline run — set by `scripts/run_pipeline.py`, tags every row from one run (ADR-007 Phase 3 Rule 2). Mutually exclusive with a request's `request_id`; indexed (`ix_transformation_log_pipeline_run_id`) |

- **Primary key**: `id`
- **Migration**: 003 (column `pipeline_run_id` added in 031)

---

## O*NET Foundation

### onet_occupations

O*NET 28.1 occupation definitions. 1,016 occupations. Anchor table for all SOC-based joins.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| onet_soc | TEXT | NO | 8-digit O*NET-SOC code (e.g., "11-1011.00"). Primary key. |
| title | TEXT | NO | Occupation title |
| description | TEXT | YES | Occupation description |
| onet_version | TEXT | NO | Default "28.1" |
| created_at | TIMESTAMP | NO | Server default NOW() |
| updated_at | TIMESTAMP | NO | Server default NOW(), auto-update |

- **Primary key**: `onet_soc`
- **Indexes**: `ix_onet_occupations_title` (title)
- **Migration**: 001

### onet_task_statements

O*NET task statements. 18,796 occupation-specific task descriptions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc. Composite PK part 1. |
| task_id | INTEGER | NO | O*NET task identifier. Composite PK part 2. |
| task | TEXT | NO | Task description text |
| task_type | TEXT | YES | Task type category |
| incumbents_responding | INTEGER | YES | Number of survey respondents |
| date | TEXT | YES | Survey date |
| domain_source | TEXT | YES | Source domain |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: (`onet_soc`, `task_id`)
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: `ix_onet_task_statements_onet_soc`, `ix_onet_task_statements_task_id`
- **Migration**: 003

### onet_task_ratings

O*NET task ratings. 161,559 importance/relevance/frequency scores per task.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc |
| task_id | INTEGER | NO | O*NET task identifier |
| scale_id | TEXT | NO | Rating scale: FT (frequency), IM (importance), RT (relevance) |
| category | TEXT | YES | Rating category |
| data_value | FLOAT | YES | Score value |
| n | INTEGER | YES | Sample size |
| standard_error | FLOAT | YES | Standard error |
| lower_ci_bound | FLOAT | YES | Lower confidence interval |
| upper_ci_bound | FLOAT | YES | Upper confidence interval |
| recommend_suppress | TEXT | YES | Suppression flag |
| date | TEXT | YES | Survey date |
| domain_source | TEXT | YES | Source domain |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `id`
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: `ix_onet_task_ratings_onet_soc`, `ix_onet_task_ratings_task_id`, `ix_onet_task_ratings_scale_id`
- **Migration**: 003

### onet_dwa_references

O*NET Detailed Work Activity reference. 2,087 DWA definitions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| dwa_id | TEXT | NO | DWA code (e.g., "4.A.1.a.1.I01.D01"). Primary key. |
| element_id | TEXT | NO | Parent element ID |
| iwa_id | TEXT | NO | Parent IWA code — join key to ms_ai_iwa_metrics |
| dwa_title | TEXT | NO | DWA description |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `dwa_id`
- **Indexes**: `ix_onet_dwa_references_element_id`
- **Migration**: 003

### onet_tasks_to_dwas

O*NET task-to-DWA mapping. 23,850 links from task statements to DWA codes.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc |
| task_id | INTEGER | NO | O*NET task identifier |
| dwa_id | TEXT | NO | DWA code |
| date | TEXT | YES | Mapping date |
| domain_source | TEXT | YES | Source domain |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `id`
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: `ix_onet_tasks_to_dwas_onet_soc`, `ix_onet_tasks_to_dwas_task_id`, `ix_onet_tasks_to_dwas_dwa_id`
- **Migration**: 003

### onet_work_activities

O*NET work activities. 73,308 DWA importance/level ratings per occupation.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc |
| element_id | TEXT | NO | Activity element ID |
| element_name | TEXT | NO | Activity name |
| scale_id | TEXT | NO | IM (importance) or LV (level) |
| data_value | FLOAT | YES | Score value |
| n | INTEGER | YES | Sample size |
| standard_error | FLOAT | YES | Standard error |
| lower_ci_bound | FLOAT | YES | Lower confidence interval |
| upper_ci_bound | FLOAT | YES | Upper confidence interval |
| recommend_suppress | TEXT | YES | Suppression flag |
| not_relevant | TEXT | YES | Not-relevant flag |
| date | TEXT | YES | Survey date |
| domain_source | TEXT | YES | Source domain |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `id`
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: `ix_onet_work_activities_onet_soc`, `ix_onet_work_activities_element_id`, `ix_onet_work_activities_scale_id`
- **Migration**: 003

### onet_sample_titles

O*NET sample of reported titles. 7,953 job titles for Tier 2 Layer 1 matching.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc |
| reported_job_title | TEXT | NO | Reported job title |
| shown_in_my_next_move | TEXT | YES | My Next Move flag |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `id`
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: `ix_onet_sample_titles_onet_soc`, `ix_onet_sample_titles_title`
- **Migration**: 003

### onet_alternate_titles

O*NET alternate titles. 57,543 additional titles for Tier 2 Layer 1 matching.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc |
| alternate_title | TEXT | NO | Alternate job title |
| short_title | TEXT | YES | Short form |
| sources | TEXT | YES | Source identifiers |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `id`
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: `ix_onet_alternate_titles_onet_soc`, `ix_onet_alternate_titles_title`
- **Migration**: 003

### onet_emerging_tasks

O*NET emerging tasks. 328 new or updated tasks identified in occupations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc |
| task | TEXT | NO | Task description |
| category | TEXT | YES | "New" or "Updated" |
| original_task_id | TEXT | YES | Original task ID (for updated tasks) |
| original_task | TEXT | YES | Original task text (for updated tasks) |
| date | TEXT | YES | Date identified |
| domain_source | TEXT | YES | Source domain |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `id`
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: `ix_onet_emerging_tasks_onet_soc`, `ix_onet_emerging_tasks_category`
- **Migration**: 003

### onet_title_embeddings

Sentence-transformer embeddings for O*NET titles. 66,512 embeddings (384-dim, all-MiniLM-L6-v2) covering sample titles and alternate titles. Used by Layer 2 semantic search via pgvector HNSW index.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc |
| title | TEXT | NO | Job title text that was embedded |
| source | TEXT | NO | Source table: "sample_titles" or "alternate_titles" |
| embedding | VECTOR(384) | NO | 384-dimensional sentence-transformer embedding |

- **Primary key**: `id`
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: HNSW index on `embedding` column for cosine similarity search
- **Migration**: 012
- **Populated by**: `python -m scripts.embed_titles` (66,512 embeddings)

---

## Eloundou Exposure

### eloundou_occ_scores

Eloundou et al. (2024) occupation-level AI exposure scores. 923 occupations scored by both GPT-4 and human annotators.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | FK to onet_occupations.onet_soc (8-digit) |
| title | TEXT | YES | Occupation title |
| dv_e1_alpha | FLOAT | YES | GPT-4 rater: E1 direct exposure (alpha) |
| dv_e2_beta | FLOAT | YES | GPT-4 rater: E2 complementary exposure (beta component) |
| dv_e0_gamma | FLOAT | YES | GPT-4 rater: E0 overall exposure (gamma) |
| dv_beta_derived | FLOAT | YES | GPT-4 rater: E1 + 0.5*E2 |
| human_e1_alpha | FLOAT | YES | Human rater: E1 direct exposure |
| human_e2_beta | FLOAT | YES | Human rater: E2 complementary exposure |
| human_e0_gamma | FLOAT | YES | Human rater: E0 overall exposure |
| human_beta_derived | FLOAT | YES | Human rater: E1 + 0.5*E2 |
| dataset_version | TEXT | NO | Source dataset version |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `id`
- **Foreign keys**: `onet_soc` -> `onet_occupations.onet_soc`
- **Indexes**: `ix_eloundou_occ_scores_onet_soc`, `ix_eloundou_occ_scores_dv_beta`
- **Migration**: 005

### eloundou_dwa_scores

DWA-level derived exposure scores. 17,537 rows. Derived from occupation-level scores via Strategy A (distribute Beta across DWAs weighted by O*NET task importance).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | 8-digit O*NET-SOC code |
| dwa_id | TEXT | NO | DWA code |
| dwa_title | TEXT | YES | DWA description |
| dv_e1_alpha | FLOAT | YES | GPT-4 derived E1 |
| dv_e2_beta | FLOAT | YES | GPT-4 derived E2 |
| dv_e0_gamma | FLOAT | YES | GPT-4 derived E0 |
| dv_beta_derived | FLOAT | YES | GPT-4 derived Beta |
| human_e1_alpha | FLOAT | YES | Human derived E1 |
| human_e2_beta | FLOAT | YES | Human derived E2 |
| human_e0_gamma | FLOAT | YES | Human derived E0 |
| human_beta_derived | FLOAT | YES | Human derived Beta |
| importance_weight | FLOAT | YES | Fraction of occupation's total task importance for this DWA (sums to 1.0 per occ) |
| task_count | INTEGER | YES | Number of tasks linking this DWA to this occupation |
| source | TEXT | NO | "derived" (Strategy A) or "llm_rubric" (Strategy B, future) |
| dataset_version | TEXT | NO | Source dataset version |
| onet_version | TEXT | NO | Default "28.1" |

- **Primary key**: `id`
- **Indexes**: `ix_eloundou_dwa_scores_onet_soc`, `ix_eloundou_dwa_scores_dwa_id`, `ix_eloundou_dwa_scores_dv_beta`
- **Migration**: 008

---

## Microsoft AI Applicability

### ms_ai_applicability_scores

Microsoft "Working with AI" composite AI applicability score per SOC occupation. 785 occupations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| soc_code | TEXT | NO | 6-digit SOC code (e.g., "11-1011") |
| title | TEXT | YES | Occupation title |
| ai_applicability_score | FLOAT | YES | Composite score averaging user-goal and AI-action perspectives |
| dataset_version | TEXT | NO | Dataset version identifier |

- **Primary key**: `id`
- **Indexes**: `ix_ms_ai_applicability_soc`
- **Migration**: 004

### ms_ai_soc_metrics

Detailed SOC-level metrics from Copilot usage. 785 occupations with paired user/AI perspectives.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| soc_code | TEXT | NO | 6-digit SOC code |
| title | TEXT | YES | Occupation title |
| coverage_user | FLOAT | YES | User perspective: task coverage |
| coverage_ai | FLOAT | YES | AI perspective: task coverage |
| completion_user | FLOAT | YES | User perspective: completion rate |
| completion_ai | FLOAT | YES | AI perspective: completion rate |
| feedback_positive_fraction_user | FLOAT | YES | User perspective: positive feedback fraction |
| feedback_positive_fraction_ai | FLOAT | YES | AI perspective: positive feedback fraction |
| impact_scope_user | FLOAT | YES | User perspective: impact scope |
| impact_scope_ai | FLOAT | YES | AI perspective: impact scope |
| ai_applicability_score_user | FLOAT | YES | User perspective: applicability score |
| ai_applicability_score_ai_nonphysical | FLOAT | YES | AI perspective: applicability (non-physical tasks only) |
| dataset_version | TEXT | NO | Dataset version identifier |

- **Primary key**: `id`
- **Indexes**: `ix_ms_ai_soc_metrics_soc`
- **Migration**: 004

### ms_ai_iwa_metrics

IWA-level metrics from Copilot usage. 332 Intermediate Work Activities.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| iwa_code | TEXT | NO | IWA code (e.g., "4.A.1.a.1.I01") |
| title | TEXT | YES | IWA title |
| share_user | FLOAT | YES | User share |
| share_ai | FLOAT | YES | AI share |
| completion_user | FLOAT | YES | User completion |
| completion_ai | FLOAT | YES | AI completion |
| impact_scope_user | FLOAT | YES | User impact scope |
| impact_scope_ai | FLOAT | YES | AI impact scope |
| feedback_positive_fraction_user | FLOAT | YES | User positive feedback |
| feedback_positive_fraction_ai | FLOAT | YES | AI positive feedback |
| completion_x_scope_x_coverage_user | FLOAT | YES | User composite metric |
| completion_x_scope_x_coverage_ai | FLOAT | YES | AI composite metric |
| dataset_version | TEXT | NO | Dataset version identifier |

- **Primary key**: `id`
- **Indexes**: `ix_ms_ai_iwa_metrics_iwa`
- **Migration**: 004

### ms_ai_soc_to_iwas

SOC-to-IWA mapping. 13,698 mappings linking occupations to relevant IWAs.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| soc_code | TEXT | NO | 6-digit SOC code |
| iwa_code | TEXT | NO | IWA code |
| dataset_version | TEXT | NO | Dataset version identifier |

- **Primary key**: `id`
- **Indexes**: `ix_ms_ai_soc_to_iwas_soc`, `ix_ms_ai_soc_to_iwas_iwa`
- **Migration**: 004

### ms_ai_physical_tasks

Physical task classification. 18,796 tasks with physical/non-physical boolean flag.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| task_id | INTEGER | NO | O*NET task ID. Primary key. |
| physical | BOOLEAN | NO | TRUE if task is physical (excluded from AI-action scoring) |
| dataset_version | TEXT | NO | Dataset version identifier |

- **Primary key**: `task_id`
- **Migration**: 004

---

## AEI Empirical

### aei_job_exposure

AEI occupation-level observed AI exposure from Claude usage. 756 occupations.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| occ_code | TEXT | NO | 6-digit SOC code |
| title | TEXT | YES | Occupation title |
| observed_exposure | FLOAT | YES | Fraction of tasks where Claude is actively used |
| dataset_version | TEXT | NO | Dataset version identifier |

- **Primary key**: `id`
- **Indexes**: `ix_aei_job_exposure_occ_code`
- **Migration**: 006

### aei_task_penetration

AEI task-level AI penetration scores. 17,998 tasks. 7.5% have non-zero penetration.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| task | TEXT | NO | Task description (joins to onet_task_statements.task via text match) |
| penetration | FLOAT | YES | Empirical conversation fraction addressing this task |
| dataset_version | TEXT | NO | Dataset version identifier |

- **Primary key**: `id`
- **Indexes**: `ix_aei_task_penetration_penetration`
- **Migration**: 006

### aei_task_snapshots

AEI temporal releases. 16,976 rows across 6 snapshots and 4 model eras. Append-only temporal store.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| task_text | TEXT | NO | Task description |
| onet_soc_codes | TEXT[] | YES | Array of associated O*NET SOC codes (GIN-indexed) |
| snapshot_date | DATE | NO | Release date |
| release_version | TEXT | NO | Release identifier (e.g., "2024-09") |
| model_era | TEXT | NO | Model generation (e.g., "sonnet-3.5", "sonnet-3.7") |
| automation_pct | FLOAT | YES | Automation percentage |
| augmentation_pct | FLOAT | YES | Augmentation percentage |
| task_pct | FLOAT | YES | Task percentage (added in migration 007) |
| platform | TEXT | NO | Default "global" |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: (`task_text`, `snapshot_date`, `platform`)
- **Indexes**: `ix_aei_task_snapshots_snapshot_date`, `ix_aei_task_snapshots_release_version`, `ix_aei_task_snapshots_model_era`, `ix_aei_task_snapshots_platform`, `ix_aei_task_snapshots_onet_soc_codes` (GIN)
- **Migration**: 002, column `task_pct` added in 007

---

## BLS Employment

### oews_employment

BLS Occupational Employment and Wage Statistics. 8,573 rows. US headcount by occupation x industry.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| onet_soc | TEXT | NO | 6-digit SOC code |
| naics_code | TEXT | NO | NAICS industry code |
| naics_title | TEXT | YES | NAICS industry title |
| area_code | TEXT | NO | Default "US0000" |
| employment | INTEGER | YES | Employment count |
| employment_per_1000 | FLOAT | YES | Employment per 1,000 jobs |
| mean_annual_wage | INTEGER | YES | Mean annual wage |
| median_annual_wage | INTEGER | YES | Median annual wage |
| release_year | INTEGER | NO | OEWS release year |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: (`onet_soc`, `naics_code`, `area_code`, `release_year`)
- **Indexes**: `ix_oews_employment_onet_soc`, `ix_oews_employment_naics_code`, `ix_oews_employment_release_year`
- **Migration**: 002

### industry_occupation_profiles

Pre-computed industry profiles. 7,935 profiles across 20 NAICS sectors (FR-8.4). Multi-source scoring from Eloundou, Microsoft AI, AEI, and drift computation.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| naics_code | TEXT | NO | NAICS industry code |
| naics_title | TEXT | YES | Industry title |
| onet_soc | TEXT | NO | 6-digit SOC code |
| occupation_title | TEXT | YES | Occupation title |
| employment_share | FLOAT | YES | Share of industry employment |
| headcount | INTEGER | YES | Headcount in this occupation |
| avg_automation_pct | FLOAT | YES | Average automation percentage |
| avg_augmentation_pct | FLOAT | YES | Average augmentation percentage |
| dominant_zone | TEXT | YES | Exposure zone classification |
| eloundou_beta | FLOAT | YES | Eloundou Beta score (E1 + 0.5*E2) for this occupation |
| ms_ai_applicability | FLOAT | YES | Microsoft AI applicability score for this occupation |
| aei_exposure | FLOAT | YES | AEI observed exposure for this occupation |
| drift_velocity | FLOAT | YES | Task drift velocity from FR-8.2 linregress |
| drift_classification | TEXT | YES | Drift classification (departing/enduring/emerging/below_threshold) |
| profile_date | DATE | NO | Profile computation date |
| release_year | INTEGER | NO | Source data year |
| osca_code | TEXT | YES | OSCA 6-digit occupation code (FR-9.1, migration 023). Nullable — added additively, **not yet populated**; requires the onet_soc→anzsco→osca chain with employment apportionment (future step) |
| created_at | TIMESTAMP | NO | Server default NOW() |
| updated_at | TIMESTAMP | NO | Server default NOW(), auto-update |

- **Primary key**: `id`
- **Unique constraint**: (`naics_code`, `onet_soc`, `release_year`)
- **Indexes**: `ix_industry_occupation_profiles_naics_code`, `ix_industry_occupation_profiles_onet_soc`, `ix_industry_occupation_profiles_dominant_zone`, `ix_industry_occupation_profiles_osca` (migration 023)
- **Migration**: 002, columns `eloundou_beta`, `ms_ai_applicability`, `aei_exposure`, `drift_velocity`, `drift_classification` added in 010, `region` added in 014, `osca_code` added in 023 (nullable, unpopulated)
- **Populated by**: `compute_industry_profiles` script (FR-8.4)

### abs_employment

Australian Bureau of Statistics / JSA employment data by ANZSCO × ANZSIC. 2,743 rows across 19 ANZSIC divisions (FR-8.9).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| anzsco_code | TEXT | NO | ANZSCO occupation code (4-digit unit group or 6-digit occupation; both granularities present) |
| anzsco_title | TEXT | YES | ANZSCO occupation title |
| anzsic_code | TEXT | NO | ANZSIC industry code |
| anzsic_title | TEXT | YES | ANZSIC industry title |
| area_code | TEXT | NO | Default "AU0000" |
| employment | INTEGER | YES | Employment count |
| employment_per_1000 | FLOAT | YES | Employment per 1,000 jobs |
| median_annual_wage | INTEGER | YES | Median annual wage |
| release_year | INTEGER | NO | JSA release year (2025) |
| osca_code | TEXT | YES | OSCA 6-digit occupation code (FR-9.1, migration 023). Linked for 1,501 of 2,743 rows — only 6-digit `anzsco_code` rows with a single unambiguous `osca_anzsco_map` match are linked; 4-digit unit-group rows and ambiguous (n:m) mappings are left NULL (see `abs_employment_osca` for the fully apportioned view) |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: (`anzsco_code`, `anzsic_code`, `area_code`, `release_year`)
- **Indexes**: `ix_abs_employment_anzsco`, `ix_abs_employment_anzsic`, `ix_abs_employment_release_year`, `ix_abs_employment_osca` (migration 023)
- **Migration**: 014, column `osca_code` added in 023
- **Populated by**: `python -m scripts.ingest_abs`; `osca_code` populated by `python -m scripts.ingest_osca` (unique-match backfill, `_link_abs_employment`)

### industry_crosswalk

Industry classification crosswalk (NAICS to ANZSIC via ISIC). Table exists but AU data not yet loaded (FR-8.9).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| source_system | TEXT | NO | Source classification (e.g., "NAICS") |
| source_code | TEXT | NO | Source industry code |
| target_system | TEXT | NO | Target classification (e.g., "ANZSIC") |
| target_code | TEXT | NO | Target industry code |
| bridge_system | TEXT | YES | Intermediate system (e.g., "ISIC") |
| bridge_code | TEXT | YES | Intermediate code |
| match_type | TEXT | NO | Match quality indicator |
| weight | FLOAT | NO | Mapping weight, default 1.0 |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: (`source_system`, `source_code`, `target_system`, `target_code`)
- **Indexes**: `ix_industry_crosswalk_source` (source_system, source_code), `ix_industry_crosswalk_target` (target_system, target_code)
- **Migration**: 002

---

## Drift & Classification

### task_drift_metrics

Per-task drift velocity and classification from FR-8.2/FR-8.3. Computed via linear regression of `task_pct` over AEI temporal snapshots.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| task_text | TEXT | NO | O\*NET task text (unique) |
| first_seen_date | DATE | YES | Earliest AEI snapshot date |
| latest_date | DATE | YES | Most recent AEI snapshot date |
| snapshot_count | INTEGER | YES | Number of AEI snapshots |
| velocity | FLOAT | YES | Linregress slope (positive = departing) |
| r_squared | FLOAT | YES | Regression fit quality |
| p_value | FLOAT | YES | Statistical significance |
| classification | TEXT | YES | departing, enduring, emerging, below_threshold |
| latest_task_pct | FLOAT | YES | Most recent task_pct value |
| peak_task_pct | FLOAT | YES | Maximum task_pct across snapshots |
| mean_task_pct | FLOAT | YES | Average task_pct across snapshots |
| platform | TEXT | NO | Default 'claude_ai' |

- **Primary key**: `id`
- **Unique constraint**: `task_text`
- **Indexes**: `ix_task_drift_metrics_velocity`, `ix_task_drift_metrics_classification`, `ix_task_drift_metrics_latest_task_pct`
- **Migration**: 009
- **Populated by**: `@tracked_transformation compute_task_drift` (FR-8.2)

---

## GDPval Benchmark

### gdpval_tasks

OpenAI GDPval real-world knowledge tasks. 220 tasks across 44 occupations and 9 NAICS sectors. Each task has a detailed evaluation rubric. Mapped to O*NET SOC codes for cross-referencing with exposure and drift data. Supports FR-8.7 longitudinal waterline tracking when model evaluation scores are added.

Source: https://huggingface.co/datasets/openai/gdpval (MIT license)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| task_id | TEXT | NO | GDPval task identifier (unique) |
| occupation_title | TEXT | NO | Occupation title as given in GDPval |
| onet_soc | TEXT | YES | Mapped O*NET-SOC code (8-digit); NULL if no mapping found |
| sector | TEXT | NO | NAICS sector label from GDPval |
| prompt | TEXT | NO | Full task prompt text |
| rubric_item_count | INTEGER | NO | Number of rubric criteria for this task |
| max_score | INTEGER | YES | Sum of positive rubric scores (best-case total) |
| min_score | INTEGER | YES | Sum of negative rubric scores (worst-case total) |
| reference_file_count | INTEGER | NO | Number of reference files attached; default 0 |
| deliverable_file_count | INTEGER | NO | Number of deliverable files attached; default 0 |

- **Primary key**: `id`
- **Unique constraint**: `task_id`
- **Indexes**: `ix_gdpval_tasks_onet_soc`, `ix_gdpval_tasks_sector`, `ix_gdpval_tasks_occupation`
- **Migration**: 013
- **Populated by**: `python -m scripts.ingest_gdpval` (220 tasks, 44 occupations, SOC mapping in `gdpval_ingestion.SOC_MAPPING`)
- **Join**: `gdpval_tasks.onet_soc` -> `onet_occupations.onet_soc` (soft reference — nullable, no FK constraint)

### gdpval_rubric_items

Evaluation rubric criteria for GDPval tasks. 10,453 items. Each row is one scored criterion for one task.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| task_id | TEXT | NO | FK to gdpval_tasks.task_id |
| rubric_item_id | TEXT | NO | GDPval rubric item identifier |
| score | INTEGER | NO | Point value (positive = reward, negative = penalty) |
| criterion | TEXT | NO | Rubric criterion description |
| required | BOOLEAN | NO | Whether criterion must be satisfied; default false |
| author_type | TEXT | NO | Annotation author type; default "human" |
| tags | TEXT | YES | JSON array of category tags stored as text |

- **Primary key**: `id`
- **Foreign keys**: `task_id` -> `gdpval_tasks.task_id`
- **Indexes**: `ix_gdpval_rubric_items_task_id`
- **Migration**: 013

### gdpval_evaluations

Model evaluation scores per task per era for FR-8.7 longitudinal waterline tracking. 0 rows — table is ready; scores are populated when models are evaluated against GDPval rubrics.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| task_id | TEXT | NO | FK to gdpval_tasks.task_id |
| model_era | TEXT | NO | Model generation label (e.g., "sonnet-3.5", "sonnet-4") |
| model_name | TEXT | YES | Specific model identifier |
| evaluation_date | DATE | YES | Date evaluation was run |
| total_score | FLOAT | YES | Aggregate rubric score achieved |
| max_possible_score | FLOAT | YES | Maximum achievable score for this task |
| completion_pct | FLOAT | YES | total_score / max_possible_score × 100 |
| notes | TEXT | YES | Free-text evaluation notes |

- **Primary key**: `id`
- **Unique constraint**: (`task_id`, `model_era`) — one score per task per model era
- **Foreign keys**: `task_id` -> `gdpval_tasks.task_id`
- **Indexes**: `ix_gdpval_evaluations_task_id`, `ix_gdpval_evaluations_model_era`
- **Migration**: 013
- **Populated by**: future model evaluation pipeline (FR-8.7)

### abs_census_wpp

ABS 2021 Census Working Population Profiles — W12A table. ANZSIC division × ANZSCO major group headcounts at national level (AUS). Primary data source for the `GET /sectors/{code}/occupation-mix` endpoint. 180 rows (20 ANZSIC divisions × 9 ANZSCO major groups including "not stated").

Source: ABS 2021 Census Working Population Profiles (CC-BY 4.0), `2021Census_W12A_AUS_POW_AUS.csv`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| anzsic_division_code | TEXT | NO | ANZSIC division letter (A–S) |
| anzsic_division_name | TEXT | NO | ANZSIC division label (e.g., "Manufacturing") |
| anzsco_major_group | TEXT | YES | ANZSCO major group code (1–9); NULL for "not stated" |
| anzsco_major_group_name | TEXT | YES | ANZSCO major group label (e.g., "Professionals") |
| employed_count | INTEGER | NO | Headcount from 2021 Census |
| census_year | INTEGER | NO | Census year (2021) |

- **Primary key**: `id`
- **Unique constraint**: (`anzsic_division_code`, `anzsco_major_group`)
- **Indexes**: `ix_abs_census_wpp_anzsic_division`
- **Migration**: 018
- **Populated by**: `python -m scripts.ingest_abs_census_wpp`
- **Used by**: `GET /api/v1/sectors/{code}/occupation-mix`; `occupation_mix` field on AU sector list and composite sector responses; `workforce_profile` on `ClassifyResponse`

### abs_census_w13

ABS 2021 Census Working Population Profiles — W13 table. ANZSCO sub-major group × Sex at national level (AUS). 159 rows (53 ANZSCO sub-major groups × 3 sex categories: M, F, P).

Source: ABS 2021 Census Working Population Profiles (CC-BY 4.0), `2021Census_W13_AUS_POW_AUS.csv`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| anzsco_submajor_group | TEXT | NO | ANZSCO sub-major group code (2-digit, e.g., "11") |
| anzsco_submajor_name | TEXT | NO | Sub-major group label (e.g., "Chief Executives, General Managers and Legislators") |
| sex | TEXT | NO | "M" (male), "F" (female), or "P" (persons/total) |
| employed_count | INTEGER | NO | Headcount from 2021 Census |
| census_year | INTEGER | NO | Census year (2021) |

- **Primary key**: `id`
- **Unique constraint**: (`anzsco_submajor_group`, `sex`)
- **Indexes**: `ix_abs_census_w13_submajor`
- **Migration**: 019
- **Populated by**: `python -m scripts.ingest_abs_census_w13`
- **Used by**: Diversity analytics at occupation-category level (planned Tier 1 enhancement)

### anzsic_subdivisions

JSA/ABS Industry Data Table 3 — sub-sector employment by ANZSIC subdivision. 214 rows covering all 19 ANZSIC divisions (not all 20 — Division Q Health Care not subdivided in JSA Table 3 as distinct sub-sectors). Each row is one ANZSIC subdivision (2–4 letter code, e.g., "D26") with 2025 employment headcount.

Source: JSA `industry_data_-_november_2025_revised.xlsx` Table 3 (same file as abs_employment)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| anzsic_division_code | TEXT | NO | Parent ANZSIC division letter (A–S) |
| anzsic_division_name | TEXT | NO | Division label |
| anzsic_subdivision_code | TEXT | NO | ANZSIC subdivision code (2–4 chars, e.g., "D26") |
| anzsic_subdivision_name | TEXT | NO | Subdivision label (e.g., "Electricity Supply") |
| employment | INTEGER | NO | Employment headcount (JSA 2025, thousands rounded) |
| release_year | INTEGER | NO | Data release year (2025) |

- **Primary key**: `id`
- **Unique constraint**: `anzsic_subdivision_code`
- **Indexes**: `ix_anzsic_subdivisions_division_code`
- **Migration**: 020
- **Populated by**: `python -m scripts.ingest_anzsic_subdivisions`
- **Used by**: AU company classify prompt enrichment — top 6 subdivisions per division injected into the Claude Haiku 4.5 prompt to provide sub-sector context; not used in sector analysis queries

---

## OSCA Backbone (FR-9.1)

The Australian Occupation Standard Classification (OSCA 2024 v1.0, ABS) is the canonical AU occupation entity, superseding the retired ANZSCO. ANZSCO is retained as a legacy key during the dual-key transition via `osca_anzsco_map`. See ADR-010 (`ai_working/decisions/ADR-010-anzsco-osca-employment-apportionment.md`) for the employment apportionment design and `app/services/osca_ingestion.py` / `app/services/osca_apportionment.py` for the implementation.

### osca_occupations

OSCA occupation backbone. 1,156 occupations (6-digit canonical AU key).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| osca_code | TEXT | NO | 6-digit OSCA occupation code |
| title | TEXT | NO | Occupation title |
| description | TEXT | YES | Lead Statement (from OSCA Category Descriptions Table 1) |
| isco08_code | TEXT | YES | Associated ISCO-08 code |
| unit_group | TEXT | YES | OSCA hierarchy parent (4-digit unit group) |
| osca_version | TEXT | NO | Default "2024.1.0" |
| integrity_hash | TEXT | YES | SHA-256 of source workbook bytes (ADR-002) |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: (`osca_code`, `osca_version`)
- **Indexes**: `ix_osca_occupations_code`, `ix_osca_occupations_isco`
- **Migration**: 023
- **Populated by**: `python -m scripts.ingest_osca` (parses "OSCA structure.xlsx" Table 5 + "OSCA Category Descriptions.xlsx" Table 1)

### osca_main_tasks

OSCA main tasks — GenAI-generated by ABS, few and broad. 6,887 rows. **Descriptor-only; never an exposure carrier** — no O*NET/DWA linkage.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| osca_code | TEXT | NO | OSCA occupation code |
| task_id | TEXT | YES | Source task id if present |
| task_text | TEXT | NO | Task description text |
| descriptor_only | BOOLEAN | NO | Default `true` — always true; task-level exposure is carried elsewhere, not by this table |
| osca_version | TEXT | NO | Default "2024.1.0" |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Indexes**: `ix_osca_main_tasks_code`
- **Migration**: 023
- **Populated by**: `python -m scripts.ingest_osca` (parses "OSCA Category Descriptions.xlsx" Table 1, Main Tasks column, semicolon-split)

### osca_anzsco_map

Official ABS OSCA↔ANZSCO v1.3 correspondence (dual-key bridge). 1,383 rows. `correspondence_type`/`relation_type`/`weight` preserve many-to-many splits explicitly so employment apportionment never collapses them silently.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| osca_code | TEXT | NO | OSCA occupation code |
| anzsco_code | TEXT | NO | ANZSCO occupation code |
| correspondence_type | TEXT | YES | `full` (exact) or `partial` (ABS 'p' flag) |
| relation_type | TEXT | YES | 1:1 \| 1:n \| n:1 \| n:m (not populated by current ingest — reserved) |
| weight | FLOAT | YES | Apportionment weight (not populated by current ingest — reserved; see `abs_employment_osca` for the actual apportionment) |
| osca_version | TEXT | NO | Default "2024.1.0" |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: (`osca_code`, `anzsco_code`, `osca_version`)
- **Indexes**: `ix_osca_anzsco_osca`, `ix_osca_anzsco_anzsco`
- **Migration**: 023
- **Populated by**: `python -m scripts.ingest_osca` (parses "OSCA correspondence tables v2.xlsx" Table 2, forward-filled OSCA code)

### osca_isco_map

Official ABS OSCA↔ISCO-08 correspondence (occupation-level pivot for gap-fill). 1,448 rows.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| osca_code | TEXT | NO | OSCA occupation code |
| isco08_code | TEXT | NO | ISCO-08 code |
| correspondence_type | TEXT | YES | `full` or `partial` |
| relation_type | TEXT | YES | Reserved (not populated by current ingest) |
| weight | FLOAT | YES | Reserved (not populated by current ingest) |
| osca_version | TEXT | NO | Default "2024.1.0" |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: (`osca_code`, `isco08_code`, `osca_version`)
- **Indexes**: `ix_osca_isco_osca`, `ix_osca_isco_isco`
- **Migration**: 023
- **Populated by**: `python -m scripts.ingest_osca` (parses "OSCA correspondence tables v2.xlsx" Table 8)

### abs_employment_osca

AU employment apportioned ANZSCO → OSCA per the ADR-010 ladder. 2,997 rows — one row per (osca_code × anzsic × area × source anzsco_code × year); downstream consumers sum by `osca_code` to get OSCA-keyed employment weights.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| osca_code | TEXT | NO | Target OSCA occupation code |
| anzsco_code | TEXT | NO | Source ANZSCO code (from `abs_employment`) |
| anzsic_code | TEXT | NO | ANZSIC industry code |
| area_code | TEXT | NO | Default "AU0000" |
| apportioned_employment | FLOAT | YES | Employment attributed to this OSCA occupation |
| link_method | TEXT | NO | `full` (1,702 rows, confidence 1.0, ~61% of total employment — exact 6-digit ANZSCO with a single OSCA target) or `apportioned_equal` (1,295 rows, avg confidence 0.485, ~39% — equal split across N OSCA targets, no finer employment data to weight by). Note: ADR-010 also documents an `apportioned_employment` (A2, employment-weighted) method — **not yet implemented**; only `full` (A1) and `apportioned_equal` (A3) are live |
| confidence | FLOAT | YES | 1.0 for `full`; 0.5 (6-digit source) or 0.4 (4-digit source) for `apportioned_equal` |
| release_year | INTEGER | NO | Source `abs_employment.release_year` |
| osca_version | TEXT | NO | Default "2024.1.0" |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Indexes**: `ix_abs_emp_osca_osca`, `ix_abs_emp_osca_anzsco`, `ix_abs_emp_osca_method`
- **Migration**: 024
- **Populated by**: `python -m scripts.compute_osca_employment` (requires `python -m scripts.ingest_osca` to have run first)
- **Reconciliation invariant**: `SUM(apportioned_employment)` over all OSCA targets of a source row equals the source row's `abs_employment.employment`, after the A0 double-count guard (prefer 6-digit ANZSCO detail over 4-digit unit-group aggregates so employment is never counted twice). Verified: total apportioned employment 9,612,166 = de-duplicated ANZSCO base 9,612,166.

---

## AU Task Layer (FR-9.2, ADR-011)

The AU task-level plane, pivoted on the O*NET **DWA** grain. Australian Skills Classification (ASC) v3.0 specialist tasks were built from O*NET DWAs, so they are the exposure carrier; OSCA (see above) remains the occupation backbone and descriptor layer only. Full design rationale, the decision ladder (L0–L4), and the B0 gating-spike finding (ASC v3.0 exposes no source-DWA column, so the bridge must be semantic): `ai_working/decisions/ADR-011-au-task-exposure-dwa-pivot-ladder.md`.

### asc_specialist_task

Australian Skills Classification (ASC) v3.0 specialist tasks, ANZSCO-keyed. 10,963 rows. **The AU task-level exposure carrier** — these tasks were built from O*NET DWAs (JSA methodology 21.2/23.1), reworded and clustered for AU, but the published files carry no source-DWA identifier.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| anzsco_code | TEXT | NO | 4-digit ANZSCO unit group code |
| anzsco_name | TEXT | YES | ANZSCO unit group title |
| specialist_task | TEXT | NO | Task description text |
| percent_of_time_spent_on_task | FLOAT | YES | Source-provided importance weight, used as the DWA-beta aggregation weight |
| specialist_cluster | TEXT | YES | Parent task cluster label |
| percent_of_time_spent_on_cluster | FLOAT | YES | Cluster-level time share |
| cluster_family | TEXT | YES | Parent cluster family label |
| percent_of_time_spent_on_family | FLOAT | YES | Family-level time share |
| source_dwa_id | TEXT | YES | Reserved for a future lineage-bearing ASC release (ADR-011 L1); always NULL for v3.0 (B0 finding) |
| asc_version | TEXT | NO | Default "3.0" |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Indexes**: `ix_asc_specialist_task_anzsco` (anzsco_code), `ix_asc_specialist_task_dwa` (source_dwa_id)
- **Migration**: 025
- **Populated by**: `python -m scripts.ingest_asc` (reads `strayr` package `.rda` files via `pyreadr`)
- **Coverage**: 600 distinct ANZSCO codes; all 600 resolve to at least one OSCA occupation via `osca_anzsco_map` (verified 600/600 = 100%, reusing the ADR-010 4-digit→OSCA expansion)

### asc_core_competency

ASC v3.0 core competencies, ANZSCO-keyed. 6,000 rows. 10 competencies scored 1–10 with a proficiency level and anchor description.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| anzsco_code | TEXT | NO | 4-digit ANZSCO unit group code |
| anzsco_name | TEXT | YES | ANZSCO unit group title |
| core_competency | TEXT | NO | Competency name (one of 10) |
| score | FLOAT | YES | Score 1–10 |
| proficiency_level | TEXT | YES | Proficiency band label |
| anchor_value | TEXT | YES | Anchor/benchmark description text |
| asc_version | TEXT | NO | Default "3.0" |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Indexes**: `ix_asc_core_competency_anzsco` (anzsco_code)
- **Migration**: 025
- **Populated by**: `python -m scripts.ingest_asc`

### asc_technology_tool

ASC v3.0 technology tools, ANZSCO-keyed. 1,989 rows.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| anzsco_code | TEXT | NO | 4-digit ANZSCO unit group code |
| anzsco_name | TEXT | YES | ANZSCO unit group title |
| technology_tool | TEXT | NO | Tool/technology name |
| asc_version | TEXT | NO | Default "3.0" |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Indexes**: `ix_asc_technology_tool_anzsco` (anzsco_code)
- **Migration**: 025
- **Populated by**: `python -m scripts.ingest_asc`

### dwa_embeddings

Sentence-transformer embeddings for O*NET DWA titles — one side of the ADR-011 L2 semantic bridge. 2,087 rows (one per `onet_dwa_references` row with a non-null title). Raw-SQL access (no ORM model), mirroring `onet_title_embeddings` (migration 012).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| dwa_id | TEXT | NO | DWA code (unique) |
| dwa_title | TEXT | YES | DWA description text that was embedded |
| embedding | VECTOR(384) | YES | 384-dimensional sentence-transformer embedding (all-MiniLM-L6-v2) |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: `dwa_id`
- **Indexes**: `ix_dwa_embeddings_vec` — HNSW (embedding, cosine ops)
- **Migration**: 026
- **Populated by**: `python -m scripts.build_dwa_asc_bridge`

### asc_task_embeddings

Sentence-transformer embeddings for distinct ASC specialist-task texts — the other side of the ADR-011 L2 bridge. 1,925 rows (distinct task text, not one row per `asc_specialist_task` — the same task recurs across occupations).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| specialist_task | TEXT | NO | Distinct ASC task text that was embedded (unique) |
| embedding | VECTOR(384) | YES | 384-dimensional sentence-transformer embedding (all-MiniLM-L6-v2) |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: `specialist_task`
- **Indexes**: `ix_asc_task_embeddings_vec` — HNSW (embedding, cosine ops)
- **Migration**: 026
- **Populated by**: `python -m scripts.build_dwa_asc_bridge`

### dwa_asc_bridge

The semantic DWA↔ASC-task bridge (ADR-011 L2 — the live measured task-level rung; there is no L1 for ASC v3.0). Top-3 nearest O*NET DWA per distinct ASC task text, cosine floor 0.60. 5,033 rows.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| specialist_task | TEXT | NO | ASC task text (joins `asc_task_embeddings.specialist_task` / `asc_specialist_task.specialist_task`) |
| dwa_id | TEXT | NO | Matched O*NET DWA code |
| cosine_similarity | FLOAT | NO | Raw cosine similarity between task and DWA embeddings |
| confidence | FLOAT | NO | Equal to `cosine_similarity` — confidence is never fabricated or blended |
| method | TEXT | NO | Default "semantic" |
| rank | INTEGER | YES | Match rank per task (1 = nearest) |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Indexes**: `ix_dwa_asc_bridge_task` (specialist_task), `ix_dwa_asc_bridge_dwa` (dwa_id)
- **Migration**: 026
- **Populated by**: `python -m scripts.build_dwa_asc_bridge` (`app/services/dwa_asc_bridge.py`, `@tracked_transformation`)
- **Match quality (verified)**: 1,923 of 1,925 distinct ASC task texts matched (99.9%); 1,201 rank-1 matches ≥0.95 cosine similarity; 120 matches within 0.01 of the 0.60 floor

### au_task

The unified AU task layer — one row per (OSCA occupation × task). Attaches DWA-derived exposure to ASC specialist tasks and expands them to their OSCA occupation(s). 20,329 rows.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| osca_code | TEXT | NO | OSCA occupation code |
| anzsco_code | TEXT | YES | Source ANZSCO occupation code |
| task_source | TEXT | NO | `ASC_specialist` \| `OSCA_main` \| `VET_uoc` |
| task_text | TEXT | NO | Task description text |
| percent_of_time | FLOAT | YES | ASC importance weight (`percent_of_time_spent_on_task`), used for the rollup weighting |
| task_level_available | BOOLEAN | NO | Default `false`; `true` iff the task reached a measured rung (L1 or L2) |
| task_level_method | TEXT | NO | Default "NA"; `T2` (semantic bridge match) for all currently-measured rows — there is no L1 for ASC v3.0 |
| confidence | FLOAT | YES | Bridge cosine similarity (max cosine across matched DWAs for this task) |
| matched_dwa_id | TEXT | YES | Top-matched DWA id (by cosine) |
| us_imported_beta | FLOAT | YES | Reserved for the FR-8.9 US-imported occupation-level value; not populated by this compute step |
| au_native_beta | FLOAT | YES | AU-native task exposure — cosine-weighted average of `AVG(dv_beta_derived)` across matched DWAs |
| au_native_beta_soc | FLOAT | YES | Reserved for a later SOC-specific fallback-ladder refinement; not yet populated (decision: global-AVG is primary) |
| beta_source | TEXT | YES | `global_avg` when `au_native_beta` is populated; NULL otherwise |
| us_au_divergence | BOOLEAN | YES | Reserved flag for US vs AU exposure divergence; not yet populated |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Indexes**: `ix_au_task_osca` (osca_code), `ix_au_task_source` (task_source), `ix_au_task_method` (task_level_method)
- **Check constraint**: `ck_au_task_osca_main_no_exposure` — `task_source <> 'OSCA_main' OR au_native_beta IS NULL`; OSCA main tasks are descriptor_only and can never carry task-level exposure (consistent with `osca_main_tasks.descriptor_only`)
- **Migration**: 027
- **Populated by**: `python -m scripts.compute_au_task_layer` (`app/services/compute_au_task_layer.py`, `@tracked_transformation`); requires `asc_specialist_task`, `dwa_asc_bridge`, `eloundou_dwa_scores`, and `osca_anzsco_map` to be loaded first
- **Verified results**: 20,329 rows, 20,322 measured (99.97%, all `task_level_method = 'T2'`), 960 of 1,156 OSCA occupations carry at least one measured AU-native task (the remaining 196 have zero ASC coverage — task-level `NA`, not zero exposure)

### au_occupation_exposure

Task-weighted AU-native exposure rollup per OSCA occupation, with an honest measured-task coverage percentage. 960 rows (one per OSCA occupation with ≥1 `ASC_specialist` task).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INTEGER | NO | Auto-increment primary key |
| osca_code | TEXT | NO | OSCA occupation code (unique) |
| au_task_beta | FLOAT | YES | Time-weighted mean of measured (`au_native_beta IS NOT NULL`) task exposures for this occupation |
| task_count | INTEGER | YES | Total `ASC_specialist` task rows for this occupation |
| measured_task_count | INTEGER | YES | Count with `au_native_beta IS NOT NULL` |
| coverage_pct | FLOAT | YES | `100 * measured_task_count / task_count`, rounded to 1 decimal |
| created_at | TIMESTAMP | NO | Server default NOW() |

- **Primary key**: `id`
- **Unique constraint**: `osca_code`
- **Indexes**: `ix_au_occ_exposure_osca` (osca_code)
- **Migration**: 027
- **Populated by**: `python -m scripts.compute_au_task_layer`
- **Note**: This is a distinct plane from occupation-level zone Beta (`eloundou_occ_scores`/`industry_occupation_profiles`) — it is not recomputed here and remains the near-complete top-down occupation exposure signal even where AU task-level detail is unavailable (ADR-011 L0).

---

## Join Paths

O*NET 8-digit SOC codes are the anchor for the entire data model. Different datasets use different SOC granularities and join strategies.

### Direct FK joins (8-digit SOC)

These datasets use the full 8-digit O*NET-SOC code and have direct foreign keys to `onet_occupations.onet_soc`:

```
onet_occupations.onet_soc  (PK, e.g., "11-1011.00")
  <- onet_task_statements.onet_soc (FK)
  <- onet_task_ratings.onet_soc (FK)
  <- onet_tasks_to_dwas.onet_soc (FK)
  <- onet_work_activities.onet_soc (FK)
  <- onet_sample_titles.onet_soc (FK)
  <- onet_alternate_titles.onet_soc (FK)
  <- onet_emerging_tasks.onet_soc (FK)
  <- eloundou_occ_scores.onet_soc (FK)
```

### Prefix match joins (6-digit SOC)

These datasets use 6-digit SOC codes. Join to O*NET via prefix match:

```sql
-- Microsoft AI, AEI, OEWS all use 6-digit SOC (e.g., "11-1011")
-- Join pattern:
WHERE onet_occupations.onet_soc LIKE ms_ai_applicability_scores.soc_code || '%'
WHERE onet_occupations.onet_soc LIKE aei_job_exposure.occ_code || '%'
WHERE onet_occupations.onet_soc LIKE oews_employment.onet_soc || '%'
```

Tables using 6-digit codes:
- `ms_ai_applicability_scores.soc_code`
- `ms_ai_soc_metrics.soc_code`
- `ms_ai_soc_to_iwas.soc_code`
- `aei_job_exposure.occ_code`
- `oews_employment.onet_soc`
- `industry_occupation_profiles.onet_soc`

### Microsoft IWA metrics to O*NET DWAs

Microsoft IWA-level metrics join to O*NET DWA references via the IWA code (332/332 match):

```sql
ms_ai_iwa_metrics.iwa_code = onet_dwa_references.iwa_id
```

This is the path from Microsoft empirical usage data to specific work activities.

### AEI task penetration to O*NET tasks

AEI task penetration joins to O*NET task statements via task text:

```sql
aei_task_penetration.task = onet_task_statements.task
```

This is a text-match join. The AEI task texts are drawn from O*NET task statements.

### Eloundou DWA scores (derived table)

The `eloundou_dwa_scores` table is derived, not ingested. It joins on both SOC and DWA:

```sql
eloundou_dwa_scores.onet_soc = onet_occupations.onet_soc
eloundou_dwa_scores.dwa_id = onet_dwa_references.dwa_id
```

### Task-to-DWA-to-Exposure path

The canonical path from a task to its exposure score:

```
onet_task_statements (onet_soc, task_id)
  -> onet_tasks_to_dwas (onet_soc, task_id -> dwa_id)
    -> eloundou_dwa_scores (onet_soc, dwa_id -> dv_beta_derived)
```

### AEI temporal snapshots to occupations

AEI temporal snapshots store an array of associated SOC codes:

```sql
-- Use array containment (GIN-indexed):
WHERE aei_task_snapshots.onet_soc_codes @> ARRAY['11-1011.00']
```

### GDPval benchmarks to occupations

GDPval tasks join to O*NET occupations via a soft reference (nullable, no FK constraint). 43 of 44 occupations matched exactly; 1 matched contextually. The `gdpval/occupations/{soc_code}` API endpoint accepts 8-digit O*NET-SOC codes and the UI normalises 7-digit vs 8-digit SOC codes on the frontend before querying:

```sql
gdpval_tasks.onet_soc = onet_occupations.onet_soc  -- nullable, no FK enforced
gdpval_rubric_items.task_id = gdpval_tasks.task_id  -- FK enforced
gdpval_evaluations.task_id = gdpval_tasks.task_id   -- FK enforced (future scores)
```

The `OccupationDetail` schema exposes `gdpval_task_count` and `gdpval_available` derived from a COUNT subquery on `gdpval_tasks` filtered by `onet_soc`.

### AU Census occupation mix to sector

The Census W12A occupation mix joins to sector endpoints via ANZSIC division code:

```sql
abs_census_wpp.anzsic_division_code = industry_occupation_profiles.naics_code
-- where industry_occupation_profiles.region = 'AU'
```

The `GET /sectors/{code}/occupation-mix` endpoint queries `abs_census_wpp` directly by `anzsic_division_code`. The composite sector response blends multiple divisions by their employment-weighted share using `_load_au_occupation_mix()` in `composite_sector.py`.

### ANZSIC subdivisions to classify prompt

`anzsic_subdivisions` does not participate in any join at query time. It is loaded once into memory by `_build_au_sector_list_with_subs()` and formatted into the Claude Haiku 4.5 classify prompt as inline text. No FK relationship to any other table.

### ANZSCO ↔ OSCA employment apportionment (FR-9.1, ADR-010)

`abs_employment` is ANZSCO-keyed at mixed granularity (4-digit unit group and 6-digit occupation). `osca_anzsco_map` provides the official ABS correspondence; `abs_employment_osca` is the derived, fully apportioned OSCA-keyed employment table (soft references, no FK constraints — same pattern as `gdpval_tasks.onet_soc`):

```sql
-- Direct link (unique 6-digit matches only, 1,501 of 2,743 abs_employment rows):
abs_employment.osca_code = osca_occupations.osca_code

-- Full apportionment (all 2,743 rows, both granularities, ADR-010 A0/A1/A3 ladder):
abs_employment_osca.osca_code = osca_occupations.osca_code
abs_employment_osca.anzsco_code = abs_employment.anzsco_code  -- soft reference

-- OSCA to ANZSCO/ISCO correspondence (many-to-many; use for lookups, not employment weighting):
osca_anzsco_map.osca_code = osca_occupations.osca_code
osca_isco_map.osca_code = osca_occupations.osca_code
```

`industry_occupation_profiles.osca_code` was added in migration 023 but is **not yet populated** — it requires the `onet_soc → anzsco → osca` chain with employment apportionment for many-to-many correspondences, which is a future computation step (not a schema migration), so split correspondences apportion correctly rather than double-count.

### AU task-level exposure — the DWA pivot (FR-9.2, ADR-011)

`au_task` attaches DWA-grain exposure to AU-native task structure. There is no direct O*NET-task → OSCA-task join (OSCA main tasks have no DWA linkage); the path runs through the ASC specialist-task layer and the semantic bridge instead:

```sql
-- DWA -> exposure (existing, unchanged):
eloundou_dwa_scores.dwa_id = onet_dwa_references.dwa_id

-- DWA <-> ASC task (semantic, ADR-011 L2 — soft reference, no FK; text-keyed):
dwa_asc_bridge.dwa_id = onet_dwa_references.dwa_id
dwa_asc_bridge.specialist_task = asc_specialist_task.specialist_task

-- ASC task -> OSCA occupation (ANZSCO expansion, reuses the ADR-010 4-digit->OSCA pattern):
asc_specialist_task.anzsco_code = osca_anzsco_map.anzsco_code  -- or a 4-digit prefix match
osca_anzsco_map.osca_code = osca_occupations.osca_code

-- Rollup:
au_task.osca_code = au_occupation_exposure.osca_code  -- one occupation-level row per osca_code
```

US-imported (`au_task.us_imported_beta`) and AU-native (`au_task.au_native_beta`) exposure are stored in separate columns on the same row and must never be blended into a single value — a divergence between them is the publishable signal, not noise (`us_au_divergence`, reserved, not yet populated).

---

## Migration History

| Migration | Description |
|-----------|-------------|
| 001 | onet_occupations (foundational) |
| 002 | aei_task_snapshots, oews_employment, industry_occupation_profiles, industry_crosswalk |
| 003 | dataset_versions, dataset_version_deltas, transformation_log, onet_task_statements, onet_task_ratings, onet_dwa_references, onet_tasks_to_dwas, onet_work_activities, onet_sample_titles, onet_alternate_titles, onet_emerging_tasks |
| 004 | ms_ai_applicability_scores, ms_ai_soc_metrics, ms_ai_iwa_metrics, ms_ai_soc_to_iwas, ms_ai_physical_tasks |
| 005 | eloundou_occ_scores |
| 006 | aei_job_exposure, aei_task_penetration |
| 007 | Add task_pct column to aei_task_snapshots |
| 008 | eloundou_dwa_scores |
| 009 | task_drift_metrics (FR-8.2/8.3 drift velocity and classification) |
| 010 | Add eloundou_beta, ms_ai_applicability, aei_exposure, drift_velocity, drift_classification to industry_occupation_profiles |
| 011 | Add pg_trgm extension + GIN trigram indexes on onet_sample_titles and onet_alternate_titles for fuzzy search |
| 012 | onet_title_embeddings table with pgvector HNSW index for Layer 2 semantic search (66,512 embeddings) |
| 013 | gdpval_tasks, gdpval_rubric_items, gdpval_evaluations — OpenAI GDPval benchmark for FR-8.7 waterline tracking |
| 014 | abs_employment, anzsco_soc_concordance, industry_crosswalk; add region column to industry_occupation_profiles (FR-8.9 AU data integration) |
| 015 | api_request_log table for request telemetry (ADR-007 Phase 1 observability) |
| 016 | Add request_id column + index to api_request_log (ADR-007 Phase 2 correlation IDs) |
| 017 | gptval_benchmarks (FR-8.7 P0a — Epoch AI ECI benchmarks, 39 benchmarks × 32 model eras) |
| 018 | abs_census_wpp — ABS 2021 Census W12A (ANZSIC division × ANZSCO major group, 180 rows) |
| 019 | abs_census_w13 — ABS 2021 Census W13 (ANZSCO sub-major group × Sex, 159 rows) |
| 020 | anzsic_subdivisions — JSA Industry Data Table 3 sub-sector employment (214 rows) |
| 021 | abs_census_subdivision_occ — ABS Census 2021 TableBuilder INDP × OCCP cross-tab (838 rows) |
| 022 | Add INDP granularity level column to abs_census_subdivision_occ |
| 023 | osca_occupations, osca_main_tasks, osca_anzsco_map, osca_isco_map — OSCA 2024 v1.0 backbone (FR-9.1); nullable osca_code added to abs_employment and industry_occupation_profiles |
| 024 | abs_employment_osca — ANZSCO→OSCA employment apportionment (FR-9.1, ADR-010) |
| 025 | asc_specialist_task, asc_core_competency, asc_technology_tool — ASC v3.0 ingest (FR-9.2, ADR-011 B0/B1) |
| 026 | dwa_embeddings, asc_task_embeddings, dwa_asc_bridge — semantic DWA↔ASC bridge infrastructure (FR-9.2, ADR-011 L2) |
| 027 | au_task, au_occupation_exposure — unified AU task layer + AU-native exposure rollup (FR-9.2, ADR-011) |
| 028 | au_occupation_exposure.us_task_beta + divergence — US-vs-AU occupation exposure divergence (FR-9.2) |
| 029 | drop oews_employment→onet_occupations FK — `oews_employment.onet_soc` is a 6-digit BLS SOC, joined to O*NET by prefix (not the 8-digit O*NET-SOC) |
| 030 | drop industry_occupation_profiles→onet_occupations FK — US rows key by 6-digit SOC (same convention as 029) |
| 031 | transformation_log.pipeline_run_id (TEXT, nullable, indexed) — batch correlation key for pipeline runs (ADR-007 Phase 3 Rule 2, FR-8.8) |
