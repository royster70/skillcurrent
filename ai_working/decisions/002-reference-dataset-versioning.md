---
date: 2026-03-22
status: proposed
agents: []
prd_section: FR-8.1, FR-8.6, FR-8.7, FR-8.9
---

# Treat Reference Datasets as Versioned Master Data Entities

## Context

The platform ingests five external reference datasets that evolve on independent release cadences:

| Dataset | Source | Release pattern | Current version |
|---------|--------|----------------|-----------------|
| **O\*NET** | onetcenter.org | ~Annual (major), quarterly (minor) | 28.1 |
| **AEI** | HuggingFace (Anthropic) | Irregular, 4+ releases to date | Append-only snapshots |
| **Eloundou 2023** | Published paper | Static (pre-computed DWA scores) | 1.0 |
| **BLS OEWS** | Bureau of Labor Statistics | Annual | Year-keyed |
| **GPTVal** | Longitudinal AI benchmarks | Per model era | Model-era-keyed |

Each dataset feeds derived analytical products — drift metrics, exposure zone classifications, industry profiles, waterline trajectories. When a new version of any source dataset is released, the platform must:

1. Ingest the new version without disturbing prior analytical results
2. Recompute derived products against the new version
3. Enable comparison between analytical results produced from different source versions
4. Maintain full auditability: any derived number must be traceable to the exact source versions that produced it

The CLAUDE.md invariants already encode several of these requirements individually ("AEI snapshots are immutable once ingested", "O\*NET version must be stored with every derived record", "GPTVal scores are versioned by model era"). This ADR formalises the unified strategy that governs all reference datasets.

## Decision

**All source datasets are versioned master data entities. Every derived analytical record carries foreign key references to the specific master data versions that produced it. Version history is never deleted. The delta between versions is itself an analytical product.**

### Core principles

1. **Version as first-class entity** — Each reference dataset has a version registry table that records version identifier, ingestion timestamp, row count, and integrity hash. The version record is the anchor for all downstream references.

2. **Immutable ingested data** — Once a version is ingested, its rows are never modified or deleted. Corrections arrive as new versions. This extends the existing AEI immutability rule to all reference datasets.

3. **Derived records carry version provenance** — Every row in a derived table (e.g. `industry_occupation_profiles`, `task_drift_metrics`) includes foreign keys to the source dataset versions that produced it. This is not optional metadata — it is a structural constraint enforced by the schema.

4. **Version deltas are analytical products** — When a new version of a reference dataset is ingested, the platform computes and stores the delta (added, removed, changed records) as a first-class derived dataset. These deltas power temporal analysis: which tasks were added to an occupation between O\*NET 28.0 and 28.1, how AEI usage patterns shifted between snapshots, how GPTVal capability scores changed across model eras.

5. **No version deletion** — Version records and their associated data are retained indefinitely. Archival to cold storage is permitted; logical deletion is not. Historical reproducibility is a hard requirement.

## Alternatives Considered

### 1. Overwrite-in-place with audit log

Ingest new versions by updating existing rows. Record changes in a separate audit/changelog table.

- **Pros:**
  - Simpler schema — no version foreign keys on derived tables
  - Smaller table footprint (only current data + audit trail)
  - Familiar pattern for CRUD applications
- **Cons:**
  - Breaks reproducibility — cannot regenerate historical analytical results from the database state alone
  - Audit log reconstruction is expensive and error-prone for complex joins
  - Violates the existing AEI immutability invariant, requiring an exception or a redesign
  - Deltas must be reverse-engineered from audit logs rather than queried directly
- **Rejected because:** The platform's core analytical value depends on temporal comparison across dataset versions. Overwrite-in-place destroys the very data that powers drift analysis, waterline tracking, and longitudinal benchmarking.

### 2. Versioned master data with full provenance ✅ SELECTED

Every reference dataset is versioned. Derived records carry FK references to source versions. Deltas are computed and stored as analytical products.

- **Pros:**
  - Full reproducibility — any historical analytical result can be regenerated from the exact source versions
  - Deltas are queryable without reconstruction — enables temporal analysis as a first-class feature
  - Consistent model across all five datasets — no special-casing
  - Schema enforces provenance — impossible to produce a derived record without declaring its sources
  - Aligns with existing invariants (AEI immutability, O\*NET version tracking, GPTVal era versioning)
- **Cons:**
  - Storage growth — every version retains full data, not just diffs
  - Schema complexity — version FK columns on all derived tables
  - Recomputation cost — new source version triggers recomputation of dependent derived tables
- **Selected because:** The analytical value of version comparison outweighs the storage and complexity costs. Storage is cheap; reproducibility and temporal intelligence are the platform's differentiators.

### 3. Event-sourced dataset log

Store every ingested record as an immutable event with a dataset-version header. Materialise current and historical views from the event stream.

- **Pros:**
  - Maximum flexibility — any point-in-time view can be reconstructed
  - Natural fit for append-only semantics
  - Event streams can feed downstream consumers
- **Cons:**
  - Significant infrastructure complexity (event store, materialisation layer, snapshot management)
  - Query performance degrades without pre-materialised views — adds operational burden
  - Overkill for datasets that change on annual/quarterly cadences, not continuous streams
  - Team has no event-sourcing experience — learning curve with no proportional benefit at this scale
- **Rejected because:** Reference datasets are versioned releases, not continuous event streams. The batch-version model matches the actual release patterns of O\*NET, AEI, OEWS, and GPTVal. Event sourcing solves a problem we don't have.

## Implementation

### Version registry table

```sql
CREATE TABLE dataset_versions (
    id              SERIAL PRIMARY KEY,
    dataset_name    TEXT NOT NULL,           -- 'onet', 'aei', 'eloundou', 'oews', 'gptval'
    version_key     TEXT NOT NULL,           -- '28.1', '2025-Q3', 'sonnet-4', etc.
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_count       INTEGER NOT NULL,
    integrity_hash  TEXT NOT NULL,           -- SHA-256 of sorted source data
    source_url      TEXT,                    -- download URL or HuggingFace dataset path
    metadata        JSONB,                   -- dataset-specific metadata (release notes, schema changes, etc.)
    UNIQUE (dataset_name, version_key)
);
```

### Implementation debt: integrity_hash not yet computed

The `integrity_hash` column exists in `dataset_versions` (TEXT, nullable) but is currently stored as NULL for all rows. No hash computation logic has been implemented.

**Risk**: Silent data corruption during re-ingestion would go undetected.

**Resolution required**: Each ingestion script should compute `hashlib.sha256()` over the source file bytes before loading, store the hex digest in `integrity_hash`, and on re-ingestion compare against the stored value — raising a `DataIntegrityError` if they differ.

**Priority**: Medium. The risk is low in a controlled dev environment but must be resolved before any production ingestion pipeline.

### Version FK pattern on derived tables

```sql
-- Example: industry_occupation_profiles carries provenance
ALTER TABLE industry_occupation_profiles
    ADD COLUMN onet_version_id   INTEGER REFERENCES dataset_versions(id),
    ADD COLUMN aei_version_id    INTEGER REFERENCES dataset_versions(id),
    ADD COLUMN oews_version_id   INTEGER REFERENCES dataset_versions(id);
```

All three FKs are `NOT NULL` — a profile row cannot exist without declaring which source versions produced it.

### Version delta table

```sql
CREATE TABLE dataset_version_deltas (
    id                  SERIAL PRIMARY KEY,
    dataset_name        TEXT NOT NULL,
    from_version_id     INTEGER REFERENCES dataset_versions(id),
    to_version_id       INTEGER NOT NULL REFERENCES dataset_versions(id),
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    records_added       INTEGER NOT NULL DEFAULT 0,
    records_removed     INTEGER NOT NULL DEFAULT 0,
    records_changed     INTEGER NOT NULL DEFAULT 0,
    delta_detail        JSONB NOT NULL       -- structured diff: {added: [...], removed: [...], changed: [{field, old, new}, ...]}
);
```

When `from_version_id` is `NULL`, the delta represents the initial load (all records are "added").

### Ingestion workflow

```
1. Download/receive new dataset release
2. Compute integrity hash of source data
3. Check dataset_versions for duplicate (dataset_name + version_key) — skip if exists
4. INSERT into dataset_versions → get version_id
5. Bulk insert raw data rows tagged with version_id
6. Compute delta against previous version → INSERT into dataset_version_deltas
7. Trigger recomputation of dependent derived tables with new version_id references
8. Log in transformation_log (per ADR-001)
```

### Dataset-specific version key conventions

| Dataset | `version_key` format | Example | Notes |
|---------|---------------------|---------|-------|
| O\*NET | `{major}.{minor}` | `28.1` | Follows O\*NET's own versioning |
| AEI | `{YYYY-MM}` or release tag | `2025-06` | Date of HuggingFace release |
| Eloundou | `1.0` | `1.0` | Static; new version only if paper is revised |
| OEWS | `{YYYY}` | `2024` | Annual release year |
| GPTVal | `{model-era}` | `sonnet-4.5` | One version per model generation |

### Integration with ADR-001

The `transformation_log` (ADR-001) records each recomputation triggered by a new source version. The `parameters` JSONB column captures the version IDs used:

```json
{
  "onet_version_id": 3,
  "aei_version_id": 7,
  "oews_version_id": 2,
  "trigger": "new_aei_version"
}
```

This creates a two-level audit trail: `dataset_versions` tracks what data exists; `transformation_log` tracks what computations used it.

## Consequences

**Benefits:**
- Every analytical result is fully reproducible — trace any number back to exact source data versions
- Temporal analysis (drift, waterline tracking) becomes a query over version-tagged derived records rather than a reconstruction exercise
- Version deltas are pre-computed and queryable — "what changed in O\*NET 28.2?" is a single table lookup
- Consistent governance model across all five reference datasets — no special cases
- Schema-enforced provenance — impossible to accidentally produce untracked derived data

**Trade-offs:**
- Storage grows linearly with dataset versions — mitigated by the fact that reference datasets are modest in size (O\*NET ~20k tasks, AEI ~150k rows per snapshot, OEWS ~800 occupations × industries) and versions arrive infrequently
- Schema complexity increases — every derived table gains version FK columns — mitigated by consistent naming convention (`{dataset}_version_id`) and a shared pattern
- New version ingestion triggers downstream recomputation — mitigated by the `transformation_log` decorator (ADR-001) which manages execution and tracks status

**Risks:**
- Delta computation for large datasets could be slow: Low — largest dataset (AEI) is ~150k rows; diff computation is bounded and can run async
- Version key collisions across datasets: Low — `UNIQUE (dataset_name, version_key)` constraint prevents this at the schema level
- Orphaned derived records if recomputation fails mid-way: Medium — mitigated by running recomputation in a transaction and recording failure in `transformation_log`

## Reassessment Triggers

| Trigger | Likely action |
|---------|--------------|
| Storage exceeds 50 GB of retained versions | Implement cold-storage archival for versions older than N years |
| Delta computation exceeds 60s for any dataset | Optimise diff algorithm or move to incremental delta tracking |
| New reference dataset added with continuous (not versioned) release pattern | Evaluate hybrid approach with event-sourced ingestion for that dataset |
| Cross-dataset version compatibility matrix becomes complex | Introduce a "version set" concept grouping compatible versions |

## Success Metrics

- 100% of derived records carry valid version FK references (enforced by NOT NULL + FK constraints)
- Any derived analytical result can be reproduced from source versions within 5 minutes
- Version delta queries return in <1s for all datasets
- Zero version data deleted — retention policy compliance is auditable

## References

- ADR-001: Data lineage and catalog strategy (`ai_working/decisions/001-data-lineage-catalog-strategy.md`)
- CLAUDE.md: Data model invariants (AEI immutability, O\*NET version storage, GPTVal era versioning)
- Domain model: `docs/domain-model.md`
- FR-8 spec: `docs/fr8-role-evolution.md` — temporal analysis and drift pipeline
