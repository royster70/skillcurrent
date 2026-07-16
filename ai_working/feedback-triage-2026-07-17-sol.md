# SOL external product review — triage (2026-07-17)

**Source:** external product review received via SOL, 2026-07-17. Full review text held by Roy; this document records the verification of its claims against the codebase and the disposition of every recommendation.

**Overall verdict:** unusually accurate feedback — **every verifiable technical claim was TRUE** against the code as of `master` @ 813177f. The review's core thesis ("the primary work is now hierarchy, language and synthesis, rather than more analytics") matched what verification found: the machinery for its ideal user journey largely exists (Bearings, task matrix, drift), and the gaps are ordering, labelling, and unsurfaced data.

One material finding the reviewer missed was added during verification (see V11).

## Claim verification

| # | Feedback claim | Verdict | Evidence |
|---|---|---|---|
| V1 | Hero = "Follow the current", ~88vh, no search input | TRUE | `LandingPage.tsx` (88vh hero, single scroll CTA) |
| V2 | Search catches every error → "No occupations found" on outage | TRUE | `SearchPage.tsx` bare `catch { setResults([]) }` |
| V3 | Clickable `<div>`s: search rows, occupation groups/rows, GDPval card | TRUE | `SearchPage.tsx` ResultRow; `OccupationsPage.tsx` ×3 |
| V4 | <768px: permanent 64px rail, 32px main padding, search row doesn't wrap | TRUE | `Layout.tsx` (expand toggle hidden when narrow) |
| V5 | `<a href="/#read-the-scale">` breaks under the `/skillcurrent/` basename | TRUE | `OccupationsPage.tsx`; same class in `CompositeSectorPage.tsx` (×2, which also pointed at `/` instead of `/sectors`) |
| V6 | US default; region URL-only, not persisted; no data-region badge | TRUE | `LandingPage.tsx` hardcoded `sectors("US")`; `RegionSelector` on Sectors only |
| V7 | Occupations page = taxonomy with no search field | TRUE | `OccupationsPage.tsx` |
| V8 | Methodology page is a stub | TRUE | `MethodologyPage.tsx` ("full build is redesign phase 6") |
| V9 | "Automated" is the user-facing E2 label | TRUE | `constants.ts` `ZONE_LABELS` (frontend-only — backend emits codes) |
| V10 | Bearings panel is the nascent "what this means" layer | TRUE | `BearingsPanel.tsx` (prose is frontend; `bearings.py` returns structured data only) |
| V11 | **(Ours)** Static build labels trigram text match as "AI-powered semantic matching" | TRUE | `clientSearch.ts` (runtime embedding intentionally out of scope) vs `SearchPage.tsx` copy |

**Feasibility constraints found during verification:**

- **Skills data gap** — O*NET Skills/Abilities/Knowledge are *not* ingested (only Tasks/DWAs/Work Activities). ASC core competencies exist for AU. "Build these skills" needs a proxy or a new ingest → recorded in #78.
- **Confidence data exists but is unsurfaced** — `anzsco_soc_concordance.confidence`, `dwa_asc_bridge.confidence`, `au_task` tiers are in the DB; no occupation endpoint emits them → #73 is a small backend change, not new data.
- **CI coupling** — `check_content_drift.py` ERROR checks (route parity, row-total sync) constrain the README restructure → noted in #80.

## Disposition

### Fixed now — quick-fix PR (branch `fix/sol-feedback-quick-wins`, ships with this document)

| Review item | Fix |
|---|---|
| Deep-link bug (P0.6) | Raw `<a href>` → router `<Link>` in the occupation empty state; composite page's "Sectors page" link and "Edit sectors" button also re-targeted from `/` to `/sectors` |
| Search error states (P0.6) | Distinct failure state ("Search is unavailable right now") with Retry + text-match fallback (full build); genuine zero results keep the old message. Bonus fix: `staticAdapter.ts` cached rejected promises, which made any retry impossible until full reload |
| "Automated" too definitive (P0.4) | E2 relabelled **"High automation potential"** everywhere via `ZONE_LABELS` (single source; hardcoded stragglers re-derived); `ZONE_TITLES` hover qualifiers on bare zone chips; README zone table carries the capability-not-deployment caveat |
| Static "semantic" honesty (V11) | cdn builds label the mode "Best match / fuzzy title matching" with an explicit static-build note |
| Search row not responsive (part of P1.5) | Input/button row wraps at narrow widths |

### Accepted → issues

| Priority | Issue | Review item |
|---|---|---|
| P0 | [#70](https://github.com/royster70/skillcurrent/issues/70) Role search in the homepage hero | P0.1 (delayed first personal answer) |
| P0 | [#71](https://github.com/royster70/skillcurrent/issues/71) Plain-English "What this means for you" summary | P0.2 + P0.3 (evidence vs implication) |
| P0 | [#72](https://github.com/royster70/skillcurrent/issues/72) Finish the methodology page | P0.5 (trust gap) |
| P1 | [#73](https://github.com/royster70/skillcurrent/issues/73) Confidence / evidence-coverage indicators | P1.2 |
| P1 | [#74](https://github.com/royster70/skillcurrent/issues/74) Region prominent + persistent + badged | P1.3 |
| P1 | [#75](https://github.com/royster70/skillcurrent/issues/75) Accessibility remediation pass | P1.4 |
| P1 | [#76](https://github.com/royster70/skillcurrent/issues/76) Mobile navigation pattern | P1.5 |
| P1 | [#77](https://github.com/royster70/skillcurrent/issues/77) Search within the occupation hierarchy | P1.6 |
| P1 | [#78](https://github.com/royster70/skillcurrent/issues/78) Skill/learning recommendations (data gap recorded) | P1.1 — accepted **with constraint** |
| P1 | [#79](https://github.com/royster70/skillcurrent/issues/79) Vocabulary discipline (3 concepts + "Explain this score") | item 5 |
| P1 | [#80](https://github.com/royster70/skillcurrent/issues/80) README restructure + docs/API.md | item 12 |
| P2 | [#81](https://github.com/royster70/skillcurrent/issues/81)–[#86](https://github.com/royster70/skillcurrent/issues/86) Share, compare, save, quarterly deltas, one-page brief, audience modes | P2.1–P2.6 |

Milestones: **P0 — Immediate user value**, **P1 — Beyond expert audiences**, **P2 — Retention & shareability**. Label: `sol-feedback` (+ `priority:P0/P1/P2`).

### Rejected

Nothing rejected outright. The E2-label question was decided rather than backlogged (qualify now — see fixed-now table).

## Strategic framing to keep in view

The review's positioning — *"an open, evidence-based navigation system for how AI is changing work, task by task"*, sitting between "will AI take my job?" sites and enterprise workforce analytics — and its three-audience split (individual worker / workforce leader / educator or career adviser) is the context for #86 (audience modes) and should inform copy decisions in #71 and #79 before any mode switch is built.
