<!-- Thanks for contributing! Keep PRs small and focused (see CONTRIBUTING.md). -->

## What & why

<!-- What does this change, and why? Link any related issue. -->

## Checklist

- [ ] `pre-commit run --all-files` passes (black + ruff + mypy `--strict`)
- [ ] Tests added/updated for behaviour changes; existing tests pass
- [ ] Docs updated where this makes them stale (see `CLAUDE.md` §Key Reference Docs)

## Data & licensing (required if you touched data or added a source)

- [ ] No new source ships unless it's registered in
      `src/backend/data/signal_sources/signals.csv` with a **verified licence**
      and `redistribution_ok` flag (see `docs/data-sources.md`)
- [ ] `python -m scripts.check_redistribution` passes — nothing
      `redistribution_ok = false` enters the seed, a static export, or an API
      response
- [ ] No secrets, tokens, or personal data in the diff or in any committed file
