"""Build the static-site data tree (P4 — no-database deployment).

Pre-renders the read-only Tier-1 API to JSON files under
``src/frontend/public/data/`` by calling the SAME FastAPI handlers the live
server uses (imported, invoked with a session) — so the static JSON is
byte-identical to the live API with zero SQL reimplementation.

What it emits:
  - Per-key JSON for every endpoint the UI actually calls (bounded key space):
    globals, sectors×region, priorities per sector×region, subdivisions per
    sector, occupation detail+matrix per SOC, gdpval per benchmark SOC.
  - profiles.json + the 3 AU census tables — the raw rows the client re-rolls
    up for the one combinatorial endpoint (/sectors/composite).
  - search_titles.json + occ_index.json — the client fuzzy-search corpus.
  - neighbours.json — copied from the committed data/static/ artifact
    (build_occ_neighbours.py; needs embeddings, so precomputed once).
  - manifest.json — vintage + counts.

The filename rule (``_url_to_relpath``) MUST stay in lock-step with
``src/frontend/src/lib/staticAdapter.ts`` ``pathToFile`` — a parity test pins them.

Usage (needs a DB with the seed restored — see restore_seed.py):
    python -m scripts.build_static_site
    python -m scripts.build_static_site --out-dir /some/dir
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api.v1.bearings import get_bearings  # noqa: E402
from app.api.v1.datasets import list_datasets  # noqa: E402
from app.api.v1.drift import (  # noqa: E402
    get_below_threshold_tasks,
    get_departing_tasks,
    get_drift_summary,
    get_enduring_tasks,
)
from app.api.v1.gdpval import gdpval_occupation, gdpval_summary, gdpval_waterline  # noqa: E402
from app.api.v1.occupations import get_occupation, get_soc_hierarchy  # noqa: E402
from app.api.v1.sector_priorities import get_sector_priorities  # noqa: E402
from app.api.v1.sectors import get_sector_subdivisions, list_sectors  # noqa: E402
from app.api.v1.task_matrix import get_task_matrix  # noqa: E402
from app.core.config import settings  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-5s %(message)s", datefmt="%H:%M:%S"
)
logger = logging.getLogger("build_static_site")

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO = BACKEND_DIR.parent.parent
DEFAULT_OUT = REPO / "src" / "frontend" / "public" / "data"
NEIGHBOURS_SRC = BACKEND_DIR / "data" / "static" / "neighbours.json"


def _url_to_relpath(url_path: str) -> str:
    """Map an API url path to a static file path. Mirrors staticAdapter.ts pathToFile.

    '/sectors?region=US'                     -> 'sectors/region-US.json'
    '/sectors/62/priorities?top_n=10&region=US' -> 'sectors/62/priorities/region-US/top_n-10.json'
    '/occupations/15-1252.00'                -> 'occupations/15-1252.00.json'
    """
    base, _, query = url_path.partition("?")
    parts = [p for p in base.split("/") if p] or ["index"]
    if query:
        pairs = sorted((kv.split("=", 1)[0], kv.split("=", 1)[1]) for kv in query.split("&"))
        parts += [f"{k}-{v}" for k, v in pairs]
    return "/".join(parts) + ".json"


def _to_jsonable(result: Any) -> Any:
    if isinstance(result, BaseModel):
        return result.model_dump(mode="json")
    if isinstance(result, list):
        return [_to_jsonable(x) for x in result]
    return result


def _write(out: Path, rel: str, obj: Any) -> None:
    dest = out / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


async def _emit(out: Path, url_path: str, result: Any) -> None:
    _write(out, _url_to_relpath(url_path), _to_jsonable(result))


async def _emit_globals(out: Path, db: AsyncSession) -> None:
    await _emit(out, "/datasets", await list_datasets(db=db))
    await _emit(out, "/drift/summary", await get_drift_summary(db=db))
    # Pass every param explicitly — un-passed args keep their FastAPI Query(...)
    # sentinel default instead of the intended value.
    await _emit(
        out,
        "/drift/departing?page=1&page_size=15",
        await get_departing_tasks(min_snapshots=2, page=1, page_size=15, db=db),
    )
    await _emit(out, "/drift/below-threshold", await get_below_threshold_tasks(db=db))
    await _emit(
        out,
        "/drift/enduring?page=1&page_size=10",
        await get_enduring_tasks(min_snapshots=2, page=1, page_size=10, db=db),
    )
    await _emit(out, "/gdpval/summary", await gdpval_summary(db=db))
    await _emit(out, "/gdpval/waterline", await gdpval_waterline(db=db))
    await _emit(out, "/occupations/hierarchy", await get_soc_hierarchy(db=db))
    logger.info("globals: 8 files")


async def _emit_sectors(out: Path, db: AsyncSession) -> dict[str, list[str]]:
    """Emit sectors + per-sector priorities/subdivisions; return {region: [codes]}."""
    codes_by_region: dict[str, list[str]] = {}
    for region in ("US", "AU"):
        resp = await list_sectors(region=region, db=db)
        await _emit(out, f"/sectors?region={region}", resp)
        codes = [s.naics_code for s in resp.sectors]
        codes_by_region[region] = codes
        for code in codes:
            prio = await get_sector_priorities(naics_code=code, top_n=10, region=region, db=db)
            await _emit(out, f"/sectors/{code}/priorities?top_n=10&region={region}", prio)
            # Subdivisions are ANZSIC (AU) data — emit for every code so the
            # adapter never hits a missing file (US codes 404 -> empty list).
            try:
                subs = await get_sector_subdivisions(sector_code=code, db=db)
            except HTTPException:
                subs = []
            await _emit(out, f"/sectors/{code}/subdivisions", subs)
        logger.info("sectors %s: %d sectors + priorities + subdivisions", region, len(codes))
    return codes_by_region


async def _emit_occupations(out: Path, db: AsyncSession) -> int:
    socs = [
        r[0]
        for r in (
            await db.execute(text("SELECT onet_soc FROM onet_occupations ORDER BY onet_soc"))
        ).all()
    ]
    done = 0
    for soc in socs:
        try:
            await _emit(out, f"/occupations/{soc}", await get_occupation(soc_code=soc, db=db))
            await _emit(
                out, f"/occupations/{soc}/matrix", await get_task_matrix(soc_code=soc, db=db)
            )
            await _emit(
                out, f"/occupations/{soc}/bearings", await get_bearings(soc_code=soc, db=db)
            )
            done += 1
        except HTTPException:
            continue  # SOC without renderable data — the UI can't navigate to it either
        if done % 200 == 0:
            logger.info("occupations: %d/%d", done, len(socs))
    logger.info("occupations: %d rendered (detail + matrix + bearings)", done)
    return done


async def _emit_gdpval(out: Path, db: AsyncSession) -> int:
    socs = [
        r[0]
        for r in (
            await db.execute(
                text("SELECT DISTINCT onet_soc FROM gdpval_tasks WHERE onet_soc IS NOT NULL")
            )
        ).all()
    ]
    for soc in socs:
        try:
            await _emit(
                out, f"/gdpval/occupations/{soc}", await gdpval_occupation(soc_code=soc, db=db)
            )
        except HTTPException:
            continue
    logger.info("gdpval: %d benchmark occupations", len(socs))
    return len(socs)


async def _dump_table(out: Path, db: AsyncSession, name: str, sql: str) -> int:
    rows = (await db.execute(text(sql))).mappings().all()
    data = [dict(r) for r in rows]
    _write(out, name, data)
    return len(data)


async def _emit_client_data(out: Path, db: AsyncSession) -> dict[str, int]:
    """Raw rows the client re-aggregates: composite profiles, AU census, search corpus."""
    counts = {}
    counts["profiles"] = await _dump_table(
        out,
        db,
        "profiles.json",
        "SELECT naics_code, naics_title, onet_soc, occupation_title, region, headcount, "
        "eloundou_beta, ms_ai_applicability, aei_exposure, dominant_zone, drift_velocity, "
        "drift_classification FROM industry_occupation_profiles",
    )
    counts["census_wpp"] = await _dump_table(
        out,
        db,
        "census_wpp.json",
        "SELECT anzsic_division_code, anzsco_major_group, anzsco_major_group_name, employed_count "
        "FROM abs_census_wpp WHERE geography_code='AUS' AND census_year=2021 "
        "AND anzsco_major_group IS NOT NULL",
    )
    counts["census_subdivisions"] = await _dump_table(
        out,
        db,
        "census_subdivisions.json",
        "SELECT anzsic_division_code, subdivision_name, employment FROM anzsic_subdivisions "
        "WHERE release_year=2025 AND employment IS NOT NULL",
    )
    counts["census_subdivision_occ"] = await _dump_table(
        out,
        db,
        "census_subdivision_occ.json",
        "SELECT indp_name, anzsic_division_code, anzsco_major_group, anzsco_major_group_name, "
        "employed_count FROM abs_census_subdivision_occ WHERE census_year=2021",
    )
    # occ_index — per-SOC scores mirroring the search enrichment joins.
    occ_rows = (
        (
            await db.execute(
                text(
                    """
        SELECT o.onet_soc, o.title,
               e.dv_beta_derived AS beta,
               m.ai_applicability_score AS ms,
               a.observed_exposure AS aei,
               CASE WHEN e.dv_beta_derived >= 0.85 THEN 'E2'
                    WHEN e.dv_beta_derived >= 0.40 THEN 'E1'
                    WHEN e.dv_beta_derived IS NOT NULL THEN 'E0' ELSE NULL END AS zone,
               ow.total_emp,
               EXISTS (SELECT 1 FROM onet_task_statements ts WHERE ts.onet_soc = o.onet_soc) AS has_tasks,
               CASE WHEN SUBSTRING(o.onet_soc,1,2)='55' THEN 'military'
                    WHEN o.title LIKE '%All Other%' THEN 'residual' ELSE NULL END AS category
        FROM onet_occupations o
        LEFT JOIN eloundou_occ_scores e ON e.onet_soc = o.onet_soc
        LEFT JOIN ms_ai_applicability_scores m ON o.onet_soc LIKE m.soc_code || '%'
        LEFT JOIN aei_job_exposure a ON o.onet_soc LIKE a.occ_code || '%'
        LEFT JOIN (SELECT onet_soc, SUM(employment) AS total_emp FROM oews_employment
                   WHERE employment IS NOT NULL GROUP BY onet_soc) ow
               ON ow.onet_soc = SUBSTRING(o.onet_soc,1,7)
        """
                )
            )
        )
        .mappings()
        .all()
    )
    occ_index = {
        r["onet_soc"]: {
            "title": r["title"],
            "beta": round(r["beta"], 4) if r["beta"] is not None else None,
            "ms": round(r["ms"], 4) if r["ms"] is not None else None,
            "aei": round(r["aei"], 4) if r["aei"] is not None else None,
            "zone": r["zone"],
            "total_employment": r["total_emp"],
            "has_tasks": bool(r["has_tasks"]),
            "category": r["category"],
            # Evidence coverage (#73): count of non-null core signals (0-3),
            # python-side over the same LEFT JOINs — presence, never blending.
            "signals": sum(r[k] is not None for k in ("beta", "ms", "aei")),
        }
        for r in occ_rows
    }
    _write(out, "occ_index.json", occ_index)
    counts["occ_index"] = len(occ_index)

    # search_titles — [title, soc, srcflag(0=sample,1=alternate)] for client fuzzy match.
    title_rows = (
        await db.execute(
            text(
                "SELECT reported_job_title AS t, onet_soc AS s, 0 AS f FROM onet_sample_titles "
                "UNION ALL SELECT alternate_title AS t, onet_soc AS s, 1 AS f FROM onet_alternate_titles"
            )
        )
    ).all()
    titles = [[r[0], r[1], r[2]] for r in title_rows if r[0]]
    _write(out, "search_titles.json", titles)
    counts["search_titles"] = len(titles)
    logger.info(
        "client data: profiles=%d, occ_index=%d, search_titles=%d",
        counts["profiles"],
        counts["occ_index"],
        counts["search_titles"],
    )
    return counts


def _copy_neighbours(out: Path) -> int:
    if not NEIGHBOURS_SRC.exists():
        logger.warning(
            "neighbours.json missing (%s) — run build_occ_neighbours.py; similar-occ disabled",
            NEIGHBOURS_SRC,
        )
        _write(out, "neighbours.json", {})
        return 0
    shutil.copyfile(NEIGHBOURS_SRC, out / "neighbours.json")
    n = len(json.loads(NEIGHBOURS_SRC.read_text(encoding="utf-8")))
    logger.info("neighbours: %d occupations (copied from committed artifact)", n)
    return n


async def run(out_dir: str | None = None) -> dict[str, Any]:
    out = Path(out_dir) if out_dir else DEFAULT_OUT
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as db:
            await _emit_globals(out, db)
            codes = await _emit_sectors(out, db)
            n_occ = await _emit_occupations(out, db)
            n_gdpval = await _emit_gdpval(out, db)
            client_counts = await _emit_client_data(out, db)
        n_neighbours = _copy_neighbours(out)
    finally:
        await engine.dispose()

    manifest = {
        "generated_at": datetime.now(UTC).isoformat(),
        "onet_version": settings.onet_version,
        "sectors": {r: len(c) for r, c in codes.items()},
        "occupations_rendered": n_occ,
        "gdpval_occupations": n_gdpval,
        "neighbours": n_neighbours,
        **{f"client_{k}": v for k, v in client_counts.items()},
    }
    _write(out, "manifest.json", manifest)
    logger.info("Static site data built -> %s", out)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the static-site data tree (P4)")
    parser.add_argument("--out-dir", default=None)
    args = parser.parse_args()
    manifest = asyncio.run(run(out_dir=args.out_dir))
    print(
        f"\nStatic site data built: {manifest['occupations_rendered']:,} occupations, "
        f"{sum(manifest['sectors'].values())} sectors"
    )


if __name__ == "__main__":
    main()
