"""APScheduler integration for automated pipeline runs (FR-8.8).

Disabled by default (pipeline_auto_run = False in config).
Enable via environment variable: PIPELINE_AUTO_RUN=true
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler | None:
    return _scheduler


def start_scheduler() -> None:
    """Start APScheduler if pipeline_auto_run is enabled."""
    global _scheduler
    settings = get_settings()

    if not settings.pipeline_auto_run:
        logger.info(
            "Pipeline auto-run disabled (pipeline_auto_run=False). Scheduler not started."
        )
        return

    _scheduler = AsyncIOScheduler()

    try:
        trigger = CronTrigger.from_crontab(settings.pipeline_schedule_cron)
    except Exception as e:
        logger.error(
            "Invalid cron expression '%s': %s. Scheduler not started.",
            settings.pipeline_schedule_cron,
            e,
        )
        return

    _scheduler.add_job(
        _run_pipeline_job,
        trigger=trigger,
        id="data_refresh_pipeline",
        name="Tier 1 Data Refresh Pipeline",
        replace_existing=True,
        misfire_grace_time=3600,  # Allow 1-hour late start
    )

    _scheduler.start()
    logger.info("Pipeline scheduler started. Cron: %s", settings.pipeline_schedule_cron)


def stop_scheduler() -> None:
    """Stop the scheduler gracefully."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Pipeline scheduler stopped.")
    _scheduler = None


async def _run_pipeline_job() -> None:
    """Job function executed by APScheduler."""
    from scripts.run_pipeline import run_pipeline

    logger.info("Scheduled pipeline run starting...")
    results = await run_pipeline(stages="all", dry_run=False)
    logger.info("Scheduled pipeline run complete: %s", results["overall_status"])
