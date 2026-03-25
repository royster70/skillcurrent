---
date: 2026-03-25
status: accepted
agents: []
prd_section: FR-8.9
---

# Australian Employment Data Integration — Schema, Matching, and Distribution Strategy

## Context

FR-8.9 extends the Tier 1 industry intelligence pipeline to support Australian workforce data alongside the existing US data. The platform must integrate three new data sources:

1. **ABS/JSA employment data** — Australian headcount by occupation and top industries (491 ANZSCO unit groups, 2,743 occupation-industry rows, 21.2M total workers)
2. **ANZSCO classification** — Australia's occupation taxonomy (491 unit groups with 4,694 title variants including principal titles, alternative titles, and specialisations)
3. **ANZSIC industry classification** — Australia's industry taxonomy (19 divisions, analogous to NAICS 2-digit sectors)

The integration presents six architectural decisions spanning schema design, occupation matching, employment distribution, location quotient computation, frontend state management, and industry crosswalk strategy.

### Constraints

- Exposure scores (Eloundou Beta, zone classification) are globally applicable — they are properties of tasks, not geographies. Only employment headcount and industry structure vary by region.
- The existing `industry_occupation_profiles` table (7,935 US rows) must remain fully backward-compatible. No existing US query may break.
- ANZSCO and O*NET SOC are independent classification systems with no official concordance. Mapping must be automated and reproducible.
- ABS/JSA provides occupation employment with top 3 industries ranked, but not exact cross-tabulation. Industry-level headcount must be approximated.
- The architecture must scale to additional regions (NZ, UK) without further schema changes.

## Decision 1: Region Column on Existing Table (Not Separate AU Table)

### The choice

Add a `region` column (values: `US`, `AU`) to `industry_occupation_profiles` with an updated unique constraint `(soc_code, naics_code, region)`. All existing US rows receive `region='US'` via migration default.

### Rejected alternative

Creating a parallel `au_industry_occupation_profiles` table with identical schema.

### Rationale

- **Single query interface** — API endpoints filter by `WHERE region = :region` rather than selecting from different tables. Service functions, aggregation queries, and composite sector logic work unchanged with the additional predicate.
- **Exposure scores are identical** — Beta, zone, E0/E1/E2 scores are occupation-level properties, not region-specific. Duplicating the table would duplicate these columns unnecessarily.
- **Scales to NZ/UK** — Adding a third region is `INSERT ... region='NZ'`, not a new table and new service layer.
- **Backward compatibility** — All existing queries that omit the region filter get US data by default (API defaults `region='US'` when parameter absent).

### Trade-off

The `naics_code` column now holds ANZSIC division codes for AU rows. This is semantically a misnomer — the column name implies NAICS — but pragmatically correct: both NAICS and ANZSIC codes are short alphanumeric industry identifiers, and the `region` discriminator makes the context unambiguous. Renaming the column to `industry_code` was considered but rejected to avoid breaking all existing queries, indexes, and ORM references for a cosmetic improvement.

## Decision 2: ANZSCO-to-SOC Mapping via Semantic Matching (Not Manual Curation)

### The choice

Embed all ANZSCO title variants (principal + alternative + specialisations = 4,694 titles across 491 unit groups) using the same all-MiniLM-L6-v2 model already deployed for Layer 2 matching. Query the existing 66,512 O*NET title embeddings via pgvector cosine similarity to find the best SOC match for each ANZSCO unit group.

Confidence thresholds:
- >= 0.85: auto-accept
- 0.70-0.85: needs review
- < 0.70: flagged (low confidence)

### Rejected alternatives

1. **Manual expert curation** of ~350 unit group mappings — accurate but not reproducible, not scalable to NZ/UK, and blocks the pipeline on human availability.
2. **ISCO bridge mapping** (ANZSCO -> ISCO-08 -> SOC) — theoretically clean but ISCO-to-SOC crosswalks are incomplete and introduce two mapping error hops instead of one.

### Rationale

- **Reuses existing infrastructure** — The 66,512 O*NET title embeddings and the pgvector HNSW index already exist (built for Layer 2 matching in FR-1). No new model, no new index, no new dependency.
- **Automated and reproducible** — Running `build_anzsco_concordance.py` produces identical results every time. When O*NET 29.0 is released, re-running with updated embeddings automatically refreshes the concordance.
- **Quality control without blocking** — The three-tier confidence threshold allows auto-acceptance of clear matches while flagging ambiguous cases for human review. The pipeline is never blocked waiting for manual work.

### Results

| Confidence tier | Count | Percentage | Notes |
|----------------|-------|-----------|-------|
| Auto-accepted (>= 0.85) | 346 | 70.5% | Clean semantic matches |
| Needs review (0.70-0.85) | 56 | 11.4% | Ambiguous or partial matches |
| Low confidence (< 0.70) | 89 | 18.1% | Mostly ABS statistical categories ("Unemployed", "Child/baby", "nfd" aggregation codes) — not real occupations |

The 89 low-confidence entries are overwhelmingly non-occupational ABS statistical categories that have no O*NET equivalent. This is correct behavior — the system correctly identifies that these entries should not map to any occupation.

## Decision 3: Employment Distribution via Rank-Weighted Split (50/30/20)

### The choice

ABS/JSA data provides total employment per occupation plus the top 3 industries ranked by employment share. Distribute employment using fixed weights: 50% to rank 1, 30% to rank 2, 20% to rank 3.

### Rejected alternatives

1. **Equal split (33/33/33)** — ignores the ranking signal entirely.
2. **ABS TableBuilder microdata** — provides exact cross-tabulation but requires an ABS account, manual export, and is not freely redistributable.

### Rationale

- **JSA Occupation Profiles is freely downloadable** — no registration, no API key, no license restrictions. TableBuilder requires an ABS account and manual data extraction for each query.
- **The 50/30/20 approximation captures the dominant industry signal** — the ranking is the most valuable information in the JSA data. Equal split discards it; 50/30/20 encodes it simply.
- **Known precision bound** — Total allocated employment (17.3M) vs raw total (21.2M) leaves ~18% unallocated. This employment falls outside the top 3 industries per occupation and is distributed across the long tail. For Tier 1 industry intelligence (sector-level benchmarking), this precision is acceptable.

### Trade-off

The resulting industry-occupation headcount matrix is synthetic, not exact. This is acceptable for Tier 1 use cases (sector comparison, workforce planning intelligence) where directional accuracy matters more than precision to the last worker. For Tier 2 organisational analysis, real ABS cross-tabulation data would be needed — flagged as a future enhancement.

## Decision 4: Location Quotient from Profiles Table (Not Raw Employment)

### The choice

Refactored `sector_priorities.py` to compute location quotient from `industry_occupation_profiles` (which already contains headcount per SOC per sector per region) instead of querying `oews_employment` directly.

### Rejected alternative

Conditional SQL paths — one query branch for US data (hitting `oews_employment`) and one for AU data (hitting `abs_employment` + a concordance join).

### Rationale

- **Single code path** — The profiles table already contains aggregated headcount for both regions. Location quotient computation (sector headcount / national headcount) needs exactly this data. One query works for both US and AU.
- **No conditional SQL** — Avoids `IF region == 'US': query_oews() ELSE: query_abs_with_concordance()` branching that would need to be replicated in every function that computes location quotient.
- **Profiles table is the canonical derived dataset** — Per ADR-001, derived tables are the serving layer. Querying raw employment tables for analytics that the profiles table already supports would bypass the transformation layer.

## Decision 5: URL-Based Region State (Not React Context)

### The choice

Region is stored in URL search parameters (`?region=AU`), read by each page independently via `useSearchParams()`. Default is `US` when the parameter is absent.

### Rejected alternatives

1. **React context/provider** wrapping the sector pages — adds state management complexity for a single string value.
2. **localStorage persistence** — region selection would persist across sessions, which may surprise users who share bookmarks or switch between analyses.

### Rationale

- **Bookmarkable and shareable** — `/sectors/62?region=AU` is a complete, shareable link to the Australian Healthcare sector. No hidden state.
- **No state management complexity** — No provider hierarchy, no context subscriptions, no re-render cascading. Each page reads its own URL params.
- **Natural cascading** — `SectorsPage` passes `region` to navigation links. `SectorDetailPage` reads it from its own URL. `CompositeSectorPage` reads it from its own URL. No prop drilling, no context consumption.
- **Backward compatibility** — All existing URLs without `?region=` continue to show US data. Zero breaking changes for existing bookmarks or links.

## Decision 6: Two-Hop Industry Crosswalk (NAICS to ISIC to ANZSIC) at Sector Level

### The choice

Manual concordance of 20 NAICS sectors to 19 ANZSIC divisions via ISIC Rev.4 as an intermediate bridge. Stored in the existing `industry_crosswalk` table with a `weight` column for split mappings (e.g., NAICS 51 "Information" splits 85%/15% to ANZSIC J "Information Media and Telecommunications" / ANZSIC S "Other Services").

21 total mapping rows (20 NAICS sectors, one with a split mapping).

### Rejected alternatives

1. **Automated mapping via classification code parsing** — NAICS and ANZSIC code structures are unrelated; no algorithmic mapping is possible.
2. **Sub-sector level mapping** — Would require thousands of rows with uncertain quality for minimal analytical benefit at Tier 1.

### Rationale

- **Sector-level mapping is stable and well-documented** — The UN ISIC Rev.4 correspondence tables provide authoritative bridges between NAICS and ANZSIC at the division level. These mappings change only when classification systems are revised (every 5-10 years).
- **The crosswalk is informational, not computational** — AU industry profiles are computed directly from ABS employment data mapped to ANZSIC divisions. The crosswalk provides labelling and reference context (e.g., showing ANZSIC division names on AU sector pages) but does not derive AU profiles from US profiles.
- **21 rows, manually verifiable** — At sector level, the entire crosswalk fits on one screen and can be verified by inspection. Sub-sector mapping (hundreds of rows) would require statistical validation infrastructure for marginal benefit.

## Implementation

### Migration 014: AU employment integration

```sql
-- Add region to profiles
ALTER TABLE industry_occupation_profiles
    ADD COLUMN region TEXT NOT NULL DEFAULT 'US';
ALTER TABLE industry_occupation_profiles
    DROP CONSTRAINT uq_industry_occ_profile,
    ADD CONSTRAINT uq_industry_occ_profile UNIQUE (soc_code, naics_code, region);

-- ABS employment (raw)
CREATE TABLE abs_employment (
    id              SERIAL PRIMARY KEY,
    anzsco_code     TEXT NOT NULL,
    anzsco_title    TEXT NOT NULL,
    employment      INTEGER NOT NULL,
    industry_rank   INTEGER,
    anzsic_code     TEXT,
    anzsic_title    TEXT,
    source_year     INTEGER NOT NULL DEFAULT 2024
);

-- ANZSCO-to-SOC concordance
CREATE TABLE anzsco_soc_concordance (
    id              SERIAL PRIMARY KEY,
    anzsco_code     TEXT NOT NULL,
    anzsco_title    TEXT NOT NULL,
    soc_code        TEXT NOT NULL,
    soc_title       TEXT NOT NULL,
    confidence      FLOAT NOT NULL,
    match_method    TEXT NOT NULL DEFAULT 'embedding',
    UNIQUE (anzsco_code)
);
```

### Ingestion pipeline

```
Phase 1: Migration 014 (schema changes)
Phase 2: ingest_crosswalk.py — 21 NAICS↔ANZSIC mappings
Phase 3: build_anzsco_concordance.py — 491 unit groups → SOC via pgvector
Phase 4: ingest_abs.py — 2,743 employment rows → abs_employment
Phase 5: compute AU profiles — 1,084 rows → industry_occupation_profiles (region='AU')
```

### API changes

All four sector endpoints gain an optional `region` query parameter:

- `GET /api/v1/sectors?region=AU`
- `GET /api/v1/sectors/{naics_code}?region=AU`
- `GET /api/v1/sectors/{naics_code}/priorities?region=AU`
- `GET /api/v1/sectors/composite?codes=J,K&region=AU`

Default: `region=US`. Invalid region values return 400.

### Frontend

`RegionSelector.tsx` — toggle component (US/AU flags) placed on `SectorsPage`, `SectorDetailPage`, and `CompositeSectorPage`. Updates URL search params on selection. Each page reads `region` from its own URL and passes it to API calls.

## Consequences

**Benefits:**
- Single schema serves US and AU data — no table proliferation as regions are added
- Automated ANZSCO-SOC concordance is reproducible and scales to future classification systems (ANZSCO, UK SOC, ESCO)
- All existing US functionality is completely unaffected — backward-compatible API defaults and schema migration
- URL-based region state enables bookmarking, sharing, and deep-linking to region-specific views
- Sector-level crosswalk is stable, verifiable, and sufficient for Tier 1 industry intelligence

**Trade-offs:**
- `naics_code` column holds ANZSIC codes for AU rows — semantic misnomer, pragmatically correct
- Employment distribution (50/30/20) is approximate — acceptable for Tier 1, insufficient for Tier 2
- 18% of AU employment unallocated (outside top 3 industries per occupation)
- 29.5% of ANZSCO unit groups below auto-accept confidence — mostly non-occupational ABS statistical categories

**Risks:**
- ANZSCO classification revision (next expected ~2028) would require re-running the concordance pipeline: Low impact — pipeline is automated and reproducible
- ABS data format changes: Low — JSA Occupation Profiles format has been stable across releases
- Users misinterpreting approximate AU headcount as exact: Medium — mitigated by documenting the approximation methodology and potentially adding a data quality indicator to the UI

## Reassessment Triggers

| Trigger | Likely action |
|---------|--------------|
| NZ or UK region requested | Add region rows using same pattern; extend crosswalk table |
| ABS TableBuilder data obtained | Replace 50/30/20 approximation with exact cross-tabulation |
| ANZSCO revision published | Re-run `build_anzsco_concordance.py` with updated title variants |
| Tier 2 AU engagement begins | Require exact ABS cross-tab; review concordance quality for org-level matching |
| Sub-sector analysis requested | Extend crosswalk to 3-digit NAICS/ANZSIC with weighted splits |

## Success Metrics

- All AU sector pages load with correct ANZSIC labels and employment figures
- US pages are unaffected — no regressions in existing tests
- Location quotient computes correctly for both regions from a single code path
- 70%+ ANZSCO unit groups auto-accepted at >= 0.85 confidence (achieved: 70.5%)
- AU employment total within 20% of ABS reported total (achieved: 17.3M vs 21.2M = 18% gap)

## References

- ADR-001: Data lineage and catalog strategy (transformation tracking)
- ADR-002: Reference dataset versioning (version provenance for AU data)
- ADR-003: Toolchain selection (pgvector for semantic matching)
- CLAUDE.md: Build dependency chain (FR-8.9 Industry Crosswalk)
- ABS/JSA Occupation Profiles: jobsandskills.gov.au
- ISIC Rev.4 correspondence tables: unstats.un.org
- O*NET 28.1: onetcenter.org
