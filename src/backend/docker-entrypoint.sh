#!/bin/sh
# Migrate, then restore the seed dataset on a genuinely empty database only
# (safe across container restarts — never re-inserts into a populated DB).
set -e

echo "Running migrations..."
python -m alembic upgrade head

OCCUPATION_COUNT=$(python -c "
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import settings


async def main() -> None:
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        result = await conn.execute(text('SELECT COUNT(*) FROM onet_occupations'))
        print(result.scalar())
    await engine.dispose()


asyncio.run(main())
")

if [ "$OCCUPATION_COUNT" = "0" ]; then
    echo "Empty database -- restoring the seed dataset..."
    python -m scripts.restore_seed
else
    echo "Database already has data ($OCCUPATION_COUNT occupations) -- skipping seed restore."
fi

exec "$@"
