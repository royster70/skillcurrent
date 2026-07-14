# Platform Toolchain Reference

Complete toolchain for the SkillCurrent. Each entry explains what the tool is, why it was chosen for this platform specifically, how it fits with other tools, and any constraints to follow.

---

## 1. Backend Runtime & Framework

### Python 3.12

**What:** Runtime language for all backend services.

**Why this platform:** The data science and NLP ecosystem (sentence-transformers, pandas, scipy for linear regression, HuggingFace datasets) lives in Python. The platform's core work — ingesting tab-delimited O\*NET files, computing drift velocity via linear regression, running embedding similarity — is dominated by libraries that only exist in Python. The type annotation maturity in 3.12 (`str | None` unions, `Mapped[]` generics) also enables `mypy --strict` without excessive boilerplate.

**Fits with:** SQLAlchemy ORM models, FastAPI async endpoints, Alembic migrations, pytest. All backend tooling is Python-native.

**Constraints:**
- Use `str | None` union syntax (3.10+), not `Optional[str]`
- `mypy --strict` is enforced — all functions must have type annotations
- `black --line-length 100` for formatting, `ruff` for linting

### FastAPI

**What:** Async web framework for the REST API layer.

**Why this platform:** The matching cascade (Layer 2 embeddings, Layer 3 LLM calls) and AEI ingestion from HuggingFace are I/O-bound operations that benefit from async. FastAPI's Pydantic v2 integration provides automatic request/response validation — critical for CSV upload validation (FR-1.2) and ensuring SOC code format compliance. OpenAPI docs are auto-generated, which matters for a platform that will be consumed by consulting teams, not just developers.

**Fits with:** SQLAlchemy async sessions via `asyncpg`, Pydantic v2 for request/response models, OAuth2/JWT for RBAC. Vite dev server proxies `/api` to FastAPI at `localhost:8000`.

**Constraints:**
- All endpoints must have Pydantic request/response models
- OpenAPI docs required for every endpoint (auto-generated via type hints)
- Tier 1 endpoints: no auth required. Tier 2 endpoints: JWT + RBAC via `Depends()`
- Background tasks (recomputation on new dataset version) use FastAPI `BackgroundTasks`, not Celery

### Pydantic v2 (via pydantic-settings)

**What:** Data validation and settings management library.

**Why this platform:** Validates all API boundaries — CSV upload payloads, SOC code formats, exposure score ranges (0.0–1.0), zone classification enums. `pydantic-settings` loads configuration from `.env` with type coercion, keeping secrets out of code.

**Fits with:** FastAPI uses Pydantic models natively for request/response serialisation. Settings class in `app/core/config.py` provides typed access to `DATABASE_URL`, `onet_version`, etc.

**Constraints:**
- Use `BaseSettings` from `pydantic_settings` (not `pydantic`)
- All config via `.env` file — never hardcode credentials

---

## 2. Database

### PostgreSQL 16

**What:** Primary relational database for all platform data.

**Why this platform:** Three specific PostgreSQL capabilities drove this choice:
1. **`WITH RECURSIVE` CTEs** — required for FR-1.3 org hierarchy traversal (`hierarchy_path` generation, cycle detection, leaf node identification)
2. **`pgvector` extension** — Layer 2 matching stores sentence-transformer embeddings and runs cosine similarity search in-database, avoiding a separate vector store
3. **`ARRAY` columns** — `hierarchy_path TEXT[]`, `onet_soc_codes TEXT[]` on AEI snapshots use native array types with GIN indexing

The platform also relies on PostgreSQL views for privacy enforcement (`manager_team_view`, `executive_dashboard_view`) — these are not application-layer filters but database-level access gates.

**Fits with:** SQLAlchemy ORM for models, Alembic for migrations, `asyncpg` driver for async access from FastAPI.

**Constraints:**
- All Tier 2 dashboard queries MUST use privacy views, never raw `employees` table
- `onet_soc` is always `TEXT` format `"XX-XXXX.XX"` — never integer
- Use parameterised queries via SQLAlchemy ORM — never string interpolation

### pgvector

**What:** PostgreSQL extension for vector similarity search.

**Why this platform:** Layer 2 semantic search and the O\*NET matching cascade compute sentence-transformer embeddings for job titles and find the nearest O\*NET occupation via cosine similarity. pgvector keeps this in-database — no separate Pinecone/Weaviate/Qdrant instance to manage. For 66,512 title embeddings (sample + alternate titles), pgvector's HNSW index is more than adequate.

**Fits with:** SQLAlchemy models store `Vector(384)` columns (MiniLM-L6-v2 dimension). Queries use `<=>` cosine distance operator. PostgreSQL handles both relational joins and vector search in the same transaction.

**Constraints:**
- Embedding dimension is 384 (all-MiniLM-L6-v2) — do not change without re-embedding all stored vectors
- Use HNSW index for search, IVFFlat only if dataset exceeds 100k vectors
- Layer 2 confidence threshold: >=0.70 cosine similarity

### asyncpg

**What:** High-performance async PostgreSQL driver for Python.

**Why this platform:** Required by SQLAlchemy's async engine for use with FastAPI's async request handlers. The `postgresql+asyncpg://` connection string in `DATABASE_URL` configures this automatically.

**Fits with:** SQLAlchemy `create_async_engine()`, `AsyncSession`, FastAPI's `Depends(get_db)` pattern.

**Constraints:**
- Connection string must use `postgresql+asyncpg://` prefix
- Alembic migrations use synchronous connections (separate `psycopg2` or `asyncpg` in offline mode)

---

## 3. ORM & Migrations

### SQLAlchemy 2.x (ORM + Core)

**What:** Python ORM and SQL toolkit.

**Why this platform:** The platform uses SQLAlchemy in two modes:
1. **ORM mode** — Mapped classes for all tables (`OnetOccupation`, `AEITaskSnapshot`, `OEWSEmployment`, etc.) with type-safe column definitions using `Mapped[]` and `mapped_column()`
2. **Core expressions** — For Tier 1 transformation functions (ADR-001) where SQL aggregations, joins, and window functions are more natural than ORM queries

This dual usage matters because the platform spans CRUD operations (Tier 2 employee management) and analytical transformations (Tier 1 drift computation) — SQLAlchemy handles both without requiring a second tool.

**Fits with:** Alembic auto-generates migrations from ORM model changes. FastAPI dependency injection provides `AsyncSession`. Models in `app/models/` define the schema; Alembic in `migrations/` manages DDL.

**Constraints:**
- Use SQLAlchemy 2.x `Mapped[]` style, not legacy `Column()` style
- Alembic is the sole DDL owner — never use `Base.metadata.create_all()` in production
- `DeclarativeBase` in `app/db/base.py` is the single base class for all models

### Alembic

**What:** Database migration framework for SQLAlchemy.

**Why this platform:** Alembic is the sole owner of all DDL across both tiers. This is an explicit architectural choice (ADR-001): no other tool (not dbt, not raw SQL scripts) creates or alters tables. This prevents schema drift between the ORM models and the actual database, which would be catastrophic for a platform where privacy views depend on exact column names and FK constraints enforce version provenance (ADR-002).

**Fits with:** Auto-generates migration scripts from SQLAlchemy model diffs. Runs against the same `DATABASE_URL` as the application. Migration history is the authoritative record of schema evolution.

**Constraints:**
- Every schema change requires a migration — no exceptions
- Migration files in `src/backend/migrations/versions/`
- Naming convention: `NNN_description.py` (e.g., `001_foundational_tables.py`)
- Privacy views (FR-7.5) are created in a migration that depends on FR-1.3/FR-1.4 completion
- Never use `--autogenerate` without reviewing the output — it can miss view definitions and custom indexes

---

## 4. Data Ingestion & NLP

### sentence-transformers (all-MiniLM-L6-v2)

**What:** Pre-trained sentence embedding model for semantic similarity.

**Why this platform:** Powers Layer 2 semantic search and the O\*NET matching cascade. When a job title like "AI Solutions Architect" doesn't match any of the 65k+ titles in the dictionary (Layer 1), the platform computes its embedding and finds the nearest O\*NET occupation via cosine similarity. MiniLM-L6-v2 was chosen for its balance: 384-dimensional embeddings (small enough for pgvector at scale), fast inference (CPU-viable, no GPU required), and strong performance on short-text similarity benchmarks.

**Current state:** 66,512 embeddings stored in `onet_title_embeddings` table (sample titles + alternate titles). HNSW index on the embedding column for fast similarity search. Exposed via `POST /api/v1/search/semantic` endpoint and the Search page's Semantic mode (with optional job description textarea).

**Fits with:** Embeddings are stored in pgvector `Vector(384)` columns with HNSW index. Model runs locally — no API calls, no rate limits, no per-query cost. asyncpg vector casts use `CAST(:embedding AS vector)` syntax (not `::vector`).

**Constraints:**
- Model: `all-MiniLM-L6-v2` — do not swap without re-embedding all stored vectors and re-validating matching accuracy
- Embeddings computed on ingest (`python -m scripts.embed_titles`), not at query time
- Target: ~20% of matching volume goes through Layer 2

### pandas

**What:** Data manipulation library for tabular data.

**Why this platform:** O\*NET source files are tab-delimited `.txt` files (5 files, largest ~73k rows). Pandas handles the initial parsing (`read_csv(sep="\t")`), column mapping, and bulk preparation before SQLAlchemy bulk inserts. Also used for AEI CSV ingestion from HuggingFace and OEWS annual data loads. Not used at query time — only during ingestion pipelines.

**Fits with:** Reads source files, transforms to match SQLAlchemy model columns, then bulk insert via `session.execute(insert(...), rows)`.

**Constraints:**
- Ingestion only — never use pandas in API request handlers (use SQLAlchemy queries instead)
- Always specify `dtype` mappings for SOC codes to prevent pandas auto-casting `"15-1252.00"` to float

### scipy (stats)

**What:** Scientific computing library — specifically `scipy.stats.linregress`.

**Why this platform:** Drift velocity calculation (FR-8.2) fits a linear regression to `automation_pct` over time for each O\*NET task across AEI snapshots. `linregress` provides slope, intercept, r-value, and p-value in a single call — exactly what the drift engine needs. No need for scikit-learn or statsmodels for this.

**Fits with:** Called by the drift computation service function after new AEI snapshot ingestion. Results stored in `task_drift_metrics.velocity`.

**Constraints:**
- Requires >=2 AEI snapshots per task to compute slope — tasks with single snapshot get `velocity = NULL`

---

## 5. Master Data & Lineage

### dataset_versions registry (ADR-002)

**What:** Central version registry table tracking every ingested version of every reference dataset.

**Why this platform:** The platform's core analytical value is temporal — comparing drift across AEI snapshots, tracking waterline movement across GPTVal model eras, detecting O\*NET taxonomy changes. Without a unified version registry, provenance tracking would be ad-hoc per dataset. ADR-002 formalises the rule: all five reference datasets (O\*NET, AEI, Eloundou, OEWS, GPTVal) are versioned master data entities. Every derived record carries FK references to the specific source versions that produced it.

**Fits with:** `transformation_log` (ADR-001) records which version IDs were used in each computation. `dataset_version_deltas` stores pre-computed diffs between versions as queryable analytical products.

**Constraints:**
- `UNIQUE (dataset_name, version_key)` — no duplicate versions
- `integrity_hash` (SHA-256) computed on ingest — enables idempotent re-ingestion
- Version data is never deleted — archival to cold storage is permitted; logical deletion is not
- All derived tables must have `NOT NULL` FK columns referencing `dataset_versions`

### transformation_log (ADR-001)

**What:** Metadata table recording every transformation run with source-to-target mapping.

**Why this platform:** Chosen over dbt Core and external catalogs (OpenMetadata, DataHub) because the transformation graph is simple — single-hop aggregations from raw to derived tables. A `@tracked_transformation` decorator on Python service functions provides queryable lineage at zero infrastructure cost. The `parameters` JSONB column captures version IDs, creating a two-level audit trail with `dataset_versions`.

**Fits with:** Decorator wraps transformation service functions. Populated automatically — developers cannot skip lineage tracking without removing the decorator (which is caught in code review).

**Constraints:**
- Every transformation function must use the `@tracked_transformation` decorator
- Status values: `'running'` | `'success'` | `'failed'`
- Failed transformations must record `error_message`

---

## 6. LLM Integration

### Claude Haiku (Layer 3 matching)

**What:** LLM fallback for O\*NET title matching when dictionary and embedding layers fail.

**Why this platform:** <5% of job titles are expected to reach Layer 3. Haiku is chosen for speed and cost — matching is a classification task, not a generation task. Results below 0.60 confidence go to the review queue rather than being auto-accepted.

**Fits with:** Called via Anthropic API. Rate-limited at the application layer. Results stored with `matching_layer = 3`, `method = 'layer_3_llm'`.

**Constraints:**
- Target: <5% of volume reaches Layer 3
- Rate-limited per hour to control costs
- Results <0.60 confidence go to review queue, not best guess
- Retry with exponential backoff (3 attempts max)

### Claude Sonnet (DWA-level exposure scoring via LLM rubric)

**What:** LLM for generating E1/E2 exposure scores at the DWA level using the Eloundou rubric.

**Why this platform:** Eloundou occupation-level scores are loaded (923 occupations), but per-DWA scores are not published. Strategy A (deriving from occupation-level via task importance weighting) covers ~85% of DWAs. Sonnet fills the remaining ~15% by applying the paper's rubric to DWA descriptions (Strategy B).

**Constraints:**
- Store `source = 'llm_rubric'` — flag clearly as generated, not pre-computed
- Never impute from neighbouring DWAs — each DWA scored independently
- Budget ~500 calls/day when activated (well within rate limits)

---

## 7. Authentication & Security

### python-jose (JWT)

**What:** JWT creation and validation library for API authentication.

**Why this platform:** Tier 2 endpoints require role-based access control. JWTs carry `employee_id`, `role` (admin/executive/manager/analyst), and expiration. FastAPI `Depends()` chain validates credentials and enforces role requirements per endpoint.

**Fits with:** `OAuth2PasswordBearer` flow in FastAPI. `passlib[bcrypt]` for password hashing. The JWT payload drives RBAC decisions throughout the privacy layer.

**Constraints:**
- HS256 algorithm, signing key from `JWT_SECRET_KEY` env var (minimum 32 chars)
- Access credential: 60 min expiry. Refresh credential: 7 day expiry
- Tier 1 endpoints do NOT require authentication

### passlib[bcrypt]

**What:** Password hashing library using bcrypt.

**Why this platform:** Standard credential storage for platform user accounts. No special platform-specific rationale — bcrypt is the correct default for password hashing.

**Constraints:**
- Use `CryptContext(schemes=["bcrypt"], deprecated="auto")`

---

## 8. Frontend

### React 18

**What:** UI component library for the dashboard frontend.

**Why this platform:** The platform has two distinct dashboard audiences — Tier 1 (public industry benchmarking) and Tier 2 (privacy-controlled org views). React's component model maps cleanly to this: shared charting components with different data sources and access wrappers. The component tree also makes it natural to enforce that Tier 2 views always render through privacy-aware data hooks.

**Fits with:** Vite for bundling and dev server, TypeScript for type safety, Recharts/D3 for data visualisation, `@testing-library/react` for component testing.

**Constraints:**
- Function components only — no class components
- TypeScript strict mode (`tsc -b`)
- ESLint via `typescript-eslint`

### Recharts / D3

**What:** Charting libraries for data visualisation.

**Why this platform:** The dashboard requires several specific visualisation types:
- **Recharts**: Standard charts — bar charts for zone distribution, line charts for drift velocity over time, area charts for waterline trajectories. Declarative React API for rapid development.
- **D3**: Custom visualisations — the "periodic table of job families" view (FR-6.1), waterline plots with custom task markers, heatmaps of FTE-hours by autonomy x zone. D3 provides the low-level control needed for these non-standard layouts.

**Fits with:** Recharts is a React wrapper around D3 primitives. Both consume the same data shapes from the API. D3 is used directly only when Recharts' declarative API can't express the layout.

**Constraints:**
- Prefer Recharts for standard chart types — only drop to D3 for custom layouts
- All chart components must handle loading/error states
- Data vintage footer (O\*NET version, AEI release, OEWS year) must appear on every dashboard view

### TypeScript 5.5+

**What:** Typed superset of JavaScript.

**Why this platform:** The frontend consumes complex nested data shapes (occupation profiles with zone arrays, drift metrics with temporal series, privacy-filtered employee records). TypeScript catches shape mismatches at compile time rather than at runtime in a client demo.

**Fits with:** Vite transpiles TypeScript. ESLint enforces style. Vitest runs tests. Types can be generated from FastAPI's OpenAPI schema.

**Constraints:**
- Strict mode (`"strict": true` in tsconfig)
- `tsc -b` must pass with zero errors before build
- No `any` types — use `unknown` and narrow

---

## 9. Design System (Pencil + Vite)

### Pencil (.pen files)

**What:** Visual design tool for web and mobile application screens, accessed via MCP server.

**Why this platform:** Pencil is used for designing and iterating on dashboard layouts before implementation — the Tier 1 waterline visualisation, Tier 2 manager/executive views, the "periodic table" job family grid, and the matching review queue UI. Designs are stored as `.pen` files in the repository, keeping design artifacts version-controlled alongside code.

**Fits with:** Designs in Pencil inform React component structure. The MCP tools (`batch_get`, `batch_design`, `get_screenshot`) allow AI-assisted design iteration. Style guides and design variables from Pencil feed into the component library.

**Constraints:**
- `.pen` file contents are encrypted — ONLY access via Pencil MCP tools (`batch_get`, `batch_design`), never via `Read` or `Grep`
- Use `get_guidelines` for design rules before creating new screens
- Use `get_style_guide` for visual consistency across dashboard views
- Validate designs with `get_screenshot` periodically during design iteration

### Vite 6

**What:** Frontend build tool and dev server.

**Why this platform:** Vite provides instant HMR during dashboard development and handles the React/TypeScript/JSX pipeline. The dev server proxy configuration (`/api` -> `localhost:8000`) enables seamless frontend-backend development without CORS gymnastics.

**Fits with:** `@vitejs/plugin-react` for JSX transform, `vitest` shares Vite's config for test environment consistency, proxy config connects to FastAPI backend.

**Constraints:**
- Dev server proxy: `/api` -> `http://localhost:8000` (FastAPI)
- Build: `tsc -b && vite build` — TypeScript check runs first
- No SSR — purely client-side SPA

---

## 10. Dev Workflow & Quality

### black (formatter)

**What:** Python code formatter.

**Why this platform:** Eliminates formatting debates. Configured at line length 100 to accommodate the long SQLAlchemy model definitions and complex query expressions common in this codebase.

**Constraints:**
- Line length: 100
- Run before commit — non-negotiable

### ruff (linter)

**What:** Fast Python linter (replaces flake8, isort, pyflakes).

**Why this platform:** Enforces import ordering, catches unused imports, and flags common issues. Ruff is 10-100x faster than flake8, which matters when linting on every save.

**Constraints:**
- Runs alongside black — ruff handles linting, black handles formatting
- Fix auto-fixable issues with `ruff check --fix`

### mypy --strict

**What:** Static type checker for Python.

**Why this platform:** The data model has specific invariants (E0 >= max(E1, E2), Beta = E1 + 0.5xE2, SOC codes as strings not ints). Strict type checking catches violations at development time. The `Mapped[]` column type annotations in SQLAlchemy models make mypy aware of database column types.

**Constraints:**
- `--strict` mode — no implicit `Any`, no untyped function definitions
- All function signatures must have return type annotations

### ESLint + typescript-eslint

**What:** TypeScript linter for the frontend.

**Why this platform:** Enforces TypeScript-specific rules (no `any`, proper null handling) across dashboard components.

**Constraints:**
- Uses flat config format (`eslint.config.js`)
- `typescript-eslint` recommended ruleset

### Prettier (frontend)

**What:** Code formatter for TypeScript/JSX.

**Why this platform:** Equivalent of black for the frontend — consistent formatting across React components.

---

## 11. Testing

### pytest + pytest-asyncio

**What:** Python test framework with async support.

**Why this platform:** The entire backend is async (FastAPI + asyncpg + SQLAlchemy async sessions). `pytest-asyncio` enables testing async service functions and API endpoints directly. The AAA (Arrange-Act-Assert) pattern is enforced by convention.

**Fits with:** `conftest.py` provides fixtures for database sessions, test data, and authenticated clients. `pytest-cov` measures coverage.

**Constraints:**
- Coverage targets: overall 80%, services 90%, matching/privacy critical paths 95%
- Test naming: `test_<function>_<scenario>_<expected_result>`
- FR reference in docstring: `"""FR-2.1: Layer 1 dictionary lookup"""`
- Integration tests hit a real test database — no mocking the database layer
- `anyio_backend = "asyncio"` fixture in conftest

### vitest

**What:** Frontend test framework.

**Why this platform:** Shares Vite's configuration and transform pipeline, so test environment matches dev/build exactly. Faster than Jest for Vite-based projects.

**Fits with:** `@testing-library/react` for component testing, `jsdom` for DOM simulation.

**Constraints:**
- Coverage target: overall 70%, components 75%, hooks 80%
- Run: `npm run test` (vitest run)

### Playwright (E2E browser tests)

**What:** End-to-end browser testing framework.

**Why this platform:** 18 E2E tests across 4 suites (sectors, search-to-occupation navigation, occupations, drift) verify the full stack — frontend rendering, API integration, and navigation flows. Critical for catching integration regressions (e.g., the search-to-occupation `?selected=` URL param navigation fix).

**Fits with:** Runs against the live dev servers (frontend at 5173, backend at 8000). Config in `playwright.config.ts`, tests in `e2e/` directory. Run via `npm run test:e2e`.

**Constraints:**
- Requires both backend API and frontend dev server running
- Tests are in `src/frontend/e2e/` directory
- `npx playwright install` required on first setup (downloads browser binaries)

### @testing-library/react

**What:** React component testing utilities.

**Why this platform:** Tests dashboard components from the user's perspective (find by role, text, label) rather than implementation details. Important for privacy-controlled views — tests verify that anonymised data renders correctly.

---

## 12. Deferred Infrastructure

These tools are explicitly NOT in the current stack. Each has a defined trigger for reconsideration.

### dbt Core — DEFERRED

**What:** SQL transformation framework with automatic DAG lineage.

**Why deferred:** ADR-001 evaluated dbt Core and rejected it for the current scale. Key reasons:
- Schema ownership conflict with Alembic — would require partitioning DDL responsibility, adding cognitive overhead
- Cannot safely embed in async FastAPI process — uses global Python state unsafe for concurrent invocations
- Two connection configurations, two testing frameworks for overlapping concerns
- Disproportionate overhead for ~5 derived tables with single-hop aggregations

**Reassess when:** Derived tables exceed 15 with branching dependencies, or transformation SQL grows complex (window functions, multi-pass).

### OpenMetadata / DataHub — DEFERRED

**What:** Data catalog and governance platform.

**Why deferred:** ADR-001 evaluated and rejected. Requires Elasticsearch/OpenSearch (2 vCPU, 2 GB RAM minimum), a dedicated database, and its own server (2 vCPU, 4 GB RAM) — dramatically over-provisioned for cataloguing 5 tables.

**Reassess when:** More than 30 tables, more than 3 consuming teams, or compliance audit requires formal data governance tooling.

### Apache Hamilton — DEFERRED

**What:** Micro-framework encoding DAG dependencies in Python function signatures.

**Why deferred:** ADR-001 noted it as the strongest alternative. The current transformation dependency chain is linear (ingest -> drift -> profiles), so a DAG framework adds abstraction without reducing complexity.

**Reassess when:** Transformation graph becomes non-trivial (10+ nodes with branching dependencies).

### Celery / task queue — DEFERRED

**What:** Distributed task queue for background processing.

**Why deferred:** FastAPI `BackgroundTasks` handles current needs (recomputation on new dataset version). Dataset ingestion is infrequent (quarterly AEI, annual O\*NET/OEWS) and completes in seconds to low minutes.

**Reassess when:** Ingestion volume requires true distributed processing, or multiple worker processes are needed.

### Redis — DEFERRED

**What:** In-memory cache and message broker.

**Why deferred:** Tier 1 dashboard queries are fast enough against PostgreSQL with proper indexing (<3s target). No session sharing needed — JWTs are stateless.

**Reassess when:** Dashboard query latency exceeds targets, or rate limiting needs distributed state.

---

## 13. Commit & Collaboration

### Git + conventional commits

**What:** Version control with structured commit messages.

**Convention:** `feat(FR-X):`, `fix(FR-X):`, `test(FR-X):`, `refactor:`, `docs:`, `chore:`

**Why this platform:** FR references in commits create traceability from code changes to functional requirements. This matters for a platform where privacy controls (FR-7) have hard dependencies on hierarchy (FR-1) — commit history shows the implementation sequence.

### Claude Code

**What:** AI-assisted development CLI with project context.

**Why this platform:** Reads `CLAUDE.md` and `AGENTS.md` on start, providing domain-aware assistance. Specialised sub-agents (`fr2-matching`, `fr8-drift-engine`, `privacy-reviewer`, `security-reviewer`) encode platform-specific rules that would otherwise be repeated in every prompt.

**Fits with:** `.claude/agents/` directory contains sub-agent definitions. `.claude/commands/` contains slash commands (`/build-tier1`, `/validate-privacy`). ADRs in `ai_working/decisions/` inform architectural choices.

---

## Tool Interaction Map

```
Source Files (O*NET .txt, AEI .csv, OEWS .csv, GPTVal)
    |
    +-- pandas (parse + transform) --> SQLAlchemy (bulk insert)
    |                                       |
    |                                  Alembic (DDL)
    |                                       |
    |                                 PostgreSQL 16
    |                                  +-- pgvector (Layer 2 embeddings)
    |                                  +-- WITH RECURSIVE (hierarchy)
    |                                  +-- Privacy views (FR-7)
    |                                  +-- dataset_versions (ADR-002)
    |                                  +-- transformation_log (ADR-001)
    |                                       |
    |                                  FastAPI (async, JWT/RBAC)
    |                                       |
    |                              +--------+--------+
    |                              |                 |
    |                         Tier 1 API        Tier 2 API
    |                         (public)          (auth required)
    |                              |                 |
    |                         React 18 + Vite
    |                         +-- Recharts (standard charts)
    |                         +-- D3 (custom visualisations)
    |
    +-- sentence-transformers --> pgvector (Layer 2 matching)
    +-- Claude Haiku/Sonnet --> Layer 3 matching / scoring fallback
```
