# External Data Sources Registry

Local data directory: `$DATA_ROOT` (set via env / `.env`, outside the git repo, not committed — see `.env.example`). Every source below is either LOADED (ingested into the database — see `docs/DATA_DICTIONARY.md` and `docs/INGESTION_RUNBOOK.md`) or ACQUIRED (file present on disk, no ingestion script/pipeline stage yet).

---

## OSCA 2024 v1.0 (ABS)

| Field | Value |
|-------|-------|
| Publisher | Australian Bureau of Statistics (ABS) |
| Dataset | Occupation Standard Classification for Australia (OSCA) 2024 Version 1.0 |
| Release date | 6 Dec 2024 |
| URL | https://www.abs.gov.au/statistics/classifications/osca-occupation-standard-classification-australia/2024-version-1-0 |
| Licence | CC BY 4.0 |
| Redistribution OK | Yes (CC BY 4.0 — attribution required) |
| Local path | `$DATA_ROOT\OSCA\` |
| Files | `OSCA structure.xlsx`, `OSCA Category Descriptions.xlsx`, `OSCA correspondence tables v2.xlsx`, `OSCA index of principal titles alternative titles and specialisations.xlsx` |
| Status | LOADED (first 3 files; the index-of-titles file is acquired but not yet ingested) |
| Used by | FR-9.1 — `osca_occupations`, `osca_main_tasks`, `osca_anzsco_map`, `osca_isco_map`, `abs_employment_osca` (see ADR-010) |
| Ingestion | `python -m scripts.ingest_osca` + `python -m scripts.compute_osca_employment` |

## Australian Skills Classification (ASC) v3.0 (JSA)

| Field | Value |
|-------|-------|
| Publisher | Jobs and Skills Australia (JSA) |
| Dataset | Australian Skills Classification (ASC) v3.0 — specialist tasks, core competencies, technology tools |
| URL | https://www.jobsandskills.gov.au/data/australian-skills-classification |
| Acquisition method | `runapp-aus/strayr` R package `.rda` files, read with `pyreadr` (declared dependency, `pyreadr>=0.5` in `pyproject.toml`) — not a direct CSV/Excel download |
| Licence | CC BY 4.0 |
| Redistribution OK | Yes (CC BY 4.0 — attribution required) |
| Local path | `$DATA_ROOT\ASC\` |
| Files | `asc_specialist_tasks.rda`, `asc_core_competencies.rda`, `asc_technology_tools.rda` (also acquired but not read by the ingest script: `asc_core_competencies_descriptions.rda`, `asc_descriptions.rda`) |
| Status | LOADED — `asc_specialist_task` (10,963), `asc_core_competency` (6,000), `asc_technology_tool` (1,989) |
| Used by | FR-9.2 (ADR-011) — the AU-native task-level exposure carrier; specialist tasks were built from O*NET DWAs (JSA methodology 21.2/23.1) but the published files carry no source-DWA column (`source_dwa_id` stays NULL — B0 spike finding), so exposure attaches via the semantic `dwa_asc_bridge` (migration 026) rather than a direct lookup |
| Ingestion | `python -m scripts.ingest_asc` |

## JSA "Our Gen AI Transition" (Aug 2025)

| Field | Value |
|-------|-------|
| Publisher | Jobs and Skills Australia (JSA) |
| Dataset | "Our Gen AI Transition" occupation-level augmentation/automation exposure scores |
| Release date | August 2025 |
| URL | jobsandskills.gov.au (exact report/download URL not verified in this session — record before next ingestion) |
| Licence | CC BY |
| Redistribution OK | Yes (CC BY — attribution required) |
| Local path | `$DATA_ROOT\JSA-GenAI\Occupations_8.csv` (714 ANZSCO-keyed occupation rows) |
| Columns (verified) | ANZSCO unit code, ANZSCO unit title, Occupation matrix group, Augmentation exposure score, Automation exposure score, Rate of skill change, Historical occupation mobility 2021-2022, High-fit transition rate, Hybridisation potential, Specialisation potential, Share of job ads that are entry level |
| Status | LOADED — `jsa_genai_exposure` (357 rows, migration 035), `scripts/ingest_jsa_genai.py`. 714 source rows dedupe to 357 (each occupation appears twice — "All occupations" + its specific matrix group — with identical scores). |
| Use | The platform's **first published AU-native exposure signal**. Surfaced on `GET /api/v1/au/occupations/{osca}` as `jsa_native` — kept SEPARATE from the bridge-derived `au_task_beta`, never blended (augmentation/automation are each their own 0–1 scale, not β). |

## AEI Geographic Release (Anthropic Economic Index)

| Field | Value |
|-------|-------|
| Publisher | Anthropic |
| Dataset | Anthropic Economic Index — geographic release (third AEI report), Claude.ai usage data by country/US state, incl. Australia (AUS) |
| Data collection window (verified from `data_documentation.md`) | 2025-08-04 to 2025-08-11 |
| Release label cited at acquisition time | `release_2025_09_15` — not independently verified against the HuggingFace release tag in this session; the collection window above is the only date confirmed from the local file |
| URL | https://huggingface.co/datasets/Anthropic/EconomicIndex |
| Licence | Verify CC BY vs MIT **per release** — do not assume the licence carries over from the labour-market/temporal AEI releases already ingested (which are CC BY) |
| Redistribution OK | Pending licence verification for this specific release |
| Local path | `$DATA_ROOT\AEI\geographic\` |
| Files | `aei_enriched_claude_ai_2025-08-04_to_2025-08-11.csv` (~26.8 MB), `data_documentation.md` |
| Status | ACQUIRED — not yet ingested. No ingestion script exists yet. |
| Planned use | Country-level AU exposure/usage signal, complementary to existing `aei_job_exposure`/`aei_task_penetration`/`aei_task_snapshots` (which are US/global-scoped) — not yet wired into any FR |

## AIOE — AI Occupational Exposure (Felten)

| Field | Value |
|-------|-------|
| Publisher | Felten, Raj & Seamans (AI Occupational Exposure) |
| Dataset | AIOE Data Appendix |
| URL | Not verified in this session — source recorded from local file only |
| Licence | **Citation-only — NOT CC BY** |
| Redistribution OK | **No — redistribution-restricted.** Citation-only licences typically permit academic/research use with attribution but do not grant redistribution rights. Do not bundle, republish, or serve this dataset's raw content through any platform API or export without confirming terms. |
| Local path | `$DATA_ROOT\AIOE\AIOE_DataAppendix.xlsx` |
| Status | ACQUIRED — not yet ingested. No ingestion script exists yet. |
| Planned use | Theoretical/citation-based AI exposure baseline, complementary to Eloundou — not yet wired into any FR. **Before ingesting, confirm the licence permits storing derived scores in the platform database and serving them via API; the citation-only status may restrict this.** |

## Eloundou 2024 — "GPTs are GPTs" occupation exposure (OpenAI)

| Field | Value |
|-------|-------|
| Publisher | Eloundou, Manning, Mishkin & Rock (OpenAI) |
| Dataset | Occupation-level AI-exposure scores (E0/E1/E2, dual GPT-4 `dv_` + human raters), 923 occupations |
| Paper | Science 384:1306–1308 (2024); working paper arXiv 2303.10130 |
| Source repo | **`openai/GPTs-are-GPTs`** (GitHub) — the ingested file `occ_level.csv` lives in that repo's `data/` directory |
| Licence | **MIT** (verified 2026-07-14 via GitHub API — `openai/GPTs-are-GPTs` `LICENSE` = "MIT License, Copyright (c) 2024 OpenAI") |
| Redistribution OK | **Yes** — MIT permits use, modification, redistribution with attribution. This is FOUNDATIONAL: the whole exposure/β layer and every table derived from it inherit this, so the redistributable-data story holds to its foundation. |
| Local path | `occ_level.csv` (dir set by `DATA_ROOT`) |
| Status | LOADED — `eloundou_occ_scores` (923); DWA-level derived via Strategy A → `eloundou_dwa_scores` (17,537) |
| Used by | The core exposure signal (β = E1 + 0.5×E2) behind zones, the matrix, drift, US/AU task exposure |
| Ingestion | `python -m scripts.ingest_eloundou` (`source_url` recorded as arXiv 2303.10130) |

## ASX Listed Companies + GICS (CompanyLookup) — RESTRICTED, not redistributable

| Field | Value |
|-------|-------|
| Publisher | ASX (company list) / MSCI + S&P Global (GICS classification) |
| Dataset | ASX listed companies mapped company → GICS industry group → ANZSIC/NAICS sector (`asx_company_sectors`) |
| Source | `https://www.asx.com.au/asx/research/ASXListedCompanies.csv` (free download) + hardcoded GICS→ANZSIC concordance |
| Licence | **Proprietary.** GICS is licensed IP of MSCI + S&P Global; the ASX list carries ASX terms of use. |
| Redistribution OK | **No** (`asx_gics`, `redistribution_ok = false`). The per-company GICS assignment — and the ANZSIC/NAICS codes **derived from it** — are licensed classifications, not freely redistributable. |
| Registry | `signal_source_registry` key `asx_gics` (enforced by `scripts/check_redistribution.py`) |
| Status | LOADED in the full/self-host build only. **Excluded from the seed and the static site.** |
| Used by | The CompanyLookup feature (FR-8.5) — **full-build-only.** Its classify half also needs a paid Claude key. Self-hosters fetch the ASX CSV themselves; nothing is redistributed. |
| Ingestion | `python -m scripts.ingest_asx_companies` (downloads the CSV at ingest time) |

---

## Established sources (loaded, cross-reference)

For O*NET, Eloundou, Microsoft "Working with AI", AEI labour market/temporal, BLS OEWS, ABS/JSA employment, ABS Census 2021, Epoch AI ECI, and OpenAI GDPval — see the "Data Sources Quick Reference" section of `CLAUDE.md`, which is kept as the single source of truth for those entries. This registry (`docs/data-sources.md`) currently documents the FR-9.1 OSCA backbone source, the FR-9.2 ASC v3.0 source, plus the three newly acquired-but-not-yet-ingested sources (JSA Gen AI, AEI geographic, AIOE); expand it with the established sources' URL/version/licence/redistribution_ok fields the next time this file is touched, to avoid the two documents drifting.
