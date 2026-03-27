---
date: 2026-03-27
status: accepted
agents: []
prd_section: Tier 1
---

# DataScout — Formalising the Data Acquisition Pattern

## Context

The Tier 1 intelligence pipeline now ingests 10+ external datasets through 14 scripts in `src/backend/scripts/`. Each script was written independently as its dataset was onboarded, following a similar but ad-hoc pattern. The platform has reached a scale where the implicit pattern should be formalised — both to reduce onboarding friction for new datasets and to ensure consistent quality controls.

The scripts handle radically different source types across two dimensions:

**Transport methods observed:**

| Method | Example scripts |
|--------|----------------|
| Manual file placement (user downloads from portal) | `ingest_onet.py`, `ingest_abs.py`, `ingest_eloundou.py` |
| Direct HTTPS download at runtime | `ingest_asx_companies.py` |
| Git clone of public repository | `ingest_microsoft_ai.py` |
| HuggingFace datasets API (parquet) | `ingest_aei.py`, `ingest_aei_temporal.py`, `ingest_gdpval.py` |
| No external file — hardcoded lookup tables | `ingest_crosswalk.py` |
| No external file — derived from loaded data | `compute_drift.py`, `compute_industry_profiles.py`, `derive_eloundou_dwas.py` |

**Parse/transform patterns observed:**

| Pattern | Example |
|---------|---------|
| Tab-delimited flat files → bulk SQL | O*NET (9 `.txt` files via service function) |
| Multi-sheet Excel with non-standard headers | ABS (header at row 7, two sheets with different structures) |
| CSV with concordance chain | ASX (GICS → ANZSIC → NAICS via hardcoded dictionaries) |
| Parquet with nested structures | AEI, GDPval (flatten and normalise from HuggingFace format) |
| Semantic matching via embeddings + pgvector | ANZSCO → SOC concordance (4,694 title variants embedded, nearest-neighbour search) |
| Pure computation from already-loaded tables | Drift metrics (linregress over temporal snapshots), industry profiles (multi-table join + aggregation) |
| Hardcoded reference data | Industry crosswalk (21 NAICS ↔ ANZSIC mappings coded as Python dicts) |

The metadata about each source — license, update frequency, expected row counts, verification queries — is scattered across `INGESTION_RUNBOOK.md`, `CLAUDE.md`, individual script docstrings, and ADRs. There is no single source of truth for "what data do we have and how did it get here."

## Decision 1: DataScout as a Named Architectural Pattern

### The choice

Formalise the data acquisition lifecycle as the **DataScout** pattern, consisting of two distinct activities:

- **Scouting** — Research a potential data source: assess availability, licensing, format, coverage, freshness, and fitness for the platform's analytical needs. Document findings before writing any code.
- **Harvesting** — Build the ingestion script that transports, parses, normalises, and loads the data into PostgreSQL with verification checks.

The name "DataScout" emphasises the discovery-first approach: every dataset begins with investigation and documentation, not with coding.

### Rejected alternative

**Ad-hoc scripts with retroactive documentation.** This is the current state. It works for a solo developer but creates institutional knowledge loss, inconsistent quality checks, and no visibility into what sources were evaluated but rejected.

### Rationale

- The platform already has 14 scripts following a recognisable pattern. Naming it makes the pattern teachable and auditable.
- Scouting and harvesting are genuinely different activities — scouting may conclude that a source is not worth ingesting (e.g., ABS TableBuilder was scouted but deferred due to registration requirements). This decision needs to be recorded even when no script is written.
- A named pattern enables a backlog: sources that have been scouted but not yet harvested can be tracked with clear priority and prerequisites.

## Decision 2: Seven-Stage Pipeline with Pluggable Stages

### The choice

Define the DataScout harvesting pipeline as seven stages, where each stage is optional depending on source complexity:

| Stage | Purpose | Required? |
|-------|---------|-----------|
| **1. DISCOVER** | Identify source, assess availability, licensing, freshness, fitness | Always (scouting phase) |
| **2. ACQUIRE** | Transport data: download, API call, manual placement, scrape | Always (harvesting phase) |
| **3. PARSE** | Extract structured data from raw format: Excel sheets, TSV, JSON, parquet | Always |
| **4. NORMALISE** | Standardise codes, names, types (e.g., ANZSCO 4-digit zero-padding, SOC format `XX-XXXX.XX`) | When source uses non-standard formats |
| **5. CONCORDANCE** | Map between classification systems (GICS → ANZSIC → NAICS, ANZSCO → SOC) | Only when bridging taxonomies |
| **6. LOAD** | Upsert into PostgreSQL: `COPY`, `INSERT ON CONFLICT`, batch via SQLAlchemy | Always |
| **7. VERIFY** | Row counts, coverage checks, invariant assertions, dataset_versions registration | Always |

### Rejected alternative

**Formal base class or framework** requiring all scripts to inherit from an `AbstractDataScout` class with mandatory method overrides. Rejected because the variety of transport and parse patterns is too wide — an Excel multi-sheet parser and a pgvector semantic matcher share almost no code. A forced abstraction would be more scaffolding than substance.

### Rationale

- The stages are a mental model and documentation structure, not a code framework. Each script is free to implement only the stages it needs.
- Simple sources like O*NET TSV skip CONCORDANCE entirely. Complex sources like ABS → ANZSCO → SOC chain multiple CONCORDANCE steps.
- Derived datasets (drift, profiles) skip ACQUIRE and PARSE — they begin at NORMALISE or CONCORDANCE using already-loaded data.
- The seven stages map naturally to sections within a script's docstring, making the pattern self-documenting.

## Decision 3: Metadata Capture in INGESTION_RUNBOOK.md

### The choice

`docs/INGESTION_RUNBOOK.md` remains the canonical registry for all DataScout metadata. Each dataset section must include:

| Field | Description | Example |
|-------|-------------|---------|
| Source name | Dataset identifier | "ABS JSA Occupation Profiles" |
| Source URL | Where to obtain the data | `jobsandskills.gov.au/data/...` |
| License / terms | Usage rights | "Free download, Crown Copyright" |
| Update frequency | How often the source publishes new data | "Biannual (May, November)" |
| Transport method | How the script acquires data | "Manual download from TableBuilder portal" |
| File format | Format and quirks | "Excel, header at row 7, two sheets" |
| Target table(s) | Where data lands in PostgreSQL | `abs_employment` |
| Expected row count | Baseline for verification | 2,743 |
| Verification SQL | Query to confirm successful load | `SELECT COUNT(*) FROM abs_employment` |
| Dependencies | Other datasets that must be loaded first | "Requires: title embeddings" |

### Rejected alternatives

1. **Separate `datascout.yaml` manifest file** — adds a new file to maintain that would drift from the runbook. The runbook is already the operational truth.
2. **Metadata in database tables** — over-engineering for a pipeline with 10-15 sources. The ingestion pipeline runs at most monthly; it does not need runtime metadata queries.

### Rationale

- The runbook already contains most of this information per dataset (sections 4.1–4.13). The decision is to mandate completeness, not to create a new location.
- `CLAUDE.md` retains the summary tables (Data Sources Quick Reference, Data Load Status) as the high-level index. Detailed per-dataset metadata lives in the runbook.
- Script docstrings continue to document usage and file paths but do not duplicate the full metadata — they reference the runbook section.

## Decision 4: Script Naming Convention

### The choice

All scripts in `src/backend/scripts/` follow `{verb}_{source_or_output}.py` where the verb conveys the pipeline stage:

| Verb | Meaning | Stage emphasis |
|------|---------|----------------|
| `ingest_` | Load external data into the database | ACQUIRE → PARSE → LOAD |
| `compute_` | Derive new data from already-loaded tables | NORMALISE → LOAD |
| `build_` | Construct concordance or reference mappings | CONCORDANCE → LOAD |
| `derive_` | Calculate scores or metrics from loaded data | NORMALISE → LOAD |
| `embed_` | Generate vector embeddings from loaded data | NORMALISE → LOAD |
| `verify_` | Standalone verification script (no data mutation) | VERIFY only |

### Rejected alternative

**Renaming existing scripts** to force complete consistency. Rejected because the current names are already referenced in `INGESTION_RUNBOOK.md`, `CLAUDE.md`, ADR-004, ADR-005, and multiple session logs. Renaming would create documentation churn for cosmetic benefit.

### Rationale

- The convention is descriptive, not prescriptive for existing scripts. New scripts must follow it; existing scripts are grandfathered.
- The verb signals intent at a glance: `ingest_` means "needs external files", `compute_` means "no external dependencies", `build_` means "creates cross-references".

## Decision 5: DataScout Backlog

### The choice

Maintain a prioritised backlog of scouted-but-not-harvested data sources. The backlog captures scouting outcomes for sources that were evaluated and either deferred or queued.

### Current backlog

| Priority | Source | Status | Transport | Value | Blocker |
|----------|--------|--------|-----------|-------|---------|
| **P0** | **GPTVal — GDPval model-era evaluations** | **Scouted ✅ — ready to build** | **Compute** (Claude API runner — `compute_gdpval_scores.py`; NOT a download) | Enables FR-8.7 waterline velocity: longitudinal `completion_pct` curves across 4 model eras (sonnet-3.5, 3.7, 4-5, opus-4-5) per occupation, plotted against Eloundou Beta and task drift | Requires Anthropic API key with Sonnet + Opus access; ~$100–145 one-time cost for all 4 eras; schema already in place (migration 013, `gdpval_evaluations`) |
| P1 | ABS Business Counts by ANZSIC sub-division | Scouted | TableBuilder portal (manual) | Sub-sector employment granularity for AU | Requires ABS registration |
| P2 | ABN Lookup API (ANZSIC class per company) | Scouted | REST API (ABR.business.gov.au) | Per-company industry classification for AU company lookup | API key registration required |
| P3 | ISIC Rev.5 concordance tables | Identified | UN Statistics download (HTTPS) | Future-proofs ANZSIC↔NAICS bridge when Rev.5 adopted | Not yet published by UNSD |
| P4 | ABS TableBuilder microdata (occupation × industry cross-tab) | Scouted | TableBuilder portal (manual) | Replaces 50/30/20 approximation with exact AU employment matrix | Registration + manual export per query |
| P5 | Stats NZ employment data | Identified | stats.govt.nz (HTTPS/API) | Extends AU regional pattern to NZ | NZ classification mapping (ANZSCO shared, but industry codes differ) |

**Note on P0 GPTVal**: This is the only "compute acquisition" in the backlog — data does not exist anywhere to download. It is generated by running the platform's own intelligence stack (220 loaded GDPval tasks + rubric items) against a fixed evaluation harness via the Claude API. Scoring calls use Claude Haiku as judge (near-zero cost); generation calls use the target model era. The platform produces its own longitudinal capability measurements rather than consuming third-party benchmarks — a product differentiator.

### Rejected alternative

**Tracking the backlog in a separate project management tool.** Rejected because the backlog is small (5-10 items), changes infrequently, and is most useful when co-located with the architectural decisions that motivate it.

### Rationale

- The backlog makes explicit what would otherwise be tribal knowledge ("we looked at TableBuilder but decided not to use it yet").
- Priority is based on analytical value to Tier 1 intelligence, not implementation difficulty.
- Each entry records enough context for a future developer to pick up the scouting work without repeating the research.

## Implementation

### Current script inventory mapped to pipeline stages

| Script | ACQUIRE | PARSE | NORMALISE | CONCORDANCE | LOAD | VERIFY |
|--------|---------|-------|-----------|-------------|------|--------|
| `ingest_onet.py` | Local TSV files | Tab-delimited, 9 files | SOC format validation | — | Bulk via service function | Row counts per table |
| `ingest_eloundou.py` | Local CSV | Single CSV | — | — | Via service function | Row count, avg Beta |
| `ingest_microsoft_ai.py` | Local CSV (git clone) | 6 CSV files | — | IWA→DWA mapping | Via service function | Row counts per table |
| `ingest_aei.py` | Local CSV (HuggingFace) | 2 CSV files | — | — | Via service function | Row counts |
| `ingest_aei_temporal.py` | Local parquet/CSV (HuggingFace) | Multi-release directories | Model era tagging | — | Via service function | Snapshot group counts |
| `ingest_oews.py` | Local Excel | Single sheet | SOC 6-digit format | — | Via service function | Row count, SOC count |
| `ingest_abs.py` | Local Excel | 2 sheets, header at row 7 | ANZSCO 4-digit padding | ANZSIC name→code lookup | Batch INSERT | Division-level totals |
| `ingest_crosswalk.py` | N/A (hardcoded) | N/A | — | NAICS→ISIC→ANZSIC | INSERT ON CONFLICT | Row count = 21 |
| `ingest_gdpval.py` | Local parquet (HuggingFace) | Nested parquet | SOC code matching | — | Via service function | Task + rubric counts |
| `ingest_asx_companies.py` | HTTPS download (runtime) | CSV with variable headers | — | GICS→ANZSIC→NAICS chain | INSERT ON CONFLICT | Classified vs unclassified |
| `build_anzsco_concordance.py` | Local Excel (2 files) | 2 sheets, skiprows=5 | ANZSCO 4-digit grouping | Embedding + pgvector similarity | INSERT ON CONFLICT | Confidence tier counts |
| `compute_drift.py` | N/A (derived) | N/A | — | — | Upsert via service | Classification distribution |
| `compute_industry_profiles.py` | N/A (derived) | N/A | SOC prefix matching (AU) | — | Upsert via service | Profile counts by region |
| `derive_eloundou_dwas.py` | N/A (derived) | N/A | Importance weighting | Task→DWA distribution | Via service function | DWA score count |
| `embed_titles.py` | N/A (derived) | N/A | — | — | Batch vector INSERT | Embedding count = 66,512 |
| `verify_drift.py` | N/A | N/A | — | — | N/A (read-only) | Invariant assertions |

### Dependency graph (execution order)

```
Phase 1: O*NET (foundation — all other datasets reference onet_occupations)
Phase 2: Independent externals (any order):
         Eloundou, Microsoft AI, AEI, AEI Temporal, OEWS, GDPval
Phase 3: Derivations requiring Phase 1+2:
         derive_eloundou_dwas → compute_drift → compute_industry_profiles (US)
Phase 4: Embeddings (requires O*NET titles from Phase 1):
         embed_titles
Phase 5: AU pipeline (requires embeddings from Phase 4):
         ingest_crosswalk → ingest_abs → build_anzsco_concordance → compute_industry_profiles (AU)
Phase 6: ASX company sectors (independent — can run after migrations)
```

## Consequences

**Benefits:**

- Reproducible pipeline: any developer can rebuild the full database by following the runbook's ordered steps, with each script documenting its own pipeline stages.
- Clear documentation trail: every dataset's provenance, licensing, and quality characteristics are captured in one place.
- Dependency ordering prevents broken builds: the phase structure makes it impossible to run AU profiles before the ANZSCO concordance exists.
- Backlog visibility: sources that were scouted but deferred are recorded with their blocking reasons, preventing repeated investigation.
- Naming convention signals intent: `ingest_` vs `compute_` vs `build_` immediately communicates whether a script needs external files.

**Trade-offs:**

- Some sources are inherently bespoke and resist standardisation. The ANZSCO semantic matching pipeline (`build_anzsco_concordance.py`) shares almost no structural similarity with the O*NET TSV bulk loader (`ingest_onet.py`). The seven-stage model is a documentation aid, not an enforceable framework.
- Over-formalisation risk: requiring full DataScout documentation for a quick 20-row hardcoded lookup table (like `ingest_crosswalk.py`) would add friction disproportionate to the source's complexity. The pattern should be applied proportionally — small sources get lightweight documentation; complex sources get full treatment.
- The metadata registry is manual (Markdown in the runbook), not machine-readable. This is appropriate for 10-15 sources but would need migration to a structured format (YAML, database table) if the source count grows significantly.

## Reassessment Triggers

| Trigger | Likely action |
|---------|--------------|
| Source count exceeds 25 | Consider machine-readable manifest (YAML or DB table) for metadata |
| Second developer joins the data engineering workflow | Validate that the pattern documentation is sufficient for independent onboarding |
| Automated scheduling required (e.g., nightly refresh of ASX data) | Extend pattern with SCHEDULE stage; consider Airflow/Prefect DAG |
| Source freshness SLA needed (e.g., "data must be <30 days old") | Add freshness monitoring to VERIFY stage |
| Tier 2 data sources onboarded (HRIS uploads) | Evaluate whether DataScout applies to user-uploaded data or needs a separate pattern |

## Success Metrics

- Every new dataset ingested after this ADR follows the naming convention and includes all required metadata fields in the runbook
- Full database rebuild from scratch completes successfully by following the runbook without tribal knowledge
- DataScout backlog is reviewed quarterly; at least one P1/P2 source is harvested per quarter
- Zero ingestion scripts exist without a corresponding section in `INGESTION_RUNBOOK.md`
- New team members can identify what data the platform has, where it comes from, and how to refresh it by reading the runbook alone

## References

- ADR-004: Australian data integration (first multi-source concordance pipeline)
- ADR-005: Company-to-industry mapping (ASX ingestion + LLM classification)
- `docs/INGESTION_RUNBOOK.md`: Operational runbook with per-dataset metadata
- `CLAUDE.md`: Data Sources Quick Reference and Data Load Status tables
- `src/backend/scripts/`: All ingestion, computation, and verification scripts
