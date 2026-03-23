---
date: 2026-03-22
status: proposed
agents: []
prd_section: "8.3 Key Technologies"
---

# Toolchain Selection — Non-Obvious Choices and Rationale

## Context

The platform's tech stack (Python 3.12, FastAPI, PostgreSQL 16, React 18) is conventional for a data-intensive web application. This ADR documents the decisions that were NOT obvious — places where a reasonable team could have chosen differently, and why we chose what we did. Obvious choices (Python for data work, React for dashboards) are not re-argued here.

Five decisions warranted explicit recording:
1. Alembic as sole DDL owner (rejecting dbt for transformations)
2. Pencil for design artifacts (not Figma or code-first)
3. Versioned master data with schema-enforced provenance (not audit logs or event sourcing)
4. pgvector in PostgreSQL (not a dedicated vector database)
5. SQLAlchemy + Alembic over Drizzle ORM (not a TypeScript-all-the-way stack)

---

## Decision 1: Alembic as Sole DDL Owner — No dbt

### The choice

All database schema changes — raw tables, derived tables, privacy views, indexes — are managed exclusively through Alembic migrations generated from SQLAlchemy ORM models. No other tool creates or alters tables.

Tier 1 transformations (computing `industry_occupation_profiles` from `oews_employment` + `aei_task_snapshots`) are Python service functions using SQLAlchemy Core expressions, not dbt SQL models.

### Why this was non-obvious

dbt Core is the industry standard for data transformation pipelines. It provides automatic DAG lineage via `ref()`/`source()`, built-in data tests, and a mature templating system. For a platform that ingests five reference datasets and computes derived analytical products, dbt is the natural first choice.

### Why we rejected dbt

The core issue is **dual DDL ownership**. Alembic owns schema for the application's tables (employees, audit_logs, onet_matches). dbt would need to own schema for derived analytical tables (industry_occupation_profiles, task_drift_metrics). This creates:

1. **Schema partitioning overhead** — Must decide which tables belong to which tool, maintain separate schemas or naming conventions, and ensure neither tool touches the other's tables. This is cognitive overhead that scales with the team, not the data.

2. **Async incompatibility** — dbt's `dbtRunner` uses global Python state and is documented as unsafe for concurrent invocations. It cannot be embedded in a FastAPI async process; it must run as a separate batch process (subprocess, Celery worker, or external scheduler). This adds infrastructure for ~5 derived tables.

3. **Dual configuration** — `profiles.yml` for dbt and SQLAlchemy connection URL must stay synchronised. Two test frameworks (pytest + dbt test) for overlapping data quality concerns.

4. **Scale mismatch** — dbt's value compounds with dozens of models, multi-hop dependencies, and incremental materialisation strategies. We have single-hop aggregations from raw to derived tables. The transformation graph is linear: ingest -> drift -> profiles.

### What we do instead

- `@tracked_transformation` decorator on Python service functions logs source tables, target table, row counts, status, and version IDs to `transformation_log` (ADR-001)
- Data quality assertions are pytest tests, not declarative dbt tests
- Lineage is queryable: `SELECT * FROM transformation_log WHERE target_table = 'industry_occupation_profiles'`

### When to revisit

- Derived tables exceed 15 with branching (non-linear) dependencies
- Transformation SQL grows complex (window functions, multi-pass aggregations)
- A second team needs to own transformations independently of the application codebase

**See also:** ADR-001 for the full evaluation of dbt, Hamilton, and OpenMetadata alternatives.

---

## Decision 2: Pencil for Design Artifacts

### The choice

Dashboard and UI designs are created and iterated in Pencil (`.pen` files), stored in the repository alongside code. Design is accessed via MCP tools during AI-assisted development.

### Why this was non-obvious

Figma is the dominant design tool for web applications. A code-first approach (building directly in React with Storybook) is also common for data-heavy dashboards where visual fidelity matters less than data accuracy.

### Why Pencil

1. **Version-controlled design artifacts** — `.pen` files live in the git repository. Design decisions are committed alongside the code they inform. There is no external service to sync, no export/import workflow, and no link rot.

2. **MCP integration** — Pencil's MCP tools (`batch_get`, `batch_design`, `get_screenshot`, `get_guidelines`, `get_style_guide`) enable AI-assisted design iteration within the same Claude Code session used for implementation. A designer (or Claude) can create a dashboard layout in Pencil, validate it with `get_screenshot`, then implement the React components — all in one workflow.

3. **Design system consistency** — `get_style_guide` and `get_variables` provide design guidelines and variables that feed into the component library. This is particularly important for a platform with two distinct dashboard tiers (public Tier 1, privacy-controlled Tier 2) that must share a visual language.

### Trade-offs

- Pencil is less mature than Figma for handoff workflows and collaborative design
- `.pen` files are encrypted — cannot be diffed in git or read with standard tools
- Requires the Pencil MCP server to be running for design work

### When to revisit

- A dedicated designer joins the team and needs Figma-native workflows
- Collaborative design across multiple simultaneous contributors becomes a bottleneck

---

## Decision 3: Versioned Master Data with Schema-Enforced Provenance

### The choice

All five reference datasets (O\*NET, AEI, Eloundou, OEWS, GPTVal) are treated as versioned master data entities. A central `dataset_versions` registry tracks every ingested version. Every derived analytical record carries `NOT NULL` foreign key references to the specific source versions that produced it. Version deltas are pre-computed and stored as queryable analytical products.

### Why this was non-obvious

Most platforms handle reference data with one of two simpler patterns:
- **Overwrite-in-place** with an audit log for change history
- **Version column on the raw table** (`onet_version TEXT`) without FK enforcement on derived tables

Both are simpler. The full versioned master data approach adds schema complexity (FK columns on every derived table), storage growth (retaining all historical versions), and recomputation cost (new source version triggers downstream recomputation).

### Why we chose full provenance

The platform's differentiating analytical value is temporal:
- "How has automation exposure changed between AEI snapshots?"
- "Which tasks crossed the zone threshold when O\*NET moved from 28.0 to 28.1?"
- "How fast is the waterline rising per GPTVal model era?"

These questions require comparing derived results produced from different source versions. With overwrite-in-place, this comparison requires reconstructing historical state from audit logs — expensive, error-prone, and impossible if the audit log schema doesn't capture the right granularity. With version columns but no FK enforcement, derived records can be produced without declaring their sources, making provenance optional rather than guaranteed.

Schema-enforced provenance (`NOT NULL FK` on derived tables) makes it structurally impossible to produce an analytical result without declaring which source data produced it. The database rejects the INSERT, not a code reviewer.

### What this enables

- `dataset_version_deltas` table stores pre-computed diffs between versions — "what changed in O\*NET 28.2?" is a single query, not a reconstruction exercise
- `transformation_log.parameters` JSONB captures version IDs per computation run, creating a two-level audit trail
- Any historical analytical result can be reproduced by re-running the transformation against the archived source versions

**See also:** ADR-002 for the full implementation specification and alternative analysis.

---

## Decision 4: pgvector in PostgreSQL — Not a Dedicated Vector Database

### The choice

Layer 2 of the O\*NET matching cascade stores sentence-transformer embeddings (384-dimensional, all-MiniLM-L6-v2) in PostgreSQL via the pgvector extension and uses cosine similarity search (`<=>` operator) with HNSW indexing.

### Why this was non-obvious

Dedicated vector databases (Pinecone, Weaviate, Qdrant, Milvus) are purpose-built for similarity search and offer features like automatic index tuning, filtered search, and horizontal scaling. For an application where semantic matching is a core capability, a dedicated vector store is the expected choice.

### Why pgvector

1. **Operational simplicity** — The platform already requires PostgreSQL for relational data (employees, audit logs, privacy views, transformation lineage). pgvector adds vector search to the same database instance. No second database to provision, connect, monitor, back up, or secure.

2. **Transactional consistency** — Layer 2 matching results are written to `onet_matches` in the same transaction that reads the embedding similarity scores. With a separate vector database, matching would require a distributed read (vector DB for similarity) followed by a write (PostgreSQL for the match record), introducing eventual consistency.

3. **Scale fit** — The corpus is ~37k O\*NET sample titles + ~1,016 occupation descriptions. At this scale, pgvector's HNSW index provides sub-millisecond search. The scaling advantages of dedicated vector databases (billion-scale, distributed sharding) solve problems 3-4 orders of magnitude beyond our needs.

4. **Privacy boundary** — All data stays in one system with one access control model. A separate vector store would need its own authentication and would store employee job title embeddings (Tier 2 PII-adjacent data) outside the privacy-controlled PostgreSQL boundary.

### Trade-offs

- pgvector's HNSW implementation is less mature than purpose-built alternatives
- No built-in filtered vector search (must combine with SQL WHERE clauses)
- Cannot scale vector search independently of relational query load

### When to revisit

- Embedding corpus exceeds 100k vectors (would need IVFFlat or external HNSW)
- Vector search latency becomes a bottleneck under concurrent matching load
- Multi-modal embeddings or cross-encoder re-ranking require features pgvector doesn't support

---

## Decision 5: SQLAlchemy + Alembic — Not Drizzle ORM

### The choice

The backend uses Python with SQLAlchemy 2.x (ORM + Core) and Alembic for migrations. The ORM and API runtime are both Python.

### Why this was non-obvious

Drizzle ORM is a modern TypeScript ORM with a SQL-like query builder, schema-as-code migration generation (Drizzle Kit), and strong PostgreSQL support including arrays. Adopting Drizzle would unify the stack on TypeScript across frontend (React) and backend, eliminating the language boundary. Single-language stacks reduce cognitive switching, simplify hiring, and allow shared validation logic (e.g., SOC code format checks) between client and server.

Drizzle's query builder is notably closer to raw SQL than most ORMs — a good fit for the analytical queries this platform runs. Its migration tooling (Drizzle Kit) generates SQL from schema definitions in a similar workflow to Alembic's autogenerate.

### Why we rejected Drizzle

The question is not Drizzle vs SQLAlchemy in isolation — it is whether a TypeScript backend runtime is viable for this platform's workload. The backend is not a typical CRUD API; it is a data ingestion and analytical computation engine that happens to serve an API. Four platform-specific requirements make the Python ecosystem non-substitutable:

1. **NLP/embedding pipeline** — Layer 2 matching requires `sentence-transformers` (all-MiniLM-L6-v2) running locally to compute 384-dimensional embeddings for job titles. There is no Node.js equivalent that runs the same model at the same quality without shelling out to a Python subprocess. `@xenova/transformers` (Transformers.js) supports some models via ONNX but with significant quality and performance trade-offs for this specific model architecture.

2. **Statistical computation** — Drift velocity (FR-8.2) uses `scipy.stats.linregress` for per-task linear regression across AEI snapshots. The Node.js statistical ecosystem (simple-statistics, jStat) is functional but far less mature, less tested, and less trusted for analytical workloads that produce numbers clients will make workforce decisions from.

3. **Data ingestion libraries** — O\*NET source files are tab-delimited `.txt` files requiring column mapping, type coercion (preventing SOC codes from being cast to floats), and bulk preparation. Pandas handles this in a few lines with well-understood dtype control. The Node.js CSV ecosystem (csv-parse, papaparse) can parse files but lacks pandas' dtype enforcement, which is critical when `"15-1252.00"` must remain a string.

4. **pgvector integration** — SQLAlchemy has first-class pgvector support via `pgvector-python`: `Vector(384)` column types, HNSW index declarations in ORM models, and the `<=>` cosine distance operator mapped natively. Drizzle's pgvector support requires raw SQL for vector operations, custom column type definitions, and manual index management — undermining the ORM's value for the matching pipeline.

A secondary concern: **`WITH RECURSIVE` CTE maturity**. SQLAlchemy Core has first-class CTE support (`select().cte(recursive=True)`) used for FR-1.3 hierarchy path generation. Drizzle added CTE support more recently, and its recursive CTE handling is less battle-tested for the complex hierarchy queries this platform requires (cycle detection, depth calculation, orphan identification).

### What Drizzle would have been good for

If the platform were a CRUD application (forms, user management, content serving) with no NLP, statistical computation, or complex data ingestion, Drizzle + a TypeScript backend (Hono, Fastify, or Express) would be a strong choice. The single-language advantage is real. The SQL-like query builder is genuinely good. For this platform, those advantages are outweighed by the Python ecosystem dependency.

### When to revisit

- If the NLP pipeline moves to a hosted API (no local model inference), the primary Python dependency weakens
- If Drizzle or an alternative TypeScript ORM gains mature pgvector and recursive CTE support
- If the backend is decomposed into microservices where the API layer (TypeScript) is separated from the computation layer (Python)

---

## Consequences

### Benefits of these combined choices

- **Single database** — PostgreSQL handles relational data, vector search, recursive CTEs, privacy views, and version provenance. One connection string, one backup strategy, one security boundary.
- **Single DDL owner** — Alembic manages all schema. No dual-tool conflicts, no schema partitioning, no synchronisation burden.
- **Single runtime** — Python service functions handle both CRUD and analytical transformations. No separate dbt process, no Celery workers, no external schedulers (at current scale).
- **Version-controlled design** — Pencil `.pen` files and code evolve together in the same repository and review workflow.

### Risks

- **Single-database bottleneck** — If PostgreSQL becomes the performance bottleneck, we've concentrated all load on one system. Mitigated by the modest data scale (largest table ~150k rows) and PostgreSQL's proven ability to handle this workload.
- **Pencil lock-in** — `.pen` files are not interchangeable with Figma or other design tools. Mitigated by the fact that designs are inputs to implementation, not deliverables to external stakeholders.
- **Manual lineage maintenance** — Without dbt's automatic DAG, developers must use the `@tracked_transformation` decorator. Mitigated by code review enforcement and the decorator being the path of least resistance.

## References

- ADR-001: Data lineage and catalog strategy (dbt/Hamilton/OpenMetadata evaluation)
- ADR-002: Reference dataset versioning (master data entity model)
- PRD Section 8.3: Key Technologies
- CLAUDE.md: Tech Stack section
- `docs/TOOLCHAIN.md`: Complete toolchain reference with constraints
