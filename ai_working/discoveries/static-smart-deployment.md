# Discovery — "smart static" deployment without a database

**Status:** exploratory / parked. **Sequenced AFTER the Waterline UI redesign**
(the static substrate should be built against the redesigned frontend, not the
current one). Not an ADR yet — this records the option space so it isn't lost.

## Why this note exists
While planning the open-source static/CDN build (brief §6, `docs/PUBLISHING.md`),
the question came up: *how smart can the no-server build be?* A shared suggestion
(agentic retrieval — give an agent SQL tools over live Postgres) prompted a
useful reframe.

## The reframe — two different questions
- **"Agentic retrieval over live Postgres"** solves for a *transactional app with
  mutable, user-specific state* (task-state checkpoints, audit logs, "records for
  user X", ACID, concurrency).
- **SkillCurrent Tier 1 has none of those** — it is a *read-only, precomputed,
  bounded corpus* (~1,016 occupations, ~19k tasks, sector rollups). So that
  advice belongs to the **full / self-host (Postgres) build**, not the static one.
- The static question is a **data-shipping** problem, not a retrieval-agent one.

## The substrate ladder (increasing power, all server-less)
1. **Pre-rendered JSON bundles** (current plan) — great for direct lookups +
   SEO; loses relational/aggregate power (cross-cutting filters ship big arrays).
2. **SQLite-WASM** (`sql.js` / `sqlite-wasm`) — ship a read-only `.sqlite`; real
   SQL in the browser (joins, filters, GROUP BY). Whole file loads into memory
   (fine at our scale) + a WASM cold-start.
3. **DuckDB-WASM + Parquet on a CDN** (the smart one) — DuckDB runs as WASM and,
   via `httpfs`, queries Parquet on any CDN using **HTTP range requests** (fetches
   only the byte ranges a query touches). Full analytical SQL (aggregations,
   windows, joins) client-side, scaling past in-memory limits. The pattern behind
   evidence.dev / Observable data apps.

**Recommended shape = hybrid** (maps onto the existing `VITE_DEPLOYMENT_MODE`
flag): JSON for hot, simple, SEO-able direct views; DuckDB-WASM/Parquet for
analytical + cross-cutting queries.

## The two features that resist going static
- **Semantic search** (`pgvector` + `onet_title_embeddings`, all-MiniLM-L6-v2):
  - `transformers.js` runs the *same* all-MiniLM-L6-v2 model (ONNX) in-browser →
    embed queries client-side, no drift from server behaviour.
  - Search itself: brute-force cosine over a shipped matrix (trivial for
    occupations/tasks; for 66k titles, int8-quantise ~25 MB or a WASM ANN index —
    hnswlib-wasm / Voy).
  - **Cheapest smart option:** precompute **top-K nearest neighbours per entity**
    offline → ship as JSON. Covers "similar to X" with zero runtime vector math;
    only free-text search needs runtime embedding. (Smarter than the plan's
    current "degraded prefix index" for the CDN build.)
- **Company classification** (Claude Haiku, paid API — can't ship a key):
  - precompute the known ASX list → static lookup (instant, no runtime LLM);
  - BYO-API-key for arbitrary free-text (client→Anthropic; fine for self-hosters);
  - OR a single edge function (Cloudflare Worker) as the ONLY dynamic seam.

## Synergy with FR-9.5 + the seed dataset
The FR-9.5 `redistribution_ok=true` filter already decides which tables may ship.
**Export those to Parquet** (columnar; what DuckDB-WASM wants) and the *seed
dataset* and the *static-site data layer* become the **same artifact** — and the
registry gate guarantees no cite-only table leaks into the CDN. Tighter than
treating "seed" and "static export" as separate efforts.

## Where the live-Postgres advice still applies
The **full / self-host build** keeps Postgres; there, agent-as-controller with
SQL tools + progressive disclosure is a reasonable enhancement for the LLM-query
features (classify, future natural-language exploration). Not the road to
no-server.

## The de-risking spike (when this is picked up, post-redesign)
1. Export a representative slice (`industry_occupation_profiles` + `au_task` +
   `eloundou_occ_scores`) to Parquet via the seed builder.
2. Drop DuckDB-WASM into a throwaway Vite page; reimplement ONE analytical view
   (e.g. the sector composite rollup) as a client-side DuckDB query over Parquet.
3. Measure: bundle/WASM size, cold-start ms, query latency, total bytes fetched
   (range requests) vs. the equivalent JSON-download approach.

Outcome → real numbers on JSON-vs-DuckDB for our data shapes before committing
the static pipeline to either.

## Related
- `docs/PUBLISHING.md` — open-source topology + static-build functionality tiering
- `ai_working/open-source-prep-plan.md` — Phase 3 (seed) + Phase 4 (static site)
- FR-9.5 `signal_source_registry` — the redistribution filter that feeds the seed
