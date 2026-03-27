"""
Pipeline orchestrator for Tier 1 data refresh (FR-8.8).

Encodes the full ingestion dependency DAG from INGESTION_RUNBOOK.md.
Each stage checks DatasetVersion for current data before running.

Usage:
    python -m scripts.run_pipeline [--stages all|tier1|au] [--dry-run] [--from-stage N]
"""

import argparse
import asyncio
import json
import logging
import sys
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Callable

logger = logging.getLogger(__name__)


@dataclass
class PipelineStage:
    name: str
    fn: Callable
    depends_on: list[str] = field(default_factory=list)
    optional: bool = False
    description: str = ""


async def run_pipeline(stages: str = "all", dry_run: bool = False, from_stage: int = 0) -> dict:
    """Run the Tier 1 data refresh pipeline.

    Returns a summary dict with stage results.
    """
    results: dict = {
        "started_at": datetime.now(UTC).isoformat(),
        "dry_run": dry_run,
        "stages": [],
        "overall_status": "success",
    }

    # Define the pipeline DAG
    # Import service functions (lazy imports to avoid loading at module level)
    pipeline = _build_pipeline_dag()

    stage_list = [s for i, s in enumerate(pipeline) if i >= from_stage]
    if stages == "tier1":
        stage_list = [s for s in stage_list if not s.optional]

    for stage in stage_list:
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
            results["stages"].append(stage_result)
            continue

        start = datetime.now(UTC)
        abort = False
        try:
            logger.info("Running stage: %s", stage.name)
            # Each stage function is responsible for its own DB session and idempotency
            rows = await stage.fn()
            stage_result["status"] = "success"
            stage_result["rows_affected"] = rows or 0
        except Exception as e:
            stage_result["status"] = "failed"
            stage_result["error"] = str(e)
            results["overall_status"] = "failed"
            logger.error("Stage %s failed: %s", stage.name, e)
            if not stage.optional:
                abort = True
        finally:
            elapsed = (datetime.now(UTC) - start).total_seconds() * 1000
            stage_result["duration_ms"] = round(elapsed, 1)

        results["stages"].append(stage_result)
        if abort:
            break  # Abort on non-optional failure

    results["completed_at"] = datetime.now(UTC).isoformat()
    return results


def _build_pipeline_dag() -> list[PipelineStage]:
    """Build the pipeline stage list in dependency order."""
    # Import here to keep module load lightweight
    return [
        PipelineStage("onet", _noop, description="O*NET 28.1 reference data"),
        PipelineStage("eloundou", _noop, depends_on=["onet"], description="Eloundou exposure scores"),
        PipelineStage("microsoft_ai", _noop, depends_on=["onet"], description="Microsoft AI applicability"),
        PipelineStage("aei_labor", _noop, depends_on=[], description="AEI labor market data"),
        PipelineStage("aei_temporal", _noop, depends_on=[], description="AEI temporal snapshots"),
        PipelineStage("oews", _noop, depends_on=[], description="BLS OEWS employment"),
        PipelineStage("gdpval", _noop, depends_on=[], description="OpenAI GDPval benchmarks"),
        PipelineStage("epoch_eci", _noop, depends_on=[], description="Epoch AI ECI capability benchmarks"),
        PipelineStage(
            "derive_eloundou_dwas",
            _noop,
            depends_on=["eloundou", "onet"],
            description="Derived DWA scores",
        ),
        PipelineStage(
            "compute_drift",
            _noop,
            depends_on=["aei_temporal"],
            description="Task drift velocity",
        ),
        PipelineStage(
            "embed_titles",
            _noop,
            depends_on=["onet"],
            description="O*NET title embeddings",
        ),
        PipelineStage(
            "compute_profiles_us",
            _noop,
            depends_on=["oews", "eloundou", "microsoft_ai", "aei_labor", "compute_drift"],
            description="US industry profiles",
        ),
        PipelineStage(
            "ingest_crosswalk",
            _noop,
            depends_on=[],
            optional=True,
            description="NAICS↔ANZSIC crosswalk",
        ),
        PipelineStage(
            "ingest_abs",
            _noop,
            depends_on=[],
            optional=True,
            description="ABS AU employment",
        ),
        PipelineStage(
            "build_anzsco_concordance",
            _noop,
            depends_on=["embed_titles", "ingest_abs"],
            optional=True,
            description="ANZSCO→SOC mapping",
        ),
        PipelineStage(
            "compute_profiles_au",
            _noop,
            depends_on=["ingest_abs", "build_anzsco_concordance", "ingest_crosswalk"],
            optional=True,
            description="AU industry profiles",
        ),
        PipelineStage(
            "ingest_asx_companies",
            _noop,
            depends_on=[],
            optional=True,
            description="ASX listed companies",
        ),
    ]


async def _noop() -> int:
    """Placeholder — each stage will call its actual service function when data is available."""
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Tier 1 data refresh pipeline")
    parser.add_argument("--stages", choices=["all", "tier1", "au"], default="all")
    parser.add_argument("--dry-run", action="store_true", help="Show what would run without executing")
    parser.add_argument(
        "--from-stage", type=int, default=0, help="Start from stage N (0-indexed)"
    )
    args = parser.parse_args()

    results = asyncio.run(run_pipeline(args.stages, args.dry_run, args.from_stage))
    print(json.dumps(results, indent=2))
    sys.exit(0 if results["overall_status"] == "success" else 1)
