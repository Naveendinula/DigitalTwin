"""
FastAPI router for per-element maintenance logs.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Depends

from auth_deps import get_current_user
from db import get_db, utc_now_iso
from job_security import ensure_job_access
from maintenance_models import LogResponse, LogCreate, LogUpdate, LogStatus, LogCategory

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])

ALLOWED_STATUSES = ("open", "in_progress", "resolved", "closed")
ALLOWED_PRIORITIES = ("low", "medium", "high", "critical")


def _to_log_response(row: Any) -> LogResponse:
    return LogResponse(**dict(row))


async def _get_log_row(db, job_id: str, log_id: int):
    cursor = await db.execute(
        """
        SELECT
            id, job_id, global_id, element_name, element_type,
            category, title, description, priority, status,
            created_at, updated_at
        FROM maintenance_logs
        WHERE job_id = ? AND id = ?
        """,
        (job_id, log_id),
    )
    row = await cursor.fetchone()
    await cursor.close()
    return row


@router.get("/{job_id}", response_model=list[LogResponse])
async def list_logs(
    job_id: str,
    status: LogStatus | None = None,
    global_id: str | None = None,
    category: LogCategory | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    query = """
        SELECT
            id, job_id, global_id, element_name, element_type,
            category, title, description, priority, status,
            created_at, updated_at
        FROM maintenance_logs
        WHERE job_id = ?
    """
    params: list[Any] = [job_id]

    if status:
        query += " AND status = ?"
        params.append(status)
    if global_id:
        query += " AND global_id = ?"
        params.append(global_id)
    if category:
        query += " AND category = ?"
        params.append(category)

    query += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    db = await get_db()
    try:
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        await cursor.close()
        return [_to_log_response(row) for row in rows]
    finally:
        await db.close()


@router.get("/{job_id}/summary")
async def get_logs_summary(job_id: str, current_user: dict[str, Any] = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
    summary = {
        "open": 0,
        "in_progress": 0,
        "resolved": 0,
        "closed": 0,
        "low": 0,
        "medium": 0,
        "high": 0,
        "critical": 0,
        "total": 0,
    }

    db = await get_db()
    try:
        status_cursor = await db.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM maintenance_logs
            WHERE job_id = ?
            GROUP BY status
            """,
            (job_id,),
        )
        status_rows = await status_cursor.fetchall()
        await status_cursor.close()

        for row in status_rows:
            status_key = row["status"]
            if status_key in ALLOWED_STATUSES:
                summary[status_key] = row["count"]
                summary["total"] += row["count"]

        priority_cursor = await db.execute(
            """
            SELECT priority, COUNT(*) AS count
            FROM maintenance_logs
            WHERE job_id = ?
            GROUP BY priority
            """,
            (job_id,),
        )
        priority_rows = await priority_cursor.fetchall()
        await priority_cursor.close()

        for row in priority_rows:
            priority_key = row["priority"]
            if priority_key in ALLOWED_PRIORITIES:
                summary[priority_key] = row["count"]

        return summary
    finally:
        await db.close()


@router.get("/{job_id}/{log_id}", response_model=LogResponse)
async def get_log(job_id: str, log_id: int, current_user: dict[str, Any] = Depends(get_current_user)):
    await ensure_job_access(job_id, int(current_user["id"]))
    db = await get_db()
    try:
        row = await _get_log_row(db, job_id, log_id)
        if not row:
            raise HTTPException(status_code=404, detail="Maintenance log not found")
        return _to_log_response(row)
    finally:
        await db.close()


@router.post("/{job_id}", response_model=LogResponse, status_code=201)
async def create_log(
    job_id: str,
    payload: LogCreate,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    now = utc_now_iso()
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            INSERT INTO maintenance_logs (
                job_id, global_id, element_name, element_type,
                category, title, description, priority, status,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                payload.global_id,
                payload.element_name,
                payload.element_type,
                payload.category,
                payload.title,
                payload.description,
                payload.priority,
                "open",
                now,
                now,
            ),
        )
        await db.commit()
        log_id = cursor.lastrowid
        await cursor.close()

        row = await _get_log_row(db, job_id, log_id)
        if not row:
            raise HTTPException(status_code=500, detail="Failed to load created log")
        return _to_log_response(row)
    finally:
        await db.close()


@router.patch("/{job_id}/{log_id}", response_model=LogResponse)
async def update_log(
    job_id: str,
    log_id: int,
    payload: LogUpdate,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No update fields provided")

    changes["updated_at"] = utc_now_iso()
    set_clause = ", ".join([f"{key} = ?" for key in changes.keys()])
    params = [*changes.values(), job_id, log_id]

    db = await get_db()
    try:
        cursor = await db.execute(
            f"""
            UPDATE maintenance_logs
            SET {set_clause}
            WHERE job_id = ? AND id = ?
            """,
            params,
        )
        await db.commit()
        changed_rows = cursor.rowcount
        await cursor.close()

        if changed_rows == 0:
            raise HTTPException(status_code=404, detail="Maintenance log not found")

        row = await _get_log_row(db, job_id, log_id)
        if not row:
            raise HTTPException(status_code=404, detail="Maintenance log not found")
        return _to_log_response(row)
    finally:
        await db.close()


@router.delete("/{job_id}/{log_id}")
async def delete_log(
    job_id: str,
    log_id: int,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    db = await get_db()
    try:
        cursor = await db.execute(
            "DELETE FROM maintenance_logs WHERE job_id = ? AND id = ?",
            (job_id, log_id),
        )
        await db.commit()
        deleted_rows = cursor.rowcount
        await cursor.close()

        if deleted_rows == 0:
            raise HTTPException(status_code=404, detail="Maintenance log not found")

        return {"status": "deleted", "id": log_id}
    finally:
        await db.close()
