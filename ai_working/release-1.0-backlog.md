# Release 1.0 backlog — first open-source release

Created 2026-07-16. The prioritised, **verified-against-the-repo** backlog for
the first public release. Scope decision (Roy, 2026-07-16): **full launch
including the static site** — prep-plan Phases 1–5 plus the DuckDB-WASM static
build from `ai_working/discoveries/static-smart-deployment.md`.

Companions: `docs/PUBLISHING.md` (topology + punch-list),
`ai_working/open-source-prep-plan.md` (licensing analysis + phases).

## Already done (verified 2026-07-16 — ahead of CLAUDE.md's prose)

- `LICENSE` (MIT), `DATA_LICENSE` (CC-BY-4.0), `NOTICE` (per-source attribution)
- Eloundou licence verified **MIT** — the foundational exposure layer is redistributable
- FR-9.5 `signal_source_registry` (migration 032) + `scripts/check_redistribution.py`
  gate — **merged to master**
- Quality gate green (black + ruff + mypy `--strict`, pre-commit enforced)
- Git history verified clean of secrets (PUBLISHING.md §0, re-run before every publish)
- README already public-voiced; UI redesign (PR #15) merged — the static-site
  precondition ("build against the redesigned frontend") is satisfied
- P0 hygiene (this branch): stray `docs/data-sources.md.txt` deleted; `.env.example`
  documents every config var; `C:\Users\...` defaults/docstrings neutralised
  (`config.py` default → `./data`); `CONTRIBUTING.md` added

## P0 — publish blockers (small)

| # | Item | Status |
|---|------|--------|
| 1 | Delete stray `docs/data-sources.md.txt` | ✅ this branch |
| 2 | Complete `.env.example` (all config vars + `*_PATH` override note) | ✅ this branch |
| 3 | Neutralise personal paths (`config.py` default, 4 ingest docstrings) | ✅ this branch |
| 4 | `CONTRIBUTING.md` (setup, green gate, tests/invariants, licensing, commits) | ✅ this branch |
| 5 | Re-run PUBLISHING.md §0 secret scan — repeat before **every** public push | recurring |

## P1 — CI + enforcement ✅ done

6. ✅ GitHub Actions (`.github/workflows/ci.yml`): lint (`pre-commit run --all-files`),
   `check_redistribution.py` gate, backend tests (`test_drift.py` +
   `test_onet_ingestion.py` — the only DB-free suites today; widen once more
   land), frontend (eslint + tsc + vitest + build). Verified green on GitHub's
   own runners, not just locally.

## P2 — seed dataset ✅ done (prep-plan Phase 3; the "clone → runs" centrepiece)

7. ✅ `scripts/build_seed.py` — exports every table whose source(s) are
   `redistribution_ok = true` (checked against the live `signal_source_registry`)
   to Parquet, with a `manifest.json` recording exact row/byte counts + the
   sources actually shipped. **Tiny-seed scope resolved**: grounded in the live
   schema (real row counts + FK graph via `information_schema`, not guesswork)
   — full breadth of every occupation/task/exposure/employment table (40
   tables), excluding only the 3 `vector` embedding tables, O*NET's bulkiest
   raw detail tables (superseded by included derived tables), and
   CompanyLookup/ASX (full-build-only + licence-unverified). See
   `EXCLUDED_TABLES` in the script + `docs/SEED_DATASET.md`.
8. ✅ `scripts/restore_seed.py` — one-command restore, preserves original PKs,
   resets serial sequences, `--truncate` for idempotent re-runs.
9. ✅ Tiny committed sample shipped: **40 tables, 240,430 rows, 8.9 MB**,
   committed to git (`src/backend/data/seed/`). The full CC-BY snapshot as a
   separate GitHub Release asset is not built — the committed tiny seed already
   covers the full occupation/sector breadth, so a second, bigger tier hasn't
   been needed yet; revisit if that changes.

## P3 — run-path infrastructure ✅ done (prep-plan Phase 5)

10. ✅ `docker-compose.yml` + `src/backend/Dockerfile` + `src/frontend/Dockerfile`
    (nginx, proxies `/api` to the backend) — pgvector Postgres + backend +
    frontend. `docker-entrypoint.sh` migrates and restores the seed on a
    genuinely empty database only (idempotent across restarts). **Verified
    end-to-end**: built both images, brought the stack up, confirmed the seed
    auto-restored (240,430 rows), hit the API and the frontend-via-nginx proxy,
    confirmed the dashboard renders real seeded data in a browser, and confirmed
    a restart correctly skips re-seeding.
11. ✅ `scripts/doctor.py` preflight (Python/Node versions, `.env`, DB
    reachability, pgvector/pg_trgm extensions, migration status, seed presence,
    Docker availability) + dependency tiering in `pyproject.toml`
    (`core` / `[ingest]` / `[dev]` — no separate `[ml]` tier: sentence-transformers
    is already required by a live endpoint, so there's nothing to split out
    until that becomes optional). Also fixed a latent bug found along the way:
    `anthropic` was imported by a live endpoint but never a declared dependency.
12. ✅ README rewrite: "Who this is for" (four audiences) + "Running it" (three
    run-paths — Docker/native/add-a-signal; the static site is honestly marked
    **planned, not built**, not overclaimed). `CLAUDE.md` reframed: the
    exhaustive session-log "Build Dependency Chain" (branch/PR notes, dollar
    figures) moved to `ai_working/build-history.md`; replaced with a short
    "Build Status" summary. Data-model invariants, privacy rules, engineering
    principles, and reference docs are unchanged — they're the asset, not the
    voice that needed fixing.
12b. ✅ Resolved: `ai_working/REBUILD_RUNBOOK.md` moved out of `docs/` (it's
    Roy's personal-machine disaster-recovery checklist — `.claude` memory
    backup, miniconda path — not a generic setup guide). A banner at its top
    points elsewhere for real contributor/self-hoster setup. All referencing
    docs updated; `check_docs.py` reachability confirmed 0 broken links.

## P4 — static site (in scope for launch)

13. **De-risk spike first** (static-smart doc §spike): export a representative
    Parquet slice via the seed builder; DuckDB-WASM in a throwaway Vite page;
    reimplement ONE analytical view (sector composite rollup); measure
    bundle/cold-start/latency/bytes vs the JSON approach. Real numbers before
    committing the pipeline to either substrate.
14. Static export pipeline: JSON for hot/SEO views + Parquet/DuckDB-WASM for
    analytical; `VITE_DEPLOYMENT_MODE=cdn|full`; client-side search (precomputed
    top-K neighbours + transformers.js for free-text); deploy to GitHub
    Pages/Cloudflare.
15. Company-classify seam: precomputed ASX lookup shipped static; BYO-API-key or
    a single edge function for arbitrary free-text.

## P5 — publish mechanics (PUBLISHING.md §2)

16. Create public repo (`royster70/skillcurrent`); `public` forward-only branch;
    first curated push; converge at launch (Phase B).

## P6 — ongoing documentation maintenance (post-launch; supports the open-source shift)

17. **Scheduled content-drift review** (not yet built — discussed 2026-07-16).
    What exists today is event-driven and structural only: `scripts/check_docs.py`
    catches broken links + orphaned docs on every commit (pre-commit) and every
    PR (CI); the `docs-updater` agent exists but only runs when someone
    remembers to invoke it after a feature. Neither catches **content drift** —
    stale row counts, an architecture description that's fallen behind the
    code, `CLAUDE.md`'s "Build Status" going out of date. That gap gets worse
    once external contributors are merging PRs without knowing the
    `docs-updater` convention exists.
    Proposed shape: a **weekly, review-only** scheduled routine (via the
    `schedule` skill/cron, not `/loop`) that diffs the week's merged commits
    against the docs they touch and flags likely-stale sections for a human
    to accept/dismiss — not auto-editing. Keep it review-only to avoid two
    failure modes: an agent silently "fixing" docs into something wrong, and
    a routine noisy enough that its flags get ignored.
    **Open decisions for Roy**: exact cadence (weekly vs. per-N-PRs), which
    docs are in scope (README/CLAUDE.md/docs/ vs. also ai_working/), and
    where flagged drift should land (a GitHub issue, a chip in-session, a
    standing doc).

## Explicit non-blockers (so they stop looking like blockers)

- **`gdpval_evaluations` = 0 rows** (pending ~$15.70 recharge for the 2-Sonnet
  run). The durability mechanism (committed era CSVs + `ingest_gdpval_evaluations.py`)
  is already merged — ship without the scores, add the CSVs when the run happens.
- **TIER-2 verifications**: ASX company-list terms (full-build-only feature —
  verify only before shipping *that* seed table); AEI geographic release
  (not ingested — irrelevant to this release).
- **AIOE / SML / GDPval-AA** (TIER-3, cite-only): structurally excluded by the
  `check_redistribution` gate; nothing to do.
