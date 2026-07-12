# Architecture Decision Records (ADRs)

Each ADR captures one significant decision — the context, the choice, the alternatives rejected, and the consequences. They are the "why" behind the schema and pipeline; read the relevant one before changing the area it governs.

Numbering note: the first three use `00N-`, the rest `ADR-00N-` (historical; not significant).

| ADR | Status | Decision |
|-----|--------|----------|
| [001](001-data-lineage-catalog-strategy.md) | proposed | Use Python/SQLAlchemy for Tier 1 transformations; defer a data catalog to a scale trigger |
| [002](002-reference-dataset-versioning.md) | proposed | Treat reference datasets as versioned master-data entities (`DatasetVersion`, integrity hashing) |
| [003](003-toolchain-selection.md) | accepted | Toolchain selection — the non-obvious choices and their rationale |
| [004](ADR-004-australian-data-integration.md) | accepted | Australian employment data — schema, matching, and distribution strategy |
| [005](ADR-005-company-industry-mapping.md) | accepted | Company→industry mapping — ASX lookup, LLM classification, concordance |
| [006](ADR-006-datascout-acquisition-pattern.md) | accepted | DataScout — formalising the external-data acquisition pattern |
| [007](ADR-007-performance-instrumentation.md) | accepted | Performance instrumentation & observability (timing, correlation IDs, slow-query surfacing) |
| [008](ADR-008-census-subdivision-classification.md) | accepted | Census integration & subdivision-enriched company classification |
| [009](ADR-009-llm-evaluation-methodology.md) | accepted | LLM classification evaluation methodology |
| [010](ADR-010-anzsco-osca-employment-apportionment.md) | accepted | **ANZSCO→OSCA employment apportionment** — mirror the ABS convention, apportion by held counts, never invent proportions (FR-9.1) |
| [011](ADR-011-au-task-exposure-dwa-pivot-ladder.md) | accepted | **AU task-level AI-exposure via a DWA-pivot decision ladder** — semantic bridge is the live measured rung; availability ≠ confidence (FR-9.2) |

**By theme:**
- *Data foundations & provenance* — 001, 002, 006
- *Toolchain & platform* — 003, 007
- *Australian data & the FR-9 AU-native layer* — 004, 008, 010, 011
- *Classification & evaluation* — 005, 008, 009

See also `docs/ARCHITECTURE.md` (how these decisions fit the whole system) and `docs/domain-model.md` (the invariants several of them establish).
