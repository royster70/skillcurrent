"""Test configuration and fixtures.

Uses the real PostgreSQL database with transaction rollback per test.
No mocking — tests hit the actual database to catch real integration issues.
"""

from collections.abc import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

# Use the same DB but could be a separate test DB
TEST_DATABASE_URL = "postgresql+asyncpg://workforce:dev_only@localhost:5432/workforce_ai"


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    """Per-test database session with transaction rollback.

    Each test runs inside a transaction that is rolled back after the test,
    so tests don't pollute each other or the real data.

    Creates a fresh engine per test to avoid event-loop-closed errors
    with pytest-asyncio's per-function loop scope.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    try:
        async with engine.connect() as conn:
            trans = await conn.begin()
            sess = AsyncSession(bind=conn, expire_on_commit=False)
            try:
                yield sess
            finally:
                await trans.rollback()
                await sess.close()
    finally:
        await engine.dispose()
