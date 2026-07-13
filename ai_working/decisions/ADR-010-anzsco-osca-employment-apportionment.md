---
date: 2026-07-12
status: accepted
agents: []
prd_section: FR-9.1
---

# ANZSCO → OSCA Employment Apportionment

## Context

FR-9.1 adopts OSCA 2024 as the canonical Australian occupation backbone, replacing the retired ANZSCO (kept as a legacy dual key). Australian employment data (`abs_employment`, from ABS/JSA) is **ANZSCO-keyed at mixed granularity** — 827 rows at 4-digit (unit group) and 1,916 rows at 6-digit (occupation). To carry AU employment weighting onto OSCA-keyed intelligence, every ANZSCO-keyed employment figure must be attributed to one or more OSCA occupations.

The bridge is the official ABS OSCA↔ANZSCO correspondence (`osca_anzsco_map`, from "OSCA correspondence tables v2.xlsx", Table 2). Two facts constrain how it can be applied:

1. **ABS publishes no split proportions.** The correspondence's own methodology note states the tables "do not identify the proportion" of a source category that falls into a target occupation. The only relationship signal is a `p` (partial) flag vs blank (full/exact). ABS's worked example — OSCA *Statistician*, *Data Analyst* and *Data Scientist* all map (`p`) to ANZSCO 224113 *Statistician* — shows a one-to-many split with no ratio provided. This is a deliberate ABS design choice, not a lookup we can source.

2. **The relationship is genuinely many-to-many.** A single ANZSCO code splits across several OSCA occupations and vice versa; 4-digit ANZSCO unit groups aggregate multiple 6-digit occupations.

Measured consequence: a conservative 1:1-only link (a single `osca_code` per row, unique matches only) reaches just **18.6% of AU employment by weight** — because the 4-digit rows, which carry the majority of employment (11.8M of 17.3M), are all excluded. Yet **100% of AU employment is mappable** (all 358 distinct 4-digit codes have OSCA children; every 6-digit code has ≥1 OSCA edge). The gap is entirely an apportionment problem, not a coverage problem.

We need a rule that (a) reflects ABS's own convention, (b) does not invent false-precision proportions ABS declined to provide, (c) reaches full employment coverage, and (d) records how each attribution was derived so a modelled split can never be mistaken for a measured one.

## Decision

Mirror ABS's documented **convention** (full vs partial, paid-jobs scope) and, for the apportionment weight ABS leaves to the data user, follow ABS's general guidance for the no-proportion case: **apportion using an auxiliary data source with counts** — which the platform already holds (`abs_employment` at both 4- and 6-digit). Every attributed employment figure is method-tagged with a confidence.

### The apportionment ladder (per ANZSCO-keyed employment figure)

**A0 — Prefer finer granularity (double-count guard).** `abs_employment` publishes the same employment at 4- and 6-digit. Use 6-digit rows as the source of truth; use a 4-digit unit-group row only for the portion not already represented by its 6-digit children. Employment is never counted twice.

**A1 — Exact link (`link_method='full'`, confidence 1.0).** A 6-digit ANZSCO code with a single `full` (non-`p`) OSCA edge → assign the whole figure to that OSCA occupation. This is ABS's confident backbone.

**A2 — Employment-weighted apportionment (`apportioned_employment`, confidence 0.6–0.9). DEFINED BUT NOT TRIGGERED under the current data — see note.** The *intent* — split a figure in proportion to the **held employment of the underlying finer ANZSCO codes** — is realised in practice by **A0**: because we prefer the 6-digit rows (which already carry their own real employment), there is no coarser aggregate left that needs an explicit weighted split. A2 therefore never fires with the current `abs_employment` 4-/6-digit structure, and `osca_apportionment.py` implements only A0 → A1 → A3. A2 is retained as a defined rung for a *future* case where a coarse aggregate must be divided by finer held counts that are not themselves already present as rows (e.g. a source published only at 4-digit whose 6-digit employment we obtain separately). **The live ladder is A0 → A1 → A3.**

**A3 — Equal split fallback (`apportioned_equal`, confidence ≤ 0.5).** Where no finer employment exists to weight a split (e.g. a 6-digit ANZSCO with no sub-detail mapping to several OSCA), divide equally across the `partial` targets. Labelled, capped, never presented as measured.

### Invariants

1. **Reconciliation.** `SUM(apportioned employment over OSCA) == SUM(source ANZSCO employment)` within rounding, after the A0 double-count guard. Apportionment redistributes, never creates or destroys, employment.
2. **Method-tagging.** Every OSCA-keyed employment row records `link_method` (`full | apportioned_employment | apportioned_equal`) and `confidence`. This reuses the FR-9.5 registry/crosswalk method-tag design.
3. **No invented proportions.** We never fabricate a split ratio; A2 weights come from held data, A3 is an explicit equal-split assumption, both labelled. ABS's `full`/`partial` convention is preserved verbatim in `correspondence_type`.
4. **Coverage is a first-class metric.** Publish employment-weighted coverage by `link_method` (measured `full` vs modelled `apportioned_*`) — the honesty metric that states how much of the AU workforce is exactly-linked vs apportioned.

## Consequences

**Positive.** Reaches ~100% employment coverage while staying faithful to ABS's convention; every figure is method-tagged and reconciles exactly to the de-duplicated base; A0's preference for 6-digit rows uses the finest held employment (realising A2's intent by row-selection rather than an explicit ratio); modelled (A3) splits are labelled and cannot masquerade as ABS measurements; the coverage-by-method report turns the ABS "no proportions" limitation into a stated, defensible number (measured `full` ≈ 61% of employment vs modelled `apportioned_equal` ≈ 39%).

**Negative / costs.** A3 equal-split figures are modelled, not measured (disclosed via `link_method`/confidence ≈ 0.48); the double-count guard (A0) requires care where 4- and 6-digit rows overlap; apportionment adds columns (`link_method`, `confidence`) and compute to the AU-profile step; results shift if the correspondence file re-versions (pinned by `integrity_hash`, ADR-002); A2 remains defined-but-inert, to be implemented only if a future source needs a genuinely coarse-to-fine weighted split.

## Alternatives considered

1. **Conservative 1:1 only (the 18.6% floor).** Rejected: forfeits the majority of AU employment; unusable for employment-weighted analysis.
2. **Blanket equal split for all splits.** Rejected: ignores the finer employment data we already hold; A2 is strictly better where that data exists.
3. **Assign each split to a single "primary"/dominant OSCA.** Rejected: ABS marks partial matches but not a primary; picking one silently drops the others and biases toward whichever we choose.
4. **Invent/scrape proportions.** Rejected: ABS deliberately declined to provide them; manufacturing ratios is false precision and violates the no-invented-proportions invariant.
5. **Stay ANZSCO-keyed, skip OSCA weighting.** Rejected: forgoes the FR-9.1 backbone migration and the current-classification credibility it buys.
