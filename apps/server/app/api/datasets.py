from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, get_duckdb
from app.middleware.auth import get_current_user
from app.models.dataset import Dataset
from app.schemas.auth import AuthenticatedUser
from app.schemas.dataset import DatasetListItem, DatasetOut, DatasetSchema, PreviewResponse
from app.services.schema_discovery import discover_schema

router = APIRouter(prefix="/datasets", tags=["datasets"])

_ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}


# ── POST /datasets/upload ─────────────────────────────────────────────────────

@router.post("/upload", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DatasetOut:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{suffix}'. Allowed: {_ALLOWED_EXTENSIONS}",
        )

    # 1. Persist file to disk
    dataset_id = uuid.uuid4()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{dataset_id}{suffix}"

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    try:
        # 2. Discover schema
        schema: DatasetSchema = discover_schema(str(file_path))

        # 3. Store data into DuckDB
        _load_into_duckdb(str(file_path), suffix, dataset_id, schema)

        # 4. Persist metadata to PostgreSQL
        dataset_name = Path(file.filename or "").stem
        source_type = suffix.lstrip(".")
        dataset = Dataset(
            id=dataset_id,
            name=dataset_name,
            source_type=source_type,
            schema_info=schema.model_dump(),
            row_count=schema.row_count,
            file_path=str(file_path),
            created_by=current_user.user_id,
        )
        db.add(dataset)
        await db.commit()
        await db.refresh(dataset)
        return dataset  # type: ignore[return-value]

    except Exception as exc:
        # Clean up uploaded file on failure
        try:
            os.remove(file_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to process file: {exc}",
        )


def _load_into_duckdb(
    file_path: str, suffix: str, dataset_id: uuid.UUID, schema: DatasetSchema
) -> None:
    """Load file data into a DuckDB table named dataset_{uuid_hex}."""
    table_name = f"dataset_{dataset_id.hex}"
    conn = get_duckdb()

    # Drop table if it already exists (re-upload scenario)
    conn.execute(f'DROP TABLE IF EXISTS "{table_name}"')

    if suffix in (".xlsx", ".xls"):
        # Read with openpyxl then INSERT via DuckDB
        import openpyxl
        wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        wb.close()
        if not rows:
            return

        headers = [str(h) if h is not None else f"col_{i}" for i, h in enumerate(rows[0])]
        data_rows = rows[1:]

        # Build CREATE TABLE from discovered schema
        col_defs = ", ".join(
            f'"{col.name}" VARCHAR' for col in schema.columns
        )
        conn.execute(f'CREATE TABLE "{table_name}" ({col_defs})')

        # Batch insert
        placeholders = ", ".join("?" * len(headers))
        insert_sql = f'INSERT INTO "{table_name}" VALUES ({placeholders})'
        for row in data_rows:
            padded = list(row) + [None] * max(0, len(headers) - len(row))
            str_row = [
                str(v) if v is not None and str(v).strip() != "" else None
                for v in padded[: len(headers)]
            ]
            conn.execute(insert_sql, str_row)

    elif suffix == ".csv":
        # DuckDB can read CSVs natively
        conn.execute(
            f'CREATE TABLE "{table_name}" AS SELECT * FROM read_csv_auto(?)',
            [file_path],
        )

    conn.close()


# ── GET /datasets ─────────────────────────────────────────────────────────────

@router.get("", response_model=List[DatasetListItem])
async def list_datasets(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[DatasetListItem]:
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Dataset)
        .where(Dataset.is_active == True)  # noqa: E712
        .order_by(Dataset.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    datasets = result.scalars().all()
    return [
        DatasetListItem(
            id=ds.id,
            name=ds.name,
            source_type=ds.source_type,
            row_count=ds.row_count,
            column_count=len(ds.schema_info.get("columns", [])),
            created_at=ds.created_at,
        )
        for ds in datasets
    ]


# ── GET /datasets/{id} ────────────────────────────────────────────────────────

@router.get("/{dataset_id}", response_model=DatasetOut)
async def get_dataset(
    dataset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> DatasetOut:
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.is_active == True)  # noqa: E712
    )
    dataset = result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return dataset  # type: ignore[return-value]


# ── GET /datasets/{id}/preview ────────────────────────────────────────────────

@router.get("/{dataset_id}/preview", response_model=PreviewResponse)
async def preview_dataset(
    dataset_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PreviewResponse:
    # Verify dataset exists
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.is_active == True)  # noqa: E712
    )
    dataset = result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    table_name = f"dataset_{dataset_id.hex}"
    try:
        conn = get_duckdb()
        rel = conn.execute(f'SELECT * FROM "{table_name}" LIMIT ?', [limit])
        columns = [desc[0] for desc in rel.description]
        rows = [list(row) for row in rel.fetchall()]
        conn.close()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query dataset: {exc}",
        )

    return PreviewResponse(
        columns=columns,
        rows=rows,
        total_rows=dataset.row_count,
    )


# ── GET /datasets/{id}/field-values ──────────────────────────────────────────

@router.get("/{dataset_id}/field-values", response_model=List[str])
async def get_field_values(
    dataset_id: uuid.UUID,
    field: str = Query(..., description="Column name to get distinct values for"),
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> List[str]:
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.is_active == True)  # noqa: E712
    )
    dataset = result.scalars().first()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    # Validate field exists in schema
    schema_columns = [c["name"] for c in dataset.schema_info.get("columns", [])]
    if field not in schema_columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Field '{field}' not found")

    table_name = f"dataset_{dataset_id.hex}"
    try:
        conn = get_duckdb()
        rel = conn.execute(
            f'SELECT DISTINCT "{field}" FROM "{table_name}" WHERE "{field}" IS NOT NULL ORDER BY "{field}" LIMIT 200'
        )
        values = [str(row[0]) for row in rel.fetchall()]
        conn.close()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    return values
