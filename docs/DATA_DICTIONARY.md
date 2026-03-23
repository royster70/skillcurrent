# Data Dictionary

All database tables for the Workforce AI Impact Analysis Platform. Grouped by domain.

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

- **Primary key**: `id`
- **Migration**: 003

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
| created_at | TIMESTAMP | NO | Server default NOW() |
| updated_at | TIMESTAMP | NO | Server default NOW(), auto-update |

- **Primary key**: `id`
- **Unique constraint**: (`naics_code`, `onet_soc`, `release_year`)
- **Indexes**: `ix_industry_occupation_profiles_naics_code`, `ix_industry_occupation_profiles_onet_soc`, `ix_industry_occupation_profiles_dominant_zone`
- **Migration**: 002, columns `eloundou_beta`, `ms_ai_applicability`, `aei_exposure`, `drift_velocity`, `drift_classification` added in 010
- **Populated by**: `compute_industry_profiles` script (FR-8.4)

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
