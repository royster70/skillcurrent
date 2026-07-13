"""Dataset version endpoints — data vintage for dashboard footers."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas import DatasetVersionResponse, DatasetVersionsResponse
from app.db.session import get_db

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("", response_model=DatasetVersionsResponse)
async def list_datasets(db: AsyncSession = Depends(get_db)) -> DatasetVersionsResponse:
    """List all loaded dataset versions with row counts."""
    r = await db.execute(
        text(
            """
        SELECT dataset_name, version_key, row_count,
               ingested_at::TEXT, source_url
        FROM dataset_versions ORDER BY id
    """
        )
    )
    datasets = [
        DatasetVersionResponse(
            dataset_name=row[0],
            version_key=row[1],
            row_count=row[2],
            ingested_at=row[3],
            source_url=row[4],
        )
        for row in r.fetchall()
    ]
    return DatasetVersionsResponse(
        datasets=datasets,
        total_rows=sum(d.row_count for d in datasets),
    )
