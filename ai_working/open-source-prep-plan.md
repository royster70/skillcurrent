# Open-Source Preparation Plan — licensing-first

Created: 2026-07-14. A sequenced plan to take the platform open-source, leading
with **licensing** and the **open-source-data-vs-consumed-data** distinction the
whole redistribution decision hinges on. This is a working plan, not a commitment
— the code-licence choice and a few verifications are decisions for Roy.

## 0. Why this is less daunting than it looks

Much of the hard de-risking already happened:
- **Quality gate is GREEN** (ruff + mypy `--strict` + black, enforced) — the first
  thing contributors judge. Was red-since-birth; fixed.
- **CDN-first architecture + feature flag designed** (brief §6, wireframe 1d) and
  the **functionality-preservation tiering already worked out** (§4 below).
- **Provenance mechanism designed** (version_key vintage stamp, coverage fingerprint).
- **The durable-dataset pattern** proves the "committed, reproducible, licence-clean
  artifact" approach end-to-end (the GDPval eval dataset).
What remains is mostly the **legal scaffolding** (which does not exist yet) and
**execution** (the static build, the seed, setup automation).

---

## 1. LICENSING CLARITY — open-source data vs consumed data (the priority)

### 1.1 The core distinction (the rule everything keys off)
Every dataset the platform touches is exactly one of:
- **REDISTRIBUTABLE** — CC-BY / MIT / public-domain: can be bundled in the seed,
  pre-rendered into the CDN JSON, and served. Attribution required (NOTICE).
- **CONSUMED-ONLY (cite, never ship)** — citation-only / view-only / per-release-
  unverified: may inform analysis and be *linked/cited*, but its raw content or
  derived scores **must never enter a published output** (seed, CDN export, API).

The gate is a single boolean per source: **`redistribution_ok`**. If false or
unverified → cite-only. This is CLAUDE.md's FR-9.5 open-source-gate rule, made
concrete.

### 1.2 Per-source classification (verified against data-sources.md + CLAUDE.md)

**TIER 1 — REDISTRIBUTABLE (ship freely, attribute):**
| Source | Licence | Notes |
|---|---|---|
| O*NET 28.1 | US-Gov public domain | the occupational spine |
| Microsoft "Working with AI" | CC-BY 4.0 | |
| AEI labour-market + temporal | CC-BY | (the loaded AEI, not the geographic cut) |
| BLS OEWS | US-Gov public domain | |
| ABS/JSA employment, ABS Census 2021 | CC-BY 4.0 | |
| Epoch AI ECI | CC-BY | **the redistributable capability trendline** |
| OpenAI GDPval **tasks** | MIT | tasks only — scores are separate (1.4) |
| **Eloundou 2024** | **MIT** | **VERIFIED 2026-07-14** — `occ_level.csv` from `openai/GPTs-are-GPTs` (MIT). FOUNDATIONAL: the β/exposure layer + all derived tables inherit this |
| OSCA 2024 | CC-BY 4.0 | |
| ASC v3.0 (JSA) | CC-BY 4.0 | |
| JSA "Our Gen AI Transition" | CC-BY | acquired, not yet ingested |

**TIER 2 — VERIFY BEFORE SHIPPING (assumed-OK but unconfirmed):**
| Source | Issue |
|---|---|
| ~~Eloundou 2024~~ | ✅ **RESOLVED 2026-07-14 → TIER 1 (MIT).** Was the P0 risk; `occ_level.csv` traces to `openai/GPTs-are-GPTs` (MIT). Foundational layer is redistributable. |
| AEI geographic release | per-release CC-BY-vs-MIT unverified (data-sources.md) — verify the HF release tag before ingesting/shipping |
| ASX company list (`asx_company_sectors`) | the listed-company data may have its own terms — verify before shipping the CompanyLookup seed (note: it's full-build-only anyway, so lower urgency) |

**TIER 3 — CONSUMED-ONLY, NEVER SHIP (cite/link only):**
| Source | Why |
|---|---|
| AIOE (Felten) | citation-only, redistribution-restricted (data-sources.md) |
| SML (Brynjolfsson), Webb 2020 | academic / openICPSR citation-only (FR-9.5 roadmap) |
| **GDPval-AA** (Artificial Analysis Elo) | not openly licensed — commercial redistribution only (verified 2026-07-13) |
| **OpenAI GDPval leaderboard scores** | view-only; not needed — regenerate via the public grader on the MIT tasks (verified 2026-07-14) |

### 1.3 Derived data — the compilation is yours
Every *derived* table (`task_drift_metrics`, `industry_occupation_profiles`,
`au_task`, `dwa_asc_bridge`, embeddings, concordances, and **your own
`gdpval_evaluations`** once run) is platform-generated. It is redistributable
**iff its inputs are** — and since all TIER-1 inputs are CC-BY/MIT/public-domain,
the derived compilation ships under **CC-BY-4.0** as a compilation, with the NOTICE
crediting every upstream source. Your GDPval eval scores are wholly yours (MIT
tasks + your model outputs + a public grader — nothing cite-only in the chain).

### 1.4 The GDPval nuance, spelled out
- GDPval **tasks** (MIT, held) → shippable.
- GDPval **scores you generate** → yours, shippable.
- GDPval-AA Elo + OpenAI's leaderboard → cite-only, TIER 3.
So the occupation-grounded capability signal is shippable **only via your own run**,
never by ingesting someone else's scores.

### 1.5 The mechanism that ENFORCES this (build it, don't rely on prose)
Today `redistribution_ok` lives in prose (this doc + data-sources.md) — error-prone.
The **FR-9.5 `signal_source_registry`** (one row per source: `licence`,
`redistribution_ok`, `native_grain`, `url`) makes it machine-enforceable and drives
**both**:
1. **Seed-inclusion filter** — the seed/CDN export includes only tables whose every
   contributing source is `redistribution_ok = true` (auto-excludes TIER 3).
2. **Pre-publish CI check** — fail the build if any published output draws on a
   `redistribution_ok = false` source.
This registry is the linchpin of the whole open-source pivot. (It also fills the
`/signals` `licence` field the design needs — currently unqueryable.)

### 1.6 Dual-licence structure (the files that don't exist yet)
- **`LICENSE`** — code. **DECIDED 2026-07-14: MIT.** Chosen for licence-family
  fit — the data stack is already MIT/CC-BY-heavy (Eloundou MIT, GDPval MIT), so
  MIT keeps the whole tree in one permissive family with the lowest friction.
  (Apache-2.0's explicit patent grant was the alternative; not chosen.)
- **`DATA_LICENSE`** — **CC-BY-4.0** for the data compilation (matches the sources).
- **`NOTICE` / `SOURCES.md`** — per-source attribution + citation for every TIER-1
  source (auto-generatable from the registry).
Do NOT widen one licence over both — code and data licences stay distinct.

---

## 2. Sequenced plan (licensing first)

**Phase 1 — Legal foundation (BLOCKS everything public).**
1. ✅ Code licence decided (MIT). ✅ `LICENSE` (MIT), `DATA_LICENSE` (CC BY 4.0
   compilation), `NOTICE` (per-source attribution) added + README Licence
   section (2026-07-14). NOTICE is hand-maintained until the FR-9.5 registry
   auto-generates it.
2. Verify the TIER-2 sources (§1.2) — Eloundou first (P0).
3. Repo hygiene: confirm `Data/` + `.env` + `*.zip` gitignored (done for zip);
   a secrets sweep before anything's public; reframe README/CLAUDE.md away from
   "consulting accelerator."

**Phase 2 — The licence registry (the enforcement spine).**
4. Build FR-9.5 `signal_source_registry` (migration + ingest) with
   `redistribution_ok` per source. Backfill from §1.2.
5. Pre-publish CI check keying off it.

**Phase 3 — Seed dataset (the ease-of-use centrepiece).**
6. `scripts/build_seed.py` — dump only `redistribution_ok = true` tables, stamped
   with an as-of date + source manifest. Two tiers: a tiny committed sample (CI +
   "clone → runs") and a full CC-BY snapshot as a GitHub Release asset (not in git).
7. `scripts/restore_seed.py` — one-command restore.

**Phase 4 — Static site (functionality-preserving) — see §4.**
8. Static export pipeline (emit the JSON bundle per api-requirements §4/§4b).
9. Vite `VITE_DEPLOYMENT_MODE=cdn|full` + client-side search index; deploy to
   Cloudflare/GitHub Pages.

**Phase 5 — Setup automation + contributor experience.**
10. `scripts/doctor.py` preflight, `docker-compose.yml`, bootstrap script,
    dependency tiering (core / `[ingest]` / `[ml]` / `[dev]`), `sources.yaml`.
11. Layered README (3 run-paths), CONTRIBUTING.md, GitHub Actions CI on the tiny seed.

---

## 3. Code cleanup — the punch-list
- ✅ Green gate (ruff/mypy/black), pinned toolchain, single formatter.
- ⬜ Secrets sweep (the `ANTHROPIC_AUTH_TOKEN` handling, `_get_anthropic_client`).
- ⬜ Delete the stray `docs/data-sources.md.txt` (chat-transcript file, flagged in
  data-sources.md §note).
- ⬜ scripts/ still carry some lint debt (C901-exempt by policy, but a pass wouldn't hurt).
- ⬜ Reframe project framing (README/CLAUDE.md) from consulting-accelerator to OSS.

## 4. Static site — functionality preservation (already analysed)
- **Full fidelity (~95%)**: all 1,016 occupations → tasks pre-rendered as JSON;
  sectors, drift, US/AU divergence, Epoch trendline, coverage/provenance.
- **Degraded**: search → bundled exact/prefix index (not fuzzy/semantic) — the
  *entry point*, not the depth.
- **Full-build-only (build-eliminated from CDN)**: LLM company-classify (paid API /
  abuse vector) + semantic search (needs the vector DB).
- **Nothing is truly lost**: the docker "run it yourself" path preserves 100%.
  Story = "95% + two honest seams; full experience one `docker compose up` away" —
  not "the lite version."

## 5. Decisions only Roy can make (surface early)
1. ✅ **Code licence — RESOLVED (2026-07-14): MIT.** Chosen for licence-family fit
   with the MIT/CC-BY-heavy data stack. Unblocks Phase 1; add `LICENSE` (MIT),
   `DATA_LICENSE` (CC-BY-4.0), `NOTICE` next.
2. ✅ **Eloundou licence — RESOLVED (2026-07-14): MIT, redistributable.** The
   core exposure layer is shippable. No longer a decision.
3. **TIER-2 sources** — ship the ASX/CompanyLookup seed at all (it's full-build-only),
   and confirm the AEI-geographic release licence before ingesting it.
4. **Seed scope** — how many occupations/sectors in the tiny committed sample.
