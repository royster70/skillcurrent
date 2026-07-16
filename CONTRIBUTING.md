# Contributing to SkillCurrent

Thanks for your interest. This document covers dev setup, the quality gate every
commit must pass, and what we expect from changes. Architecture context lives in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); full environment setup in
[docs/SETUP.md](docs/SETUP.md).

## Dev setup

1. **Prerequisites**: Python 3.12, PostgreSQL 16 with `pgvector` + `pg_trgm`,
   Node 20+ (frontend). Or skip all of this with `docker compose up` from the
   repo root — see the README's "Running it" section.
2. **Backend**:
   ```bash
   cd src/backend
   python -m venv .venv && source .venv/bin/activate   # .venv\Scripts\activate on Windows
   pip install -e ".[dev]"
   cp ../../.env.example .env                          # then edit DATABASE_URL / DATA_ROOT
   alembic upgrade head
   python -m scripts.doctor                            # preflight check
   python -m scripts.restore_seed                       # loads the committed seed dataset
   ```
3. **Data**: `restore_seed.py` loads the committed
   [seed dataset](docs/SEED_DATASET.md) (40 tables, 240k rows) in seconds. For
   the full, real dataset from public sources instead, see
   [docs/INGESTION_RUNBOOK.md](docs/INGESTION_RUNBOOK.md).
4. **Frontend**: `cd src/frontend && npm install && npm run dev`.

## The quality gate (enforced, not advisory)

Install the hooks once — they run **black + ruff + mypy `--strict`** on every commit:

```bash
pip install pre-commit && pre-commit install
pre-commit run --all-files   # must be green before you push
```

Rules that will bite you if you skip reading them:

- **black is the sole formatter** and owns line length (100). ruff lints only.
- **Complexity cap**: ruff C90 enforces `max-complexity=10` on `app/` business
  logic. If a function hits the limit, decompose it — do not raise the threshold
  or add `# noqa: C901` without a justifying comment. `scripts/` and
  `migrations/` are exempt by policy.
- **mypy `--strict`** runs in the pre-commit hook's isolated env, which is not
  your venv — verify against the hook, not just your local `mypy`.

## Tests and data invariants

```bash
cd src/backend
pytest                                   # full suite
pytest tests/test_data_invariants.py -v  # data contracts (must always pass)
pytest tests/test_performance.py -m slow # P95 latency thresholds (ADR-007)
```

- **Data invariants are tests, not comments** (`tests/test_data_invariants.py`).
  If your change touches ingestion or derived tables, run them.
- The hard data-model rules (E0/E1/E2 semantics, the Beta = E1 + 0.5×E2
  coefficient, tier separation, N≥5 privacy suppression, …) are documented in
  [docs/domain-model.md](docs/domain-model.md) and `CLAUDE.md`. They are
  contracts — changes that "optimise around" them will be declined.
- **Performance changes need measurements**: run `pytest -m slow` and check
  `GET /api/v1/admin/slow-queries` before and after. Don't guess.

## Data licensing (matters for any new data source)

Code is MIT ([LICENSE](LICENSE)); the data compilation is CC-BY-4.0
([DATA_LICENSE](DATA_LICENSE)) with per-source attribution in [NOTICE](NOTICE).
Every source is registered in `signal_source_registry` with a
`redistribution_ok` flag, and `scripts/check_redistribution.py` gates what may
ship. A new data source must be registered there with its licence verified —
citation-only sources can inform analysis but never enter a published output.
See [docs/data-sources.md](docs/data-sources.md).

## Commit convention

```
feat(FR-X): ...   fix(FR-X): ...   test(FR-X): ...
refactor: ...     docs: ...        chore: ...
```

Small, focused PRs against `master`. Include tests for behaviour changes, and
update the docs listed in `CLAUDE.md` §Key Reference Docs when your change makes
them stale.
