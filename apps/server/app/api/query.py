from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.dataset import Dataset
from app.schemas.auth import AuthenticatedUser
from app.schemas.dataset import DatasetSchema
from app.schemas.query import AskRequest, AskResponse, QueryData
from app.services.ai_engine import generate_sql
from app.services.permission_resolver import PermissionResolver
from app.services.query_executor import check_sql_safety, execute_query

router = APIRouter(prefix="/query", tags=["query"])


@router.post("/ask", response_model=AskResponse)
async def ask(
    body: AskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AskResponse:
    """
    Flow:
      1. Load dataset schema from PostgreSQL
      2. Call AI → get SQL + explanation + chart_type
      3. Safety-check the AI-generated SQL
      4. Permission Resolver → inject RLS WHERE clauses via CTE
      5. Execute against DuckDB (with one AI retry on failure)
      6. Apply column masking on results
      7. Return results + chart config + scope_desc
    """
    # 1. Load dataset
    result = await db.execute(
        select(Dataset).where(
            Dataset.id == body.dataset_id,
            Dataset.is_active == True,  # noqa: E712
        )
    )
    dataset = result.scalar_one_or_none()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    table_name = f"dataset_{dataset.id.hex}"
    schema = DatasetSchema(**dataset.schema_info)

    # 2. Generate SQL via AI
    try:
        generated = await generate_sql(
            question=body.question,
            table_name=table_name,
            schema=schema,
            role=current_user.role,
            scope_desc=current_user.scope_desc,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"AI engine error: {exc}",
        )

    # 3. SQL safety check (on the raw AI SQL, before RLS wrapping)
    safety = check_sql_safety(generated.sql, allowed_tables=[table_name])
    if not safety.safe:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Generated SQL failed safety check: {safety.reason}",
        )

    # 4. Permission Resolver — inject RLS WHERE + get masked columns
    resolver = PermissionResolver(db)
    try:
        resolved = await resolver.resolve(
            user=current_user,
            dataset_id=body.dataset_id,
            base_sql=generated.sql,
            table_name=table_name,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        )

    final_sql = resolved["sql"]
    masked_columns: list[dict] = resolved["masked_columns"]

    # 5. Execute, with one AI retry on failure
    try:
        query_result = execute_query(final_sql, dataset_table=table_name)
    except Exception as first_err:
        # Ask AI to fix with error context (retry on the original SQL, then re-resolve)
        try:
            generated = await generate_sql(
                question=body.question,
                table_name=table_name,
                schema=schema,
                role=current_user.role,
                scope_desc=current_user.scope_desc,
                error_context=str(first_err),
            )
            safety = check_sql_safety(generated.sql, allowed_tables=[table_name])
            if not safety.safe:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Corrected SQL failed safety check: {safety.reason}",
                )
            resolved = await resolver.resolve(
                user=current_user,
                dataset_id=body.dataset_id,
                base_sql=generated.sql,
                table_name=table_name,
            )
            final_sql = resolved["sql"]
            masked_columns = resolved["masked_columns"]
            query_result = execute_query(final_sql, dataset_table=table_name)
        except HTTPException:
            raise
        except Exception as second_err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Query execution failed after retry: {second_err}",
            )

    # 6. Apply column masking (hide columns with mask_type='hide')
    columns = query_result.columns
    rows = query_result.rows

    hidden_cols = {m["column"] for m in masked_columns if m["mask_type"] == "hide"}
    if hidden_cols:
        visible_indices = [i for i, c in enumerate(columns) if c not in hidden_cols]
        columns = [columns[i] for i in visible_indices]
        rows = [[row[i] for i in visible_indices] for row in rows]

    # 7. Return results
    return AskResponse(
        sql=generated.sql,           # return original AI SQL (not CTE-wrapped) for display
        explanation=generated.explanation,
        chart_type=generated.chart_type,
        data=QueryData(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            execution_time_ms=query_result.execution_time_ms,
        ),
        dataset_id=str(body.dataset_id),
        scope_desc=current_user.scope_desc,
        debug_sql=final_sql,         # actual executed SQL with RLS injection
    )
