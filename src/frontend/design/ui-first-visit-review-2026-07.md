# First-visit comprehensibility review — UI enhancement backlog

**Date:** 2026-07-15 · **State reviewed:** `feat/ui-warm-instrument-tokens` @ phase 3.17 (b9c367b)
**Lens:** someone seeing SkillCurrent for the first time — readability, calls to action,
and whether the app teaches what it's actually about before asking the visitor to read it.

**Progress:** items 2, 3, 6, 10, 16 DONE in phase 3.18 (commit a0b6d13) — the quick-wins sitting.

## What already works (don't touch)

- The landing narrative arc (hero → four beats → tank → eras → chart → courses) is a genuinely
  good teaching sequence; the WaterlineTank makes β concrete with recognizable jobs.
- Honesty discipline: usage-vs-capability footers, "a forecast, not an alarm", Uncharted surfaced
  first-class on Rising Tide.
- `ContextualScoreCard` has excellent plain-language `SOURCE_EXPLAINERS` ("Researchers looked at
  every task in this job and asked: could AI help with this?").
- Colour-by-role discipline (zone ≠ signal ≠ motion) held through phases 3.13–3.17.
- The shared-axis grammar is now complete across EXPLORE: tank → sector waterline → occupation
  rail → task waterline.

---

## P1 — Comprehension blockers (a first visit stumbles on these)

1. **The 0–1.5 scale is never explained anywhere in the UI.**
   Every waterline runs 0→1.5 with ticks at 0.40/0.85, but no surface says what the number *is*
   or why it can exceed 1 (β = E1 + 0.5·E2, so the ceiling is 1.5). A first-timer assumes broken
   percentages. Fix: one sentence in the ZoneExplorer honesty footer ("β runs 0–1.5 because…")
   + a line in Methodology. *(ZoneExplorer.tsx footer; MethodologyPage stage 3.)*

2. ✅ **[DONE 3.18] The landing sector chart reads in the OPPOSITE direction to the rest of the app.**
   `WaterlineBar` (LandingPage) stacks segments E2|E1|E0 — submerged on the LEFT. The Sectors
   page depth bars (phase 3.13), the tank, and every β track read dry→submerged LEFT→RIGHT.
   The very first chart a visitor sees teaches the axis backwards. Fix: flip the landing
   segment order to E0|E1|E2 (keep the fill animation). *(LandingPage.tsx `WaterlineBar`.)*

3. ✅ **[DONE 3.18] "FOLLOW THE CURRENT" looks like a button but does nothing.**
   Brass + bold + wave underline is exactly the app's interactive language; clicking it is a
   no-op (it's a scroll cue). Make it scroll smoothly to the first beat (respect
   prefers-reduced-motion). *(LandingPage.tsx hero.)*

4. **"CHOOSE YOUR COURSE" skips the product's core views — and the visitor's actual question.**
   The three courses are Occupations + two documentation pages. Missing: Role Search ("what
   about MY job?" — the single most likely first-visit intent), Sectors, and Rising Tide (the
   namesake). Rebalance to: Find your role · Explore sectors · Rising tide · How this works.
   *(LandingPage.tsx `PATHS`.)*

5. **Source names appear as bare labels outside the score cards.**
   `ContextualScoreCard` explains Eloundou/Microsoft/AEI beautifully — but SearchPage score
   pills, the GDPval button/badges/panels, and SectorDetail's three-tier chart present
   "Eloundou", "GDPval" with no explanation in reach. Minimum: `title` tooltips reusing
   `SOURCE_EXPLAINERS.plain` (export it); better: a tiny shared `<SignalTag>` with hover card.
   GDPval especially — it gates two prominent toggles and is never defined in-flow.

## P2 — CTA and journey gaps

6. ✅ **[DONE 3.18] Search suggestion chips don't search.** Clicking "DevOps Engineer" only fills the input
   (`setQuery(term)`); the visitor must still hit Enter. Chips should trigger the search.
   *(SearchPage.tsx suggestions.)*

7. **The occupation detail is a dead end.** Richest page in the app, no onward links: the
   employment-by-sector bars aren't clickable (→ `/sectors/:code`), and there's no "see how
   these tasks are moving → /tide" cross-link. Every EXPLORE page should hand off somewhere.

8. **Rising Tide tasks link nowhere.** Task rows are text-only; in family-grouped mode the
   family headers could already link to `/occupations` (filtered to that major group) even
   before the backend families join lands.

9. **The Sectors page buries its hero.** Order is: legend → metric cards → CompanyLookup →
   composite selector → sector waterline → reference grid. Two utility widgets sit between
   the summary numbers and the story. Move SectorWaterline directly under the metric cards;
   utilities after. *(SectorsPage.tsx section order.)*

10. ✅ **[DONE 3.18] "BELOW THRESHOLD" card is unexplained jargon on Sectors.** The other three cards are
    zones the landing teaches; this one is Rising-Tide vocabulary with no bridge. Make the
    card click through to `/tide` (it's also the only non-interactive concept on the row).

## P3 — Education and honesty

11. **EraTide presents representative data as measured.** The era levels/gaps are curated
    (real per-era series is a backend follow-on), but nothing on the chart says so — the app's
    honesty rule applied everywhere else. Add a small "representative curve — measured series
    coming from Epoch ECI" caption. *(EraTide.tsx, both variants.)*

12. **SectorDetail's "Three-Tier Evidence Comparison" plots three different scales on one
    axis.** Eloundou (0–1.5), Microsoft (0–0.49), AEI side by side as raw bars — the exact
    cross-scale comparison the reference grid (3.15) deliberately avoids. Redesign to the
    per-source-normalised signal-bar pattern. *(SectorDetailPage.tsx.)*

13. **Unexplained metrics on SectorDetail:** "Impact Score" (what's the scale? what's in the
    composite?) and the "LQ" column header (no tooltip; location quotient is specialist
    vocabulary). One-line tooltips each.

14. **Methodology stub gaps for a first-timer:** never says *who/what* "Eloundou" is (a 2024
    academic exposure study), and the app's honest caveats (usage ≠ automation; exposure ≠ job
    loss) live only in per-page footers — consolidate a short "What this is / what this is NOT"
    block here.

15. **Keyboard access on the new row-click surfaces.** SectorWaterline rows and
    SectorSignalTable rows are click-only divs/trs (no tabIndex/role/Enter handler) — mouse-only
    navigation into sector detail. The Occupations rail rows share the pattern (pre-existing).

## P4 — Consistency polish

16. ✅ **[DONE 3.18] Waypoint is triplicated at three sizes.** Landing 14px/600 (3.17), TidePage local 11px,
    SearchPage inline 12px eyebrow. Export one shared `Waypoint` (e.g. `components/current/`)
    and reuse — the 3.17 sizing decision should propagate.

17. **Region story is inconsistent:** US/AU toggle on Sectors only; Occupations/Search/Tide are
    silently US-only. Until the AU occupation surface ships (backend FR-9.2 data exists), say
    "US data" quietly in those headers.

18. **`percentileColor` reuses retired hexes** (`#0d8f6e` is the pre-3.9b E2 teal) for its
    own percentile scale. Deliberately orthogonal, but re-derive from tokens so old zone hues
    can't echo back. *(ContextualScoreCard.tsx.)*

19. **SectorDetail is the last unreskinned EXPLORE surface:** raw Recharts bars + hardcoded
    `#E4E4E7` borders (pre-token gray). Same treatment as 3.13/3.15. (CompositeSectorPage's
    purple card was deliberately left — confirm it stays.)

20. **Occupation "Employment by Sector"** is still a generic Recharts bar — replace with house
    bars + sector links (pairs with item 7). Low priority.

---

### Suggested sequencing

- **Quick wins, one sitting:** 2, 3, 6, 10, 16 (all small, high first-visit payoff).
- **One session each:** 1+5 (the "explain the instrument" pass), 4, 9, 11, 12+13+19 (SectorDetail pass), 7+8+20 (cross-linking pass).
- **Needs backend or bigger design:** 8 (families join), 17 (AU occupation surface), 14 (Methodology full build, planned phase 6).
