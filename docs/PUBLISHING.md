# Publishing Runbook — taking the platform open-source

How to publish this project as an open-source repo **while keeping a private
line of development**. Records the chosen topology, the exact commands, the
leak guardrails, and the pre-publication cleanup punch-list so the process is
repeatable — not trapped in a chat log.

**Working repo**: `royster70/workforce-ai-platform` (GitHub, **private**)
**Public repo**: _to create_ — e.g. `royster70/skillcurrent` (**public**)
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
git remote add public https://github.com/royster70/skillcurrent.git

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
3. **Secret scan — now automated.** The §0 history scan runs as the CI
   `secret-scan` job (`.github/workflows/ci.yml`) on every push/PR, so it can't
   be forgotten. Still safe to run §0 by hand before a first publish.
4. **Redistribution gate for data** — never push a table derived from a
   `redistribution_ok = false` source (AIOE, SML, GDPval-AA, OpenAI leaderboard
   scores). Enforced structurally by the FR-9.5 `signal_source_registry`
   (migration 032) + `scripts/check_redistribution.py` — run the check before
   every publish (exit 1 on violation).

---

## 4. Pre-publication cleanup punch-list (topology-agnostic)

Apply on the `public` branch before the first push. None of it is wasted
regardless of topology.

**Legal foundation (blocks first public push):**
- [x] `LICENSE` — MIT (2026-07-14)
- [x] `DATA_LICENSE` — CC-BY-4.0 (data compilation) (2026-07-14)
- [x] `NOTICE` — per-source attribution for every TIER-1 source (2026-07-14;
      hand-maintained until auto-generated from the FR-9.5 registry)

**Instance-specific → externalize:**
- [x] Replace hardcoded `C:\Users\...` defaults with `DATA_ROOT` env in
      `src/backend/app/core/config.py` and the ingest scripts
      (`ingest_abs.py`, `ingest_asc.py`, `ingest_osca.py`,
      `build_anzsco_concordance.py`) (2026-07-16 — config default now `./data`,
      docstring examples use `$DATA_ROOT/...`)
- [x] Confirm `.env.example` documents every required var with safe placeholders
      (2026-07-16 — all config vars + the `*_PATH` os.environ-only caveat)

**Framing for a public audience:**
- [x] Rewrite `README.md` for the four OSS audiences with the three run-paths
      (2026-07-16, P3 — static mirror now live, P4)
- [x] Reframe `CLAUDE.md` — moved the session-log build history to
      `ai_working/build-history.md`, kept invariants (2026-07-16, P3)
- [x] `CONTRIBUTING.md` — dev setup, the green gate (black + ruff + mypy
      `--strict`), test + invariant expectations (2026-07-16)

**Hygiene:**
- [x] Delete the stray `docs/data-sources.md.txt` (chat-transcript artifact)
      (2026-07-16)
- [x] Confirm `*.zip` gitignored (done) and no design-tool bundles tracked

**Community & OSS hygiene (2026-07-16):**
- [x] `SECURITY.md` (private reporting incl. redistribution leaks),
      `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `CITATION.cff`
- [x] `.github/` PR + issue templates (PR carries the redistribution/secret
      checklist), `dependabot.yml` (pip + npm + actions)
- [x] `secret-scan` CI job (automates the §0 scan); `check_redistribution` CI
      job already live
- [x] `docs/data-sources.md` documents the restricted `asx_gics` source

**Decision already made:** internal working notes (`ai_working/`, design
handoffs) stay **public** — labelled a development journal, not product docs.
ADRs (`ai_working/decisions/`) are a deliberate public asset.

---

## 5. Phase B — converge at launch **(DECIDED 2026-07-16: converge, develop in the open)**

Roy chose to **develop in the open** rather than run a permanent private→public
mirror — for a solo maintainer the bidirectional-sync tax isn't worth it, and
history is clean so there's no dirty-history reason for two repos. So at first
release there is one home.

Chosen path — **flip the original** (simplest; keeps issues/history/CI):
1. Re-run the §0 secret scan (or rely on the now-automated `secret-scan` CI job) —
   confirm CLEAN.
2. GitHub → **Settings → Visibility → make public** (the repo is
   `royster70/skillcurrent`; rename first if the working repo differs).
3. **Enable Pages**: Settings → Pages → Source = "GitHub Actions". Then run the
   `Deploy static site` workflow (dispatch or push a `v*` tag). Add the Pages
   badge/link to the README once the URL is live.
4. Turn on branch protection for `master` (require the CI checks) and enable
   **private vulnerability reporting** (Settings → Security).

**Ongoing process (develop-in-the-open):** work on branches → PR into `master`.
CI (lint, redistribution gate, secret scan, tests, frontend build) runs on every
PR — that IS the pre-publish test gate; there is **no separate private→public
apply step and no extra testing** to run. A release = tag `v*` → the static site
redeploys. If you ever need a private spike, do it in a throwaway private repo or
an unpublished local branch, not a permanent mirror.

---

## Related

- `ai_working/release-1.0-backlog.md` — the prioritised first-release backlog (P0–P5)
- `ai_working/open-source-prep-plan.md` — full licensing analysis + phased plan
- `docs/data-sources.md` — per-source licence + redistribution classification
- `ai_working/REBUILD_RUNBOOK.md` — rebuild the environment + data from scratch
- `docs/SETUP.md` — development setup
