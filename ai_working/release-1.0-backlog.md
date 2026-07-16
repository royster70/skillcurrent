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

## P1 — CI + enforcement (there is no CI today; `.github/` doesn't exist)

6. GitHub Actions:
   - lint job = `pre-commit run --all-files`
   - backend tests (non-DB tests first; full suite once the tiny seed exists)
   - `python -m scripts.check_redistribution` as the pre-publish gate
     (already CI-runnable, exits 1 on violation)

## P2 — seed dataset (prep-plan Phase 3; the "clone → runs" centrepiece)

7. `scripts/build_seed.py` — export only tables whose every contributing source
   is `redistribution_ok = true` (query `signal_source_registry`), **to Parquet**.
   Per the static-smart discovery doc, the seed and the static-site data layer
   are deliberately the *same artifact*. Stamp as-of date + source manifest.
8. `scripts/restore_seed.py` — one-command restore into Postgres.
9. Two tiers: tiny committed sample (CI + quickstart) and full CC-BY snapshot as
   a GitHub Release asset (not in git).
   **Open decision (Roy): tiny-seed scope** — e.g. ~50 occupations / 2 sectors.

## P3 — run-path infrastructure (prep-plan Phase 5)

10. `docker-compose.yml` — pgvector Postgres + backend + frontend; seed restore
    on first boot.
11. `scripts/doctor.py` preflight + dependency tiering (core / `[ingest]` /
    `[ml]` / `[dev]`).
12. README rewrite: four audiences (contributors, researchers/citers,
    self-hosters, visitors), three run-paths (static mirror / docker full stack /
    add-a-signal); reframe `CLAUDE.md` from consulting-accelerator voice
    (keep the data-model invariants — they're an asset).
12b. Decide `docs/REBUILD_RUNBOOK.md`'s public fate: it is a *personal-machine*
    disaster-recovery runbook (Roy's `.claude` memory backup, miniconda path,
    drive layout) that can't be mechanically scrubbed without destroying its
    purpose. Either generalise it into a from-scratch rebuild guide (the
    `$DATA_ROOT` data paths are already neutral) or move the personal-machine
    sections to `ai_working/` (the dev journal is public by decision anyway).

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

## Explicit non-blockers (so they stop looking like blockers)

- **`gdpval_evaluations` = 0 rows** (pending ~$15.70 recharge for the 2-Sonnet
  run). The durability mechanism (committed era CSVs + `ingest_gdpval_evaluations.py`)
  is already merged — ship without the scores, add the CSVs when the run happens.
- **TIER-2 verifications**: ASX company-list terms (full-build-only feature —
  verify only before shipping *that* seed table); AEI geographic release
  (not ingested — irrelevant to this release).
- **AIOE / SML / GDPval-AA** (TIER-3, cite-only): structurally excluded by the
  `check_redistribution` gate; nothing to do.
