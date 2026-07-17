"""Build the redistributable seed dataset (FR-9.5 P2).

Exports every table on ``SEED_TABLES`` to Parquet under ``data/seed/`` — the
"clone -> runs" quickstart artifact and, per
``ai_working/discoveries/static-smart-deployment.md``, the same artifact the
static-site data layer will eventually consume.

Every table here is checked against the live ``signal_source_registry``
(FR-9.5): the source(s) it derives from must all be ``redistribution_ok =
true``, or the export refuses to run. This is enforcement, not documentation —
see ``scripts/check_redistribution.py`` for the sibling pre-publish gate over
the registry CSV itself.

Scope (deliberately NOT every table in the database — see EXCLUDED_TABLES
for the full list with reasons): every occupation/task/exposure/employment
table that a self-hoster would browse is included in full. Excluded are the
three ``vector`` embedding tables (large, re-derivable via the full ingest +
matching pipeline, not needed to browse already-materialized results),
O*NET's bulkiest raw detail tables (task_ratings, work_activities,
alternate_titles — superseded for the Tier-1 story by derived tables that are
included), the CompanyLookup/ASX tables (full-build-only feature, licence
unverified per docs/data-sources.md), and internal/operational tables
(dataset_versions, transformation_log, api_request_log, signal_source_registry
itself, which ships as the already-committed CSV).

Usage:
    python -m scripts.build_seed
    python -m scripts.build_seed --out-dir /some/other/dir
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("build_seed")

DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "seed"
_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")

# table -> the signal_source_registry source_key(s) it derives from.
SEED_TABLES: dict[str, list[str]] = {
    "onet_occupations": ["onet"],
    "onet_task_statements": ["onet"],
    "onet_tasks_to_dwas": ["onet"],
    "onet_dwa_references": ["onet"],
    "onet_sample_titles": ["onet"],
    # Alternate job-title synonyms — the static site's client-side fuzzy search
    # (P4) matches over these for parity with the server's pg_trgm /search, so
    # they're part of the shipped corpus (public domain, ~1 MB Parquet).
    "onet_alternate_titles": ["onet"],
    "onet_emerging_tasks": ["onet"],
    "eloundou_occ_scores": ["eloundou"],
    "eloundou_dwa_scores": ["eloundou", "onet"],
    "ms_ai_applicability_scores": ["microsoft_ai"],
    "ms_ai_soc_metrics": ["microsoft_ai"],
    "ms_ai_iwa_metrics": ["microsoft_ai"],
    "ms_ai_soc_to_iwas": ["microsoft_ai"],
    "ms_ai_physical_tasks": ["microsoft_ai", "onet"],
    "aei_job_exposure": ["aei"],
    "aei_task_penetration": ["aei"],
    "aei_task_snapshots": ["aei"],
    "oews_employment": ["oews"],
    "industry_occupation_profiles": ["oews", "onet", "abs_jsa_employment", "osca"],
    "industry_crosswalk": ["oews", "abs_jsa_employment"],
    "task_drift_metrics": ["onet", "eloundou", "aei"],
    "abs_employment": ["abs_jsa_employment"],
    "abs_employment_osca": ["abs_jsa_employment", "osca"],
    "anzsco_soc_concordance": ["onet", "abs_jsa_employment"],
    "abs_census_wpp": ["abs_census"],
    "abs_census_w13": ["abs_census"],
    "abs_census_subdivision_occ": ["abs_census"],
    "anzsic_subdivisions": ["abs_jsa_employment"],
    "osca_occupations": ["osca"],
    "osca_main_tasks": ["osca"],
    "osca_anzsco_map": ["osca"],
    "osca_isco_map": ["osca"],
    "asc_specialist_task": ["asc"],
    "asc_core_competency": ["asc"],
    "asc_technology_tool": ["asc"],
    "dwa_asc_bridge": ["onet", "asc"],
    "au_task": ["asc", "eloundou", "onet"],
    "au_occupation_exposure": ["asc", "eloundou", "onet", "osca"],
    "gdpval_tasks": ["gdpval_tasks"],
    "gdpval_rubric_items": ["gdpval_tasks"],
    "gptval_benchmarks": ["epoch_eci"],
    # JSA "Our Gen AI Transition" — AU-native exposure signal (CC-BY, redistributable).
    "jsa_genai_exposure": ["jsa_genai"],
    # Temporal snapshot layer (ADR-012) — the historical readings the delta
    # view diffs. Provenance = the union of every derived source captured.
    "snapshot_runs": ["onet", "eloundou", "aei", "oews", "abs_jsa_employment", "osca", "asc"],
    "exposure_snapshots": ["onet", "eloundou", "aei", "oews", "abs_jsa_employment", "osca", "asc"],
}

# Tables deliberately NOT in the seed, with the reason — surfaced in the
# manifest so exclusions are visible, never silent.
EXCLUDED_TABLES: dict[str, str] = {
    "onet_task_ratings": (
        "raw O*NET importance/frequency/level ratings (161,559 rows, ~4x the "
        "task table) -- superseded for the Tier-1 story by eloundou_dwa_scores "
        "(already derived from these); re-derivable via the full O*NET ingest"
    ),
    "onet_work_activities": (
        "broader GWA/IWA activity taxonomy (73,308 rows) -- not needed to "
        "browse sector/occupation/drift views; re-derivable via O*NET ingest"
    ),
    "onet_title_embeddings": (
        "sentence-transformer vectors for 66,512 titles -- the single largest "
        "table by bytes; needed only to recompute semantic search, not to "
        "browse its already-materialized results; regenerate via the matching "
        "pipeline"
    ),
    "dwa_embeddings": (
        "DWA title embeddings -- input to the already-materialized "
        "dwa_asc_bridge, not needed to browse it; regenerate via "
        "build_dwa_asc_bridge.py"
    ),
    "asc_task_embeddings": ("ASC task-text embeddings -- same rationale as dwa_embeddings"),
    "asx_company_sectors": (
        "CompanyLookup feature is full-build-only (paid LLM classify); the "
        "ASX listed-company list's own redistribution terms are unverified "
        "per docs/data-sources.md Tier-2"
    ),
    "company_classifications": ("LLM classification cache for the same full-build-only feature"),
    "gdpval_evaluations": (
        "0 rows as of this seed (pending the paid eval run) -- nothing to "
        "export yet; will be added to SEED_TABLES once populated"
    ),
    "api_request_log": "operational telemetry, not product data",
    "dataset_versions": "internal ingestion provenance, not product data",
    "dataset_version_deltas": "internal ingestion provenance, not product data",
    "transformation_log": "internal pipeline lineage, not product data",
    "signal_source_registry": (
        "ships as the already-committed data/signal_sources/signals.csv; "
        "restore_seed.py re-ingests it via scripts.ingest_signal_sources "
        "instead of duplicating it here"
    ),
    "alembic_version": "schema migration state, not product data",
}


def _validate_identifier(name: str) -> None:
    if not _IDENTIFIER.match(name):
        raise ValueError(f"unsafe table name: {name!r}")


async def _check_sources_ok(session: AsyncSession) -> None:
    """Refuse to export if any referenced source isn't redistribution_ok=true."""
    rows = (
        await session.execute(
            text("SELECT source_key, redistribution_ok FROM signal_source_registry")
        )
    ).all()
    registry = {r.source_key: r.redistribution_ok for r in rows}

    violations: list[str] = []
    for table, sources in SEED_TABLES.items():
        for source_key in sources:
            if source_key not in registry:
                violations.append(f"{table}: source '{source_key}' not in signal_source_registry")
            elif not registry[source_key]:
                violations.append(
                    f"{table}: source '{source_key}' is redistribution_ok=false -- must not ship"
                )
    if violations:
        raise ValueError("Redistribution check failed:\n  " + "\n  ".join(violations))


async def _export_table(session: AsyncSession, table: str, out_dir: Path) -> tuple[int, int]:
    _validate_identifier(table)
    rows = (await session.execute(text(f'SELECT * FROM "{table}"'))).mappings().all()
    df = pd.DataFrame([dict(r) for r in rows])
    path = out_dir / f"{table}.parquet"
    df.to_parquet(path, engine="pyarrow", index=False)
    return len(df), path.stat().st_size


async def run(out_dir: str | None = None) -> int:
    """Export SEED_TABLES to Parquet + a manifest. Returns total rows exported."""
    out_path = Path(out_dir) if out_dir else DEFAULT_OUT_DIR
    out_path.mkdir(parents=True, exist_ok=True)

    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as session:
            await _check_sources_ok(session)

            referenced_sources = sorted({s for sources in SEED_TABLES.values() for s in sources})
            source_rows = (
                await session.execute(
                    text(
                        "SELECT source_key, source_name, licence, redistribution_ok "
                        "FROM signal_source_registry WHERE source_key = ANY(:keys)"
                    ),
                    {"keys": referenced_sources},
                )
            ).all()

            tables_manifest: dict[str, Any] = {}
            total_rows = 0
            for table, sources in SEED_TABLES.items():
                row_count, byte_size = await _export_table(session, table, out_path)
                tables_manifest[table] = {"rows": row_count, "bytes": byte_size, "sources": sources}
                total_rows += row_count
                logger.info("%s: %d rows (%.1f KB)", table, row_count, byte_size / 1024)

            manifest = {
                "generated_at": datetime.now(UTC).isoformat(),
                "onet_version": settings.onet_version,
                "tables": tables_manifest,
                "excluded_tables": EXCLUDED_TABLES,
                "sources": [
                    {
                        "source_key": r.source_key,
                        "source_name": r.source_name,
                        "licence": r.licence,
                        "redistribution_ok": r.redistribution_ok,
                    }
                    for r in source_rows
                ],
                "total_rows": total_rows,
                "total_bytes": sum(t["bytes"] for t in tables_manifest.values()),
            }
            (out_path / "manifest.json").write_text(
                json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
            )
            logger.info(
                "Seed built: %d tables, %d rows, %.1f MB -> %s",
                len(tables_manifest),
                total_rows,
                manifest["total_bytes"] / (1024 * 1024),
                out_path,
            )
            return total_rows
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the redistributable seed dataset (FR-9.5)")
    parser.add_argument("--out-dir", default=None, help="Override the output directory")
    args = parser.parse_args()
    try:
        total = asyncio.run(run(out_dir=args.out_dir))
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"\nSeed dataset built: {total:,} rows")


if __name__ == "__main__":
    main()
