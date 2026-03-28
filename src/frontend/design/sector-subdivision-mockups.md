# Sector Subdivision Mockups — Design Specification

Created: 2026-03-29
Pencil file: `pencil-welcome-desktop.pen` (nodes MWOuw, KEkrm)
Status: Mockups designed, ready for implementation

## Screen 1: Company Classification Result (node MWOuw)

Shows AGL Energy (diversified) vs AusNet Services (focused) contrast.

### New Design Elements

#### 1. Sector Code Badge
- 32x32px rounded square (cornerRadius: 6)
- Fill: `$--primary` (orange) for all sectors, or per-sector colour
- White letter inside (fontSize: 16, fontWeight: 700)
- Used in classification results and sector page headers

#### 2. single_sector_asx Warning Badge
- Pill badge with `$--color-warning` background
- Text: "single_sector_asx" in 11px warning foreground
- Followed by "→ AI reclassified to N sectors" success text
- Signals that GICS→ANZSIC mapping lost resolution

#### 3. L2 Subdivision Breadcrumbs (per sector)
- Indented under sector header (padding-left: 42px)
- "Matched sub-sectors:" label in muted 12px
- Each sub-sector: 6px coloured dot + name (13px) + headcount (12px mono)
- Dot colour matches parent sector badge

#### 4. Workforce Profile Cards
- 4-up horizontal grid within card footer
- Each: `$--secondary` background, cornerRadius: 8, padding: 12
- Large percentage (20px bold) + occupation group name (11px muted)
- Italicised hint below: "These occupation groups shape the impacted roles list below"

#### 5. Contrast Comparison Label
- git-compare icon (lucide) + "Contrast: Focused operator in the same sector"
- Muted text, separates diversified (AGL) from focused (AusNet) results

### Layout: AGL Card
```
Card Header: [building-2 icon] AGL Energy [ASX: AGL badge] [single_sector_asx badge] → AI reclassified
Card Content:
  [D badge] Electricity, Gas, Water and Waste Services
    Confidence: 95% · 175,300 employed
    Matched sub-sectors:
      • Electricity Generation 32,900
      • On Selling Electricity & Market Operation 9,000
      • Gas Supply 11,300
  ────────────────
  [G badge] Retail Trade
    Confidence: 75% · 1,343,700 employed
    Matched sub-sectors:
      • Fuel Retailing 40,200
      • Electrical and Electronic Goods Retailing 60,300
Card Footer:
  Workforce Profile (Census 2021)
  [21% Technicians] [21% Professionals] [16% Managers] [16% Clerical]
  → These occupation groups shape the impacted roles list below
Actions: [View Composite D+G →] [View Sector D]
```

### Layout: AusNet Card
```
Card Header: [building-2 icon] AusNet Services [Single sector — correctly focused badge]
Card Content:
  [D badge] Electricity, Gas, Water and Waste Services
    Confidence: 92% · Pure network infrastructure
    Matched sub-sectors:
      • Electricity Distribution 31,800
      • Electricity Transmission 6,900
  (No footer — single sector, no workforce profile needed)
```

---

## Screen 2: AU Sector Page — Subdivision View (node KEkrm)

Sector detail page for Division D with subdivision and occupation mix panels.

### Layout Structure
```
Breadcrumbs: Sectors > AU > D: Electricity, Gas, Water
Page Header: [D badge 40px] Electricity, Gas, Water and Waste Services
             ANZSIC Division D · 175,300 Census employed · 67 occupations    [Region: AU]

Two-Column Body:
  Left (fill_container):
    [ANZSIC Subdivisions Card] — 8 sub-sectors with horizontal bars
    [Impacted Occupations] — header + table with Sub-sector column

  Right (320px):
    [Occupation Mix Card] — 5 ANZSCO groups with colour dots + percentages
    [Insight Callout] — orange tint, explains sub-sector → role mapping
```

### New Design Elements

#### 6. Subdivision Bar Chart Rows
- Row: subdivision name (left) + proportional bar + headcount (right)
- Bar: 80px wide, `$--secondary` background track, `$--primary` fill proportional to employment
- Rows separated by 1px `$--border` bottom stroke
- Sorted by employment descending

#### 7. Sub-sector Column in Occupations Table
- New 140px column after Zone and Beta
- Shows which subdivision the occupation maps to (e.g., "Generation", "Distribution")
- Muted 12px text — informational, not interactive
- Table header row has `$--secondary` fill background

#### 8. Occupation Mix Legend
- Each row: 10px coloured circle + group name (13px) + percentage (14px bold)
- Colours: Blue (#3B82F6), Purple (#8B5CF6), Amber (#F59E0B), Green (#10B981), Red (#EF4444)
- Rows separated by 1px border

#### 9. Insight Callout Card
- Orange-tinted container: fill `#FF840011`, stroke `#FF840044`
- Lightbulb icon + "How this works" header in `$--primary`
- Body text explaining sub-sector → role mapping (12px, lineHeight 1.5)
- Example mappings in muted 11px:
  - Generation → Plant Operators, Engineers
  - Distribution → Line Workers, Technicians
  - Retail (On Selling) → Sales, Customer Service

---

## Implementation Notes

### API Changes Required
1. `POST /companies/classify` response needs `matched_subdivisions` per sector
2. `GET /sectors/{code}/occupations` needs `subdivision_name` column
3. New: `GET /sectors/{code}/subdivisions` endpoint (or embed in sector detail)

### Frontend Components to Create/Modify
1. `SubdivisionBarChart.tsx` — horizontal bar rows for subdivision card
2. `OccupationMixPanel.tsx` — colour-coded percentage legend
3. `ClassificationResultCard.tsx` — enriched with L2 breadcrumbs + workforce profile
4. `SectorDetailPage.tsx` — add subdivision + occupation mix columns
5. `InsightCallout.tsx` — reusable orange-tinted educational card

### Design Tokens Used
- Primary: `$--primary` (#FF8400)
- Card: `$--card` with `$--border` stroke
- Secondary fill: `$--secondary`
- Zone colours: Success (E2), Info (E1), Warning (E0)
- Insight callout: `#FF840011` / `#FF840044`
