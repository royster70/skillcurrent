# API + first-boot seed restore. Not the ingestion pipeline image — that needs
# the [ingest] extra and the raw Data/ tree (see docs/INGESTION_RUNBOOK.md).
FROM python:3.12-slim

WORKDIR /app

# build-essential: some transitive deps (e.g. sentence-transformers' compiled
# extras) don't ship musl/slim-compatible wheels for every platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app
COPY scripts ./scripts
COPY migrations ./migrations
COPY alembic.ini ./
COPY data ./data

RUN pip install --no-cache-dir -e .

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
