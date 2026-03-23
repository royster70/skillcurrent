# Build Tier 1 Industry Intelligence Pipeline

Scaffolds or extends the Tier 1 public data intelligence pipeline for a given industry sector.

## Usage
```
/build-tier1 sector="Electricity & Gas" naics="2211,2212" anzsic="D261"
```

## What This Command Does

1. **Reads** `docs/domain-model.md` and `docs/fr8-role-evolution.md` before writing any code
2. **Checks** whether AEI ingest pipeline (`aei_task_snapshots` table + ingest script) exists — creates if not
3. **Checks** whether drift calculation job exists — creates if not
4. **Adds** industry sector entry to `industry_crosswalk` table for the specified NAICS/ANZSIC codes
5. **Loads or scaffolds** OEWS occupation data for the NAICS sector
6. **Generates** sector-filtered drift profile query
7. **Creates** a test for the sector filter returning results for known occupations in that sector

## Constraints
- Tier 1 only — no org data, no privacy controls, no authentication required for public endpoints
- AEI snapshots must remain append-only; do not add any UPDATE statements
- Industry crosswalk entry: set `curated_by = NULL` for automated entries from concordance tables
- Use sub-agent `fr8-drift-engine` for complex drift calculation logic

## Output
- Migration file for any new schema
- Ingest/pipeline script updates
- Sector config entry
- Test file
- Update `ai_working/context/implementation-status.md`
