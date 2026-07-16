"""Preflight check for local development (P3 of the release backlog).

Verifies the prerequisites CONTRIBUTING.md / docs/SETUP.md describe are
actually in place, and reports what's missing rather than letting the first
symptom be a cryptic stack trace from alembic or uvicorn.

Usage:
    python -m scripts.doctor
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent.parent
MIN_PYTHON = (3, 12)
MIN_NODE_MAJOR = 20


def _ok(label: str, detail: str = "") -> None:
    print(f"  [OK]   {label}{(' -- ' + detail) if detail else ''}")


def _warn(label: str, detail: str = "") -> None:
    print(f"  [WARN] {label}{(' -- ' + detail) if detail else ''}")


def _fail(label: str, detail: str = "") -> None:
    print(f"  [FAIL] {label}{(' -- ' + detail) if detail else ''}")


def check_python() -> bool:
    version = sys.version_info[:2]
    if version >= MIN_PYTHON:
        _ok("Python version", f"{sys.version.split()[0]}")
        return True
    _fail("Python version", f"found {version}, need >= {MIN_PYTHON}")
    return False


def check_node() -> bool:
    node = shutil.which("node")
    if not node:
        _warn("Node.js", "not found on PATH -- needed for the frontend (src/frontend)")
        return True  # not a backend blocker
    try:
        out = subprocess.run([node, "--version"], capture_output=True, text=True, check=True)
        version_str = out.stdout.strip().lstrip("v")
        major = int(version_str.split(".")[0])
    except (subprocess.SubprocessError, ValueError, IndexError):
        _warn("Node.js", "found but couldn't parse version")
        return True
    if major >= MIN_NODE_MAJOR:
        _ok("Node.js version", version_str)
        return True
    _warn("Node.js version", f"found {version_str}, recommend >= {MIN_NODE_MAJOR}")
    return True


def check_env_file() -> bool:
    env_path = BACKEND_DIR / ".env"
    if env_path.exists():
        _ok(".env file", str(env_path))
        return True
    _fail(".env file", f"missing at {env_path} -- copy .env.example and edit DATABASE_URL")
    return False


async def check_database() -> tuple[bool, bool]:
    """Returns (reachable, pgvector_installed)."""
    try:
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import create_async_engine

        from app.core.config import settings
    except Exception as exc:  # import-time failure means deps aren't installed
        _fail("Backend package importable", str(exc))
        return False, False

    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            _ok("Database reachable", settings.database_url.split("@")[-1])

            ext_rows = (
                await conn.execute(
                    text("SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_trgm')")
                )
            ).all()
            installed = {r[0] for r in ext_rows}
            has_vector = "vector" in installed
            if has_vector:
                _ok("pgvector extension")
            else:
                _fail(
                    "pgvector extension",
                    "not installed -- required (semantic search, HNSW indexes)",
                )
            if "pg_trgm" in installed:
                _ok("pg_trgm extension")
            else:
                _warn("pg_trgm extension", "not installed -- fuzzy title search will fail")
            return True, has_vector
    except Exception as exc:
        _fail("Database reachable", str(exc))
        return False, False
    finally:
        await engine.dispose()


async def check_migrations() -> bool:
    try:
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import create_async_engine

        from app.core.config import settings
    except Exception:
        return False

    migrations_dir = BACKEND_DIR / "migrations" / "versions"
    revisions = [
        p.name.split("_", 1)[0] for p in migrations_dir.glob("*.py") if p.stem[0].isdigit()
    ]
    latest = max(revisions) if revisions else None

    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            row = result.first()
            current = row[0] if row else None
    except Exception as exc:
        _warn("Alembic schema version", f"couldn't check -- {exc}")
        return False
    finally:
        await engine.dispose()

    if current is None:
        _fail("Alembic schema version", "no alembic_version row -- run `alembic upgrade head`")
        return False
    if latest and current != latest:
        _warn(
            "Alembic schema version",
            f"at {current}, latest migration is {latest} -- run `alembic upgrade head`",
        )
        return False
    _ok("Alembic schema version", f"up to date ({current})")
    return True


def check_seed_dataset() -> bool:
    manifest = BACKEND_DIR / "data" / "seed" / "manifest.json"
    if manifest.exists():
        _ok("Seed dataset", "present -- python -m scripts.restore_seed to load it")
    else:
        _warn("Seed dataset", f"manifest missing at {manifest}")
    return True


def check_docker() -> bool:
    if shutil.which("docker"):
        _ok("Docker", "available -- `docker compose up` is also an option")
    else:
        _warn("Docker", "not found -- fine if you're running natively")
    return True


async def run() -> int:
    print("SkillCurrent preflight check\n")
    results = [
        check_python(),
        check_node(),
        check_env_file(),
    ]

    db_reachable, _ = await check_database()
    results.append(db_reachable)
    if db_reachable:
        results.append(await check_migrations())

    results.append(check_seed_dataset())
    results.append(check_docker())

    print()
    if all(results):
        print("All checks passed.")
        return 0
    print("One or more checks failed -- see [FAIL] lines above.")
    return 1


def main() -> None:
    import asyncio

    sys.exit(asyncio.run(run()))


if __name__ == "__main__":
    main()
