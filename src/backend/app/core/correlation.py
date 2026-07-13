"""Batch correlation context (ADR-007 Phase 3, Rule 2).

Pipeline runs and ingest jobs carry a ``pipeline_run_id`` (UUID4 generated in
``scripts/run_pipeline.py``). It is tagged on every ``transformation_log`` row a
run produces, so a single rebuild can be traced end-to-end.

``pipeline_run_id`` and the HTTP ``request_id`` (see ``app/middleware/timing.py``)
are mutually exclusive — a given ``transformation_log`` row belongs to exactly one
of the two worlds, never both. Cross-tier correlation, when needed, flows through
the ``tier_recompute_link`` table rather than mixing keys on one row.

Because ``run_pipeline`` awaits its stages sequentially inside one asyncio task,
setting this ContextVar once at the top of a run propagates to every decorated
transformation without re-binding. If a stage ever spawns work via
``create_task``/``run_in_executor``, Rule 1 requires capturing this value at the
call site and re-binding it inside the spawned coroutine.
"""

from contextvars import ContextVar

# Empty string = "no active pipeline run" (e.g. an ad-hoc CLI invocation of a
# single derived computation outside the orchestrator).
pipeline_run_id_var: ContextVar[str] = ContextVar("pipeline_run_id", default="")
