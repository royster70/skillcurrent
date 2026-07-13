"""Pipeline orchestrator for Tier 1 (+ optional AU) data refresh (FR-8.8).

Encodes the full ingestion dependency DAG from INGESTION_RUNBOOK.md and drives a
real rebuild: every stage invokes the corresponding script's shared ``run()``
entry point (the same callable the CLI uses). This is the recommended rebuild
path — see docs/REBUILD_RUNBOOK.md Option A.

Correlation (ADR-007 Phase 3, Rule 2): each run generates a UUID4
``pipeline_run_id`` and binds it to a ContextVar before executing stages. Every
``transformation_log`` row written by a derived stage (drift, DWA derivation,
industry profiles) is tagged with it, so a full rebuild is traceable as one unit.
Because stages are awaited sequentially in a single asyncio task, the ContextVar
propagates without re-binding.

Integrity (ADR-002): hashing and hash-verification on re-ingest live inside each
script's ``run()``; the orchestrator inherits them for free by calling those
entry points rather than re-implementing ingestion.

Usage:
    python -m scripts.run_pipeline [--stages all|tier1|au] [--dry-run] [--from-stage N]
"""

import argparse
import asyncio
import importlib
import json
import logging
import sys
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import partial

from app.core.correlation import pipeline_run_id_var

logger = logging.getLogger(__name__)


@dataclass
class PipelineStage:
    name: str
    fn: Callable[[], Awaitable[int]]
    depends_on: list[str] = field(default_factory=list)
    optional: bool = False
    description: str = ""


async def _call(module: str, **kwargs) -> int:
    """Import ``scripts.<module>`` lazily and invoke its ``run(**kwargs)``.

    Lazy import keeps module load light (heavy deps like sentence-transformers
    are only imported when their stage actually runs).
    """
    mod = importlib.import_module(f"scripts.{module}")
    return await mod.run(**kwargs)


async def _stage_census_subdivision_occ() -> int:
    """Census subdivision×occupation runs twice: level 2 pivot + level 3 long.

    Both granularities coexist in ``abs_census_subdivision_occ`` discriminated by
    ``indp_level`` (see migrations 021/022). Returns combined rows loaded.
    """
    mod = importlib.import_module("scripts.ingest_census_subdivision_occ")
    total = await mod.run(level=2)
    total += await mod.run(level=3)
    return total


async def run_pipeline(stages: str = "all", dry_run: bool = False, from_stage: int = 0) -> dict:
    """Run the Tier 1 (+ optional AU) data refresh pipeline.

    Returns a summary dict with per-stage results and the batch correlation key.
    """
    run_id = str(uuid.uuid4())
    results: dict = {
        "started_at": datetime.now(UTC).isoformat(),
        "pipeline_run_id": run_id,
        "dry_run": dry_run,
        "stages": [],
        "overall_status": "success",
    }

    pipeline = _build_pipeline_dag()

    stage_list = [s for i, s in enumerate(pipeline) if i >= from_stage]
    if stages == "tier1":
        stage_list = [s for s in stage_list if not s.optional]
    elif stages == "au":
        # AU/Census/ASX track only (assumes the Tier 1 base is already loaded).
        stage_list = [s for s in stage_list if s.optional]

    # Bind the batch correlation key for the whole run (ADR-007 Phase 3, Rule 2).
    # ContextVar survives `await`, so every stage — and every transformation it
    # triggers — sees this id without re-binding.
    token = pipeline_run_id_var.set(run_id)
    try:
        for stage in stage_list:
            stage_result = await _run_stage(stage, dry_run)
            results["stages"].append(stage_result)
            if stage_result["status"] == "failed":
                results["overall_status"] = "failed"
                if not stage.optional:
                    break  # Abort on non-optional failure
    finally:
        pipeline_run_id_var.reset(token)

    results["completed_at"] = datetime.now(UTC).isoformat()
    return results


async def _run_stage(stage: PipelineStage, dry_run: bool) -> dict:
    """Execute a single stage and return its result dict."""
    stage_result: dict = {
        "name": stage.name,
        "description": stage.description,
        "status": "skipped" if dry_run else "pending",
        "rows_affected": 0,
        "duration_ms": 0,
        "error": None,
    }

    if dry_run:
        logger.info("[DRY RUN] Would run stage: %s", stage.name)
        return stage_result

    start = datetime.now(UTC)
    try:
        logger.info("Running stage: %s", stage.name)
        rows = await stage.fn()
        stage_result["status"] = "success"
        stage_result["rows_affected"] = rows or 0
    except Exception as e:  # noqa: BLE001 — record and surface any stage failure
        stage_result["status"] = "failed"
        stage_result["error"] = str(e)
        logger.error("Stage %s failed: %s", stage.name, e)
    finally:
        elapsed = (datetime.now(UTC) - start).total_seconds() * 1000
        stage_result["duration_ms"] = round(elapsed, 1)

    return stage_result


def _build_pipeline_dag() -> list[PipelineStage]:
    """Build the pipeline stage list in dependency order.

    Non-optional stages form the Tier 1 core (US industry intelligence). Optional
    stages are the AU/Census/ASX overlay — a failure there does not abort the run.
    """
    return [
        # ── Tier 1 core (US) ──
        PipelineStage(
            "onet", partial(_call, "ingest_onet"), description="O*NET 28.1 reference data"
        ),
        PipelineStage(
            "eloundou",
            partial(_call, "ingest_eloundou"),
            depends_on=["onet"],
            description="Eloundou exposure scores",
        ),
        PipelineStage(
            "microsoft_ai",
            partial(_call, "ingest_microsoft_ai"),
            depends_on=["onet"],
            description="Microsoft AI applicability",
        ),
        PipelineStage(
            "aei_labor", partial(_call, "ingest_aei"), description="AEI labor market data"
        ),
        PipelineStage(
            "aei_temporal",
            partial(_call, "ingest_aei_temporal"),
            description="AEI temporal snapshots",
        ),
        PipelineStage("oews", partial(_call, "ingest_oews"), description="BLS OEWS employment"),
        PipelineStage(
            "gdpval", partial(_call, "ingest_gdpval"), description="OpenAI GDPval benchmarks"
        ),
        PipelineStage(
            "epoch_eci",
            partial(_call, "ingest_epoch_eci"),
            description="Epoch AI ECI capability benchmarks",
        ),
        PipelineStage(
            "derive_eloundou_dwas",
            partial(_call, "derive_eloundou_dwas"),
            depends_on=["eloundou", "onet"],
            description="Derived DWA scores",
        ),
        PipelineStage(
            "compute_drift",
            partial(_call, "compute_drift"),
            depends_on=["aei_temporal"],
            description="Task drift velocity",
        ),
        PipelineStage(
            "embed_titles",
            partial(_call, "embed_titles"),
            depends_on=["onet"],
            description="O*NET title embeddings",
        ),
        PipelineStage(
            "compute_profiles_us",
            partial(_call, "compute_industry_profiles", release_year=2024, region="US"),
            depends_on=["oews", "eloundou", "microsoft_ai", "aei_labor", "compute_drift"],
            description="US industry profiles",
        ),
        # ── AU / Census / ASX overlay (optional) ──
        PipelineStage(
            "ingest_crosswalk",
            partial(_call, "ingest_crosswalk"),
            optional=True,
            description="NAICS↔ANZSIC crosswalk",
        ),
        PipelineStage(
            "ingest_abs",
            partial(_call, "ingest_abs"),
            optional=True,
            description="ABS AU employment",
        ),
        PipelineStage(
            "build_anzsco_concordance",
            partial(_call, "build_anzsco_concordance"),
            depends_on=["embed_titles", "ingest_abs"],
            optional=True,
            description="ANZSCO→SOC mapping",
        ),
        PipelineStage(
            "compute_profiles_au",
            partial(_call, "compute_industry_profiles", release_year=2025, region="AU"),
            depends_on=[
                "ingest_abs",
                "build_anzsco_concordance",
                "ingest_crosswalk",
                "eloundou",  # exposure scores (same as US profiles)
                "microsoft_ai",  # AI applicability scores
                "aei_labor",  # AEI job exposure
                "compute_drift",  # drift velocity
            ],
            optional=True,
            description="AU industry profiles",
        ),
        PipelineStage(
            "ingest_census_wpp",
            partial(_call, "ingest_abs_census_wpp"),
            optional=True,
            description="ABS Census 2021 WPP W12A (industry × occupation)",
        ),
        PipelineStage(
            "ingest_census_w13",
            partial(_call, "ingest_abs_census_w13"),
            optional=True,
            description="ABS Census 2021 WPP W13 (occupation × sex)",
        ),
        PipelineStage(
            "ingest_census_subdivision_occ",
            _stage_census_subdivision_occ,
            optional=True,
            description="ABS Census subdivision × occupation (level 2 + level 3)",
        ),
        PipelineStage(
            "ingest_anzsic_subdivisions",
            partial(_call, "ingest_anzsic_subdivisions"),
            optional=True,
            description="ANZSIC subdivisions (JSA Industry Data Table 3)",
        ),
        PipelineStage(
            "ingest_asx_companies",
            partial(_call, "ingest_asx_companies"),
            depends_on=["ingest_crosswalk", "ingest_anzsic_subdivisions"],
            optional=True,
            description="ASX companies (GICS→ANZSIC via crosswalk, classify uses subdivisions)",
        ),
    ]


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(description="Run Tier 1 data refresh pipeline")
    parser.add_argument("--stages", choices=["all", "tier1", "au"], default="all")
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would run without executing"
    )
    parser.add_argument("--from-stage", type=int, default=0, help="Start from stage N (0-indexed)")
    args = parser.parse_args()

    results = asyncio.run(run_pipeline(args.stages, args.dry_run, args.from_stage))
    print(json.dumps(results, indent=2))
    sys.exit(0 if results["overall_status"] == "success" else 1)
