"""
FastAPI router for geometry-native work orders.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from auth_deps import get_current_user
from db import get_db, utc_now_iso
from job_security import ensure_job_access
from work_order_models import (
    SortBy,
    SortOrder,
    WOCategory,
    WOCreate,
    WOPriority,
    WOResponse,
    WOStatus,
    WOSummary,
    WOUpdate,
)

router = APIRouter(prefix="/api/work-orders", tags=["work-orders"])

SELECT_COLUMNS = """
    id, job_id, work_order_no, global_id, element_name, element_type, storey,
    category, title, description, priority, status,
    assigned_to, due_date, completed_at, estimated_hours, actual_hours, cost,
    external_system, external_work_order_id, external_sync_status, external_synced_at,
    created_at, updated_at
"""

STATUS_ORDER_EXPR = """
CASE status
    WHEN 'open' THEN 1
    WHEN 'in_progress' THEN 2
    WHEN 'on_hold' THEN 3
    WHEN 'resolved' THEN 4
    WHEN 'closed' THEN 5
    ELSE 99
END
"""

PRIORITY_ORDER_EXPR = """
CASE priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 99
END
"""

SORT_COLUMN_MAP = {
    "updated_at": "updated_at",
    "created_at": "created_at",
    "due_date": "due_date",
    "work_order_no": "work_order_no",
    "status": STATUS_ORDER_EXPR,
    "priority": PRIORITY_ORDER_EXPR,
}

ALLOWED_STATUSES = ("open", "in_progress", "on_hold", "resolved", "closed")
ALLOWED_PRIORITIES = ("low", "medium", "high", "critical")
ALLOWED_CATEGORIES = (
    "inspection",
    "repair",
    "replacement",
    "preventive",
    "corrective",
    "note",
    "issue",
)
ACTIVE_STATUSES = ("open", "in_progress", "on_hold")


def _to_response(row: Any) -> WOResponse:
    return WOResponse(**dict(row))


async def _get_work_order_row(db, job_id: str, wo_id: int):
    cursor = await db.execute(
        f"""
        SELECT {SELECT_COLUMNS}
        FROM work_orders
        WHERE job_id = ? AND id = ? AND deleted_at IS NULL
        """,
        (job_id, wo_id),
    )
    row = await cursor.fetchone()
    await cursor.close()
    return row


async def _next_work_order_no(db, job_id: str) -> str:
    cursor = await db.execute(
        """
        SELECT COALESCE(MAX(CAST(SUBSTR(work_order_no, 4) AS INTEGER)), 0) + 1 AS next_seq
        FROM work_orders
        WHERE job_id = ?
        """,
        (job_id,),
    )
    row = await cursor.fetchone()
    await cursor.close()
    next_seq = int(row["next_seq"] if row else 1)
    return f"WO-{next_seq:04d}"


@router.get("/{job_id}", response_model=list[WOResponse])
async def list_work_orders(
    job_id: str,
    status: WOStatus | None = None,
    priority: WOPriority | None = None,
    category: WOCategory | None = None,
    global_id: str | None = None,
    assigned_to: str | None = None,
    storey: str | None = None,
    search: str | None = None,
    sort_by: SortBy = "updated_at",
    sort_order: SortOrder = "desc",
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))

    query = f"""
        SELECT {SELECT_COLUMNS}
        FROM work_orders
        WHERE job_id = ? AND deleted_at IS NULL
    """
    params: list[Any] = [job_id]

    if status:
        query += " AND status = ?"
        params.append(status)
    if priority:
        query += " AND priority = ?"
        params.append(priority)
    if category:
        query += " AND category = ?"
        params.append(category)
    if global_id:
        query += " AND global_id = ?"
        params.append(global_id)
    if assigned_to:
        query += " AND assigned_to = ?"
        params.append(assigned_to)
    if storey:
        query += " AND storey = ?"
        params.append(storey)
    if search:
        pattern = f"%{search.strip()}%"
        query += " AND (title LIKE ? OR description LIKE ? OR work_order_no LIKE ?)"
        params.extend([pattern, pattern, pattern])

    direction = "ASC" if sort_order == "asc" else "DESC"
    order_expression = SORT_COLUMN_MAP.get(sort_by, "updated_at")
    query += f" ORDER BY {order_expression} {direction}, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    db = await get_db()
    try:
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        await cursor.close()
        return [_to_response(row) for row in rows]
    finally:
        await db.close()


@router.get("/{job_id}/summary", response_model=WOSummary)
async def get_work_orders_summary(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))

    summary = WOSummary(
        status={key: 0 for key in ALLOWED_STATUSES},
        priority={key: 0 for key in ALLOWED_PRIORITIES},
        category={key: 0 for key in ALLOWED_CATEGORIES},
        overdue=0,
        total=0,
    )

    db = await get_db()
    try:
        status_cursor = await db.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM work_orders
            WHERE job_id = ? AND deleted_at IS NULL
            GROUP BY status
            """,
            (job_id,),
        )
        status_rows = await status_cursor.fetchall()
        await status_cursor.close()
        for row in status_rows:
            status_key = str(row["status"])
            if status_key in summary.status:
                count = int(row["count"])
                summary.status[status_key] = count
                summary.total += count

        priority_cursor = await db.execute(
            """
            SELECT priority, COUNT(*) AS count
            FROM work_orders
            WHERE job_id = ? AND deleted_at IS NULL
            GROUP BY priority
            """,
            (job_id,),
        )
        priority_rows = await priority_cursor.fetchall()
        await priority_cursor.close()
        for row in priority_rows:
            priority_key = str(row["priority"])
            if priority_key in summary.priority:
                summary.priority[priority_key] = int(row["count"])

        category_cursor = await db.execute(
            """
            SELECT category, COUNT(*) AS count
            FROM work_orders
            WHERE job_id = ? AND deleted_at IS NULL
            GROUP BY category
            """,
            (job_id,),
        )
        category_rows = await category_cursor.fetchall()
        await category_cursor.close()
        for row in category_rows:
            category_key = str(row["category"])
            if category_key in summary.category:
                summary.category[category_key] = int(row["count"])

        overdue_cursor = await db.execute(
            """
            SELECT COUNT(*) AS count
            FROM work_orders
            WHERE job_id = ?
              AND deleted_at IS NULL
              AND due_date IS NOT NULL
              AND status IN (?, ?, ?)
              AND due_date < ?
            """,
            (job_id, *ACTIVE_STATUSES, utc_now_iso()),
        )
        overdue_row = await overdue_cursor.fetchone()
        await overdue_cursor.close()
        summary.overdue = int(overdue_row["count"] if overdue_row else 0)

        return summary
    finally:
        await db.close()


@router.get("/{job_id}/{wo_id}", response_model=WOResponse)
async def get_work_order(
    job_id: str,
    wo_id: int,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    db = await get_db()
    try:
        row = await _get_work_order_row(db, job_id, wo_id)
        if not row:
            raise HTTPException(status_code=404, detail="Work order not found")
        return _to_response(row)
    finally:
        await db.close()


@router.post("/{job_id}", response_model=WOResponse, status_code=201)
async def create_work_order(
    job_id: str,
    payload: WOCreate,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    now = utc_now_iso()

    db = await get_db()
    try:
        await db.execute("BEGIN IMMEDIATE")
        work_order_no = await _next_work_order_no(db, job_id)

        completed_at = now if payload.status == "closed" else None

        cursor = await db.execute(
            """
            INSERT INTO work_orders (
                job_id, work_order_no, global_id, element_name, element_type, storey,
                category, title, description, priority, status,
                assigned_to, due_date, completed_at, estimated_hours, actual_hours, cost,
                external_system, external_work_order_id, external_sync_status, external_synced_at,
                created_at, updated_at, deleted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                job_id,
                work_order_no,
                payload.global_id,
                payload.element_name,
                payload.element_type,
                payload.storey,
                payload.category,
                payload.title,
                payload.description,
                payload.priority,
                payload.status,
                payload.assigned_to,
                payload.due_date,
                completed_at,
                payload.estimated_hours,
                payload.actual_hours,
                payload.cost,
                payload.external_system,
                payload.external_work_order_id,
                payload.external_sync_status,
                now if payload.external_sync_status else None,
                now,
                now,
            ),
        )
        wo_id = int(cursor.lastrowid)
        await cursor.close()
        await db.commit()

        row = await _get_work_order_row(db, job_id, wo_id)
        if not row:
            raise HTTPException(status_code=500, detail="Failed to load created work order")
        return _to_response(row)
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create work order: {exc}") from exc
    finally:
        await db.close()


@router.patch("/{job_id}/{wo_id}", response_model=WOResponse)
async def update_work_order(
    job_id: str,
    wo_id: int,
    payload: WOUpdate,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No update fields provided")

    now = utc_now_iso()
    status = changes.get("status")
    if status == "closed":
        changes["completed_at"] = now
    elif status and status != "closed" and "completed_at" not in changes:
        changes["completed_at"] = None

    if "external_sync_status" in changes:
        changes["external_synced_at"] = now if changes["external_sync_status"] else None

    changes["updated_at"] = now
    set_clause = ", ".join([f"{key} = ?" for key in changes.keys()])
    params = [*changes.values(), job_id, wo_id]

    db = await get_db()
    try:
        cursor = await db.execute(
            f"""
            UPDATE work_orders
            SET {set_clause}
            WHERE job_id = ? AND id = ? AND deleted_at IS NULL
            """,
            params,
        )
        await db.commit()
        changed_rows = cursor.rowcount
        await cursor.close()

        if changed_rows == 0:
            raise HTTPException(status_code=404, detail="Work order not found")

        row = await _get_work_order_row(db, job_id, wo_id)
        if not row:
            raise HTTPException(status_code=404, detail="Work order not found")
        return _to_response(row)
    finally:
        await db.close()


@router.delete("/{job_id}/{wo_id}")
async def delete_work_order(
    job_id: str,
    wo_id: int,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    await ensure_job_access(job_id, int(current_user["id"]))
    now = utc_now_iso()
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            UPDATE work_orders
            SET deleted_at = ?, updated_at = ?
            WHERE job_id = ? AND id = ? AND deleted_at IS NULL
            """,
            (now, now, job_id, wo_id),
        )
        await db.commit()
        deleted_rows = cursor.rowcount
        await cursor.close()

        if deleted_rows == 0:
            raise HTTPException(status_code=404, detail="Work order not found")

        return {"status": "deleted", "id": wo_id}
    finally:
        await db.close()
