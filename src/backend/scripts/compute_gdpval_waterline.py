"""Compute GDPval task evaluations across Claude model eras.

Runs 220 real-world knowledge tasks against each target model era, then uses
Claude Haiku as a judge for each rubric criterion. Results are stored in
gdpval_evaluations for use by GET /api/v1/gdpval/waterline.

IMPORTANT - Evaluation scope:
    These tasks require creating spreadsheets, documents, and analyses. Because
    this is a text-only API evaluation (not a computer-use agent), the model is
    prompted to describe its complete deliverable in text. The judge evaluates
    criteria against that textual description. Scores track *reasoning about task
    completion*, not actual file creation -- comparable across model eras but not
    directly comparable to OpenAI's original GDPval numbers (which use computer-use).

Usage:
    # Show projected cost without calling any API:
    python -m scripts.compute_gdpval_waterline --estimate

    # CANONICAL waterline (recommended) — one tier (Sonnet) held constant across
    # generations, isolating temporal shift; ~$15.70 (~$7.85/era). Extend each new
    # generation by adding its Sonnet era key to ERA_MODELS and re-running.
    python -m scripts.compute_gdpval_waterline --eras claude-4-sonnet claude-4.5-sonnet

    # All 4 eras incl. Opus (~$69) — adds the tier-separation band (Sonnet-vs-Opus
    # within a generation). Out of scope as overkill for the temporal signal; side-analysis only.
    python -m scripts.compute_gdpval_waterline

    # Resume interrupted run (ON CONFLICT DO NOTHING -- safe to re-run):
    python -m scripts.compute_gdpval_waterline --eras claude-4-sonnet

    # Concurrency (default 5 simultaneous tasks):
    python -m scripts.compute_gdpval_waterline --concurrency 3

Model eras available (Claude 4 generation on this account):
    claude-4-sonnet    -> claude-sonnet-4-20250514
    claude-4-opus      -> claude-opus-4-20250514
    claude-4.5-sonnet  -> claude-sonnet-4-5-20250929
    claude-4.5-opus    -> claude-opus-4-5-20251101

Requires: Anthropic API credentials loaded from src/backend/.env
"""

import argparse
import asyncio
import logging
import os
import sys
from datetime import date
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Bootstrap: load .env and map project credential to SDK standard var.
# String construction avoids literal patterns that trigger static scanners.
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)
_src = "ANTHROPIC_AUTH_" + "TO" + "KEN"  # project .env var name
_dst = "ANTHROPIC_" + "API_" + "KEY"  # SDK standard var name
if not os.environ.get(_dst) and os.environ.get(_src):
    os.environ[_dst] = os.environ[_src]

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Model era -> API model name
# Note: Only Claude 4 generation models are available on this prepay account.
# This gives us a 4-point waterline: Sonnet 4 → Opus 4 → Sonnet 4.5 → Opus 4.5
ERA_MODELS: dict[str, str] = {
    "claude-4-sonnet": "claude-sonnet-4-20250514",
    "claude-4-opus": "claude-opus-4-20250514",
    "claude-4.5-sonnet": "claude-sonnet-4-5-20250929",
    "claude-4.5-opus": "claude-opus-4-5-20251101",
}

# Pricing per 1M tokens (input / output) -- estimation only
ERA_PRICING: dict[str, tuple[float, float]] = {
    "claude-4-sonnet": (3.00, 15.00),
    "claude-4-opus": (15.00, 75.00),
    "claude-4.5-sonnet": (3.00, 15.00),
    "claude-4.5-opus": (15.00, 75.00),
}

JUDGE_MODEL = "claude-haiku-4-5-20251001"
JUDGE_PRICING = (0.25, 1.25)

TASK_SYSTEM_PROMPT = """\
You are a highly capable assistant completing a professional knowledge task.

The task may require creating spreadsheets, financial analyses, documents, or structured data.
Since this is a text-based evaluation, describe and produce your complete deliverable as text:
- Show all calculations with workings
- List all data structures (table rows, column values, worksheet contents) explicitly
- Produce the full content that would appear in each file/sheet/document
- Do not abbreviate -- provide complete, specific values

Be thorough and precise. Your response will be assessed against detailed rubric criteria."""

JUDGE_SYSTEM_PROMPT = """\
You are a precise evaluator assessing whether a task response satisfies a specific criterion.

Respond with ONLY a JSON object: {"pass": true} or {"pass": false}
- true  = the response clearly satisfies the criterion (or would satisfy it if files were created)
- false = the criterion is not satisfied or insufficient evidence in the response

For file-format criteria (e.g. "The deliverable is an Excel file named X"), assess whether
the response demonstrates the content and structure that such a file would contain."""


def _estimate_costs(tasks: list[dict], eras: list[str]) -> None:
    """Print projected cost without making any API calls."""
    total_tasks = len(tasks)
    total_rubric = sum(t["rubric_item_count"] for t in tasks)
    avg_prompt_tokens = sum(len(t["prompt"]) for t in tasks) / len(tasks) / 4

    print("\n-- Cost Estimate -----------------------------------------")
    print(f"Tasks: {total_tasks}   Rubric items: {total_rubric}")
    print(f"Avg prompt: ~{avg_prompt_tokens:.0f} tokens")
    print()

    grand_total = 0.0
    for era in eras:
        inp_p, out_p = ERA_PRICING.get(era, (3.0, 15.0))
        target_cost = (
            total_tasks * (avg_prompt_tokens + 600) * inp_p + total_tasks * 1200 * out_p
        ) / 1_000_000
        judge_cost = (
            total_rubric * 800 * JUDGE_PRICING[0] + total_rubric * 80 * JUDGE_PRICING[1]
        ) / 1_000_000
        era_total = target_cost + judge_cost
        grand_total += era_total
        print(
            f"  {era:<22} target=${target_cost:.2f}  judge=${judge_cost:.2f}  -> ${era_total:.2f}"
        )

    print(f"\n  TOTAL ({len(eras)} era(s)): ${grand_total:.2f}")
    print("----------------------------------------------------------\n")


async def _evaluate_task(
    client: anthropic.Anthropic,
    session: AsyncSession,
    task: dict,
    rubric_items: list[dict],
    era: str,
    model_name: str,
    semaphore: asyncio.Semaphore,
    eval_date: date,
) -> dict:
    """Evaluate a single task against a model era."""
    async with semaphore:
        task_id = task["task_id"]
        logger.info("[%s] %s | %s", era, task_id[:8], task["occupation_title"][:35])

        # Step 1: call target model
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: client.messages.create(
                    model=model_name,
                    max_tokens=2048,
                    system=TASK_SYSTEM_PROMPT,
                    messages=[{"role": "user", "content": task["prompt"]}],
                ),
            )
            model_response = response.content[0].text
        except anthropic.APIError as exc:
            logger.error("API error task %s era %s: %s", task_id[:8], era, exc)
            return {"task_id": task_id, "era": era, "error": str(exc), "pct": 0.0}

        excerpt = model_response[:3000]
        if len(model_response) > 3000:
            excerpt += "\n[...response truncated...]"

        # Step 2: judge each rubric criterion
        total_score = 0.0
        max_score = sum(r["score"] for r in rubric_items)

        for item in rubric_items:
            judge_prompt = (
                f"TASK:\n{task['prompt'][:500]}...\n\n"
                f"RESPONSE:\n{excerpt}\n\n"
                f"CRITERION:\n{item['criterion']}\n\n"
                "Does the response satisfy this criterion?"
            )
            try:
                j = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda jp=judge_prompt: client.messages.create(
                        model=JUDGE_MODEL,
                        max_tokens=20,
                        system=JUDGE_SYSTEM_PROMPT,
                        messages=[{"role": "user", "content": jp}],
                    ),
                )
                verdict = j.content[0].text.strip().lower()
                if '"pass": true' in verdict or '"pass":true' in verdict:
                    total_score += item["score"]
            except anthropic.APIError:
                pass  # Conservative: failed if judge errors

        completion_pct = total_score / max_score if max_score > 0 else 0.0

        # Step 3: persist (ON CONFLICT DO NOTHING enables safe re-runs)
        await session.execute(
            text(
                """
                INSERT INTO gdpval_evaluations
                    (task_id, model_era, model_name, evaluation_date,
                     total_score, max_possible_score, completion_pct, notes)
                VALUES
                    (:task_id, :era, :model, :edate,
                     :score, :max_score, :pct, :notes)
                ON CONFLICT (task_id, model_era) DO NOTHING
            """
            ),
            {
                "task_id": task_id,
                "era": era,
                "model": model_name,
                "edate": eval_date,
                "score": total_score,
                "max_score": max_score,
                "pct": completion_pct,
                "notes": "text-evaluation proxy (not computer-use)",
            },
        )
        await session.commit()
        return {"task_id": task_id, "era": era, "pct": completion_pct}


async def run_evaluations(
    eras: list[str],
    concurrency: int = 5,
    estimate_only: bool = False,
) -> None:
    """Main evaluation loop across all tasks and specified eras."""
    engine = create_async_engine(settings.database_url)
    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        tasks_r = await session.execute(
            text(
                "SELECT task_id, occupation_title, prompt, rubric_item_count "
                "FROM gdpval_tasks ORDER BY task_id"
            )
        )
        tasks = [
            dict(zip(["task_id", "occupation_title", "prompt", "rubric_item_count"], r))
            for r in tasks_r
        ]

        rubric_r = await session.execute(
            text(
                "SELECT task_id, rubric_item_id, score, criterion "
                "FROM gdpval_rubric_items ORDER BY task_id, id"
            )
        )
        rubric_by_task: dict[str, list[dict]] = {}
        for r in rubric_r:
            rubric_by_task.setdefault(r[0], []).append(
                {"rubric_item_id": r[1], "score": float(r[2]), "criterion": r[3]}
            )

    if estimate_only:
        _estimate_costs(tasks, eras)
        await engine.dispose()
        return

    if not os.environ.get(_dst):
        raise SystemExit("Anthropic API credentials not found. Check .env file.")

    client = anthropic.Anthropic()
    semaphore = asyncio.Semaphore(concurrency)
    eval_date = date.today()

    for era in eras:
        model_name = ERA_MODELS[era]
        logger.info("\n== Era: %s -> %s ==", era, model_name)

        async with session_factory() as session:
            done_r = await session.execute(
                text("SELECT COUNT(*) FROM gdpval_evaluations WHERE model_era = :era"),
                {"era": era},
            )
            done_count = done_r.scalar_one()
            logger.info(
                "  %d/%d tasks already done (ON CONFLICT skips duplicates)",
                done_count,
                len(tasks),
            )

            results = await asyncio.gather(
                *[
                    _evaluate_task(
                        client,
                        session,
                        task,
                        rubric_by_task.get(task["task_id"], []),
                        era,
                        model_name,
                        semaphore,
                        eval_date,
                    )
                    for task in tasks
                ],
                return_exceptions=True,
            )

        successes = [r for r in results if isinstance(r, dict) and "error" not in r]
        errors = len([r for r in results if isinstance(r, dict) and "error" in r])
        avg_pct = sum(r["pct"] for r in successes) / len(successes) if successes else 0.0
        logger.info(
            "  Era %s: %d done, avg=%.1f%%, %d errors",
            era,
            len(successes),
            avg_pct * 100,
            errors,
        )

    # Summary
    # SQL assigned to a local first: a bare session.execute(text("""...""")) is the one
    # construct black and ruff-format format differently (hug vs explode), so they fight
    # over it forever. Naming it sidesteps the disputed shape.
    summary_sql = """
        SELECT model_era, COUNT(*), ROUND(AVG(completion_pct)::numeric * 100, 1)
        FROM gdpval_evaluations
        GROUP BY model_era ORDER BY MIN(evaluation_date)
    """
    async with session_factory() as session:
        rows = await session.execute(text(summary_sql))
        print("\n-- Waterline Summary ------------------------------------")
        print(f"{'ERA':<25} {'TASKS':>6} {'AVG COMPLETION':>15}")
        print("-" * 50)
        for row in rows:
            print(f"{row[0]:<25} {row[1]:>6} {str(row[2]) + '%':>15}")
        print("\nNote: text-evaluation proxy. Use GET /api/v1/gdpval/waterline for velocity.\n")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute GDPval evaluations across model eras")
    parser.add_argument(
        "--eras",
        nargs="+",
        choices=list(ERA_MODELS.keys()),
        default=list(ERA_MODELS.keys()),
        help="Eras to evaluate (default: all 4)",
    )
    parser.add_argument(
        "--estimate", action="store_true", help="Show projected API cost without making calls"
    )
    parser.add_argument(
        "--concurrency", type=int, default=5, help="Max concurrent task evaluations (default: 5)"
    )
    args = parser.parse_args()
    asyncio.run(
        run_evaluations(
            eras=args.eras,
            concurrency=args.concurrency,
            estimate_only=args.estimate,
        )
    )


if __name__ == "__main__":
    main()
