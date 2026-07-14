# Publishing Runbook — taking the platform open-source

How to publish this project as an open-source repo **while keeping a private
line of development**. Records the chosen topology, the exact commands, the
leak guardrails, and the pre-publication cleanup punch-list so the process is
repeatable — not trapped in a chat log.

**Working repo**: `royster70/workforce-ai-platform` (GitHub, **private**)
**Public repo**: _to create_ — e.g. `royster70/workforce-ai-impact` (**public**)
**Code licence**: MIT (decided 2026-07-14) · **Data licence**: CC-BY-4.0 (compilation)
**Companion plan**: `ai_working/open-source-prep-plan.md` (licensing + phases)

---

## 0. The decisive precondition — history is clean

Open-sourcing exposes **all git history**, not just the current tree. A secret
in any past commit is public the moment the repo is — branches don't hide it.

Verified 2026-07-14 (re-run before every visibility change):

```bash
# 1. .env / Data never committed (both must print nothing)
git log --all --oneline -- '.env' '**/.env' 'Data/**'

# 2. no real secret VALUES in any commit (must print CLEAN)
git rev-list --all | while read c; do \
  git grep -IE "sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|(AUTH_TOKEN|API_KEY|SECRET)[[:space:]]*=[[:space:]]*[\"']?[A-Za-z0-9]{24,}" "$c" -- 2>/dev/null; \
done | head -5 && echo CLEAN
```

> The variable *name* `ANTHROPIC_AUTH_TOKEN` appearing in source is fine — that's
> a reference, not a secret. Only assigned *values* matter. History is clean, so
> we do **not** need a second repo to escape a dirty history, nor a
> `git filter-repo` rewrite. The cheap path (publish in place) is available.

---

## 1. Chosen topology — "mirror now, converge later"

Two clean topologies exist; we use a **phased** one that gives private velocity
now and a single clean home at launch.

| Phase | State | Why |
|-------|-------|-----|
| **A — pre-launch (mirror)** | Private repo is the daily driver. A new public repo receives **curated, forward-only** pushes. | Iterate privately; nothing half-finished is ever public while cleaning. |
| **B — at launch (converge)** | Develop in the open: the public repo becomes the working home (or flip the original to public and retire the mirror). | Contributor PRs and your commits reunite in one place — avoids the permanent bidirectional-sync tax. |

**Why not a permanent mirror?** The moment an external contributor opens a PR it
lands on *public*, and you'd have to pull it back into the private upstream and
fight divergence forever. That tax is worth it for a company mirroring a giant
internal monorepo; for a solo maintainer it is not. The mirror is a **staging
mechanism**, not a destination.

**Why not a divergent "clean branch"?** Branches share history (so they hide
nothing) and drift apart (so you re-clean forever). The private/public boundary
is `.gitignore` + config layering, never a branch.

---

## 2. Phase A — set up the mirror

One local clone, two remotes. `origin` stays private; `public` is the mirror.

```bash
# create the PUBLIC repo on GitHub first (empty, no README), then:
git remote add public https://github.com/royster70/workforce-ai-impact.git

# a 'public' integration branch that ONLY ever moves forward
git switch -c public master        # branch off a clean, cleaned-up state

# publish it to the mirror's main
git push public public:main

# keep iterating privately on master — origin never changes
git switch master
```

**Publishing an improvement thereafter** (forward-only — never rewrite public
history once anyone may have cloned it):

```bash
git switch public
git merge --ff-only master         # fails loudly if it can't fast-forward
git push public public:main
git switch master
```

If `--ff-only` refuses (public and master diverged), you rewrote or committed
directly on `public` — reconcile deliberately; do **not** force-push a repo
others may have cloned.

> **Full vs squashed public history** — pushing your real (clean) history is
> simplest and fine. Squash to a single "initial public release" commit only if
> you want a tidy public log; it is cosmetic, not a safety control.

---

## 3. Leak guardrails (what makes the mirror safe)

1. **Tracked files can't leak personal data** — Tier-1 local content is already
   gitignored, so it physically cannot travel to `public`:
   - `.env`, `.env.*` (your token) — `.env.example` is the committed stand-in
   - `Data/` (your raw sources) — the **seed dataset** is the public stand-in
   - `.claude/*` (except `agents/`, `commands/`, `skills/`)
2. **Forward-only `public` branch** is the gate against publishing a WIP commit
   you didn't mean to — you choose what fast-forwards onto it.
3. **Re-run the §0 secret scan before every publish** — cheap insurance.
4. **Redistribution gate for data** — never push a table derived from a
   `redistribution_ok = false` source (AIOE, SML, GDPval-AA, OpenAI leaderboard
   scores). Enforced structurally once the FR-9.5 `signal_source_registry`
   lands; until then, honour `docs/data-sources.md` Tier-3.

---

## 4. Pre-publication cleanup punch-list (topology-agnostic)

Apply on the `public` branch before the first push. None of it is wasted
regardless of topology.

**Legal foundation (blocks first public push):**
- [ ] `LICENSE` — MIT
- [ ] `DATA_LICENSE` — CC-BY-4.0 (data compilation)
- [ ] `NOTICE` / `SOURCES.md` — per-source attribution for every TIER-1 source
      (see `docs/data-sources.md`; auto-generatable once FR-9.5 registry exists)

**Instance-specific → externalize:**
- [ ] Replace hardcoded `C:\Users\...` defaults with `DATA_ROOT` env in
      `src/backend/app/core/config.py` and the ingest scripts
      (`ingest_abs.py`, `ingest_asc.py`, `ingest_osca.py`,
      `build_anzsco_concordance.py`)
- [ ] Confirm `.env.example` documents every required var with safe placeholders

**Framing for a public audience:**
- [ ] Rewrite `README.md` for the four OSS audiences (contributors,
      researchers/citers, self-hosters, casual visitors) with the three
      run-paths (static mirror / docker full stack / add-a-signal)
- [ ] Reframe `CLAUDE.md` from consulting-accelerator voice to public project
      context (the data-model invariants are an asset — keep them, re-voice)
- [ ] `CONTRIBUTING.md` — dev setup, the green gate (black + ruff + mypy
      `--strict`), test + invariant expectations

**Hygiene:**
- [ ] Delete the stray `docs/data-sources.md.txt` (chat-transcript artifact)
- [ ] Confirm `*.zip` gitignored (done) and no design-tool bundles tracked

**Decision already made:** internal working notes (`ai_working/`, design
handoffs) stay **public** — labelled a development journal, not product docs.
ADRs (`ai_working/decisions/`) are a deliberate public asset.

---

## 5. Phase B — converge at launch

When the public repo reflects a state you're happy to develop against:

- **Option 1 (retire the mirror):** make the public repo your working clone;
  archive or keep the private repo as a personal scratch. Contributor PRs and
  your work now share one home.
- **Option 2 (flip the original):** if you'd rather keep the original repo,
  re-run the §0 scan, then GitHub → Settings → Visibility → make public, and
  retire the separate mirror.

Either way, the two-repo dance ends and you develop in the open.

---

## Related

- `ai_working/open-source-prep-plan.md` — full licensing analysis + phased plan
- `docs/data-sources.md` — per-source licence + redistribution classification
- `docs/REBUILD_RUNBOOK.md` — rebuild the environment + data from scratch
- `docs/SETUP.md` — development setup
