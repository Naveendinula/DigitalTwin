"""
Helpers for model-job ownership and file access checks.
"""

from __future__ import annotations

import hashlib
import secrets
from typing import Any

from fastapi import Depends, HTTPException

from auth_deps import get_current_user
from db import get_db, utc_now_iso


def create_file_access_token() -> str:
    return secrets.token_urlsafe(32)


def hash_file_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_job_record(
    *,
    job_id: str,
    owner_user_id: int,
    original_filename: str,
    stored_ifc_name: str,
    file_access_token: str,
    file_hash: str = "",
    status: str = "pending",
) -> None:
    now = utc_now_iso()
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO model_jobs (
                job_id, owner_user_id, original_filename, stored_ifc_name,
                file_token_hash, file_hash, status, created_at, updated_at, last_opened_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                job_id,
                owner_user_id,
                original_filename,
                stored_ifc_name,
                hash_file_access_token(file_access_token),
                file_hash,
                status,
                now,
                now,
            ),
        )
        await db.commit()
    finally:
        await db.close()


async def user_can_access_job(job_id: str, user_id: int) -> bool:
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT 1
            FROM model_jobs
            WHERE job_id = ? AND owner_user_id = ?
            LIMIT 1
            """,
            (job_id, user_id),
        )
        row = await cursor.fetchone()
        await cursor.close()
        return row is not None
    finally:
        await db.close()


async def ensure_job_access(job_id: str, user_id: int) -> None:
    allowed = await user_can_access_job(job_id, user_id)
    if not allowed:
        raise HTTPException(status_code=404, detail="Job not found")


async def require_job_access_user(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    await ensure_job_access(job_id, int(current_user["id"]))
    return current_user


async def is_valid_job_file_token(job_id: str, token: str) -> bool:
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT file_token_hash
            FROM model_jobs
            WHERE job_id = ?
            LIMIT 1
            """,
            (job_id,),
        )
        row = await cursor.fetchone()
        await cursor.close()
        if not row:
            return False

        expected_hash = str(row["file_token_hash"])
        token_hash = hash_file_access_token(token)
        return secrets.compare_digest(expected_hash, token_hash)
    finally:
        await db.close()


async def list_user_job_ids(user_id: int) -> set[str]:
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT job_id
            FROM model_jobs
            WHERE owner_user_id = ?
            """,
            (user_id,),
        )
        rows = await cursor.fetchall()
        await cursor.close()
        return {str(row["job_id"]) for row in rows}
    finally:
        await db.close()


async def find_user_job_by_file_hash(user_id: int, file_hash: str) -> dict[str, Any] | None:
    if not file_hash:
        return None
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT
                job_id, owner_user_id, original_filename, stored_ifc_name,
                file_hash, ifc_schema, status, created_at, updated_at, last_opened_at
            FROM model_jobs
            WHERE owner_user_id = ? AND file_hash = ?
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
            """,
            (user_id, file_hash),
        )
        row = await cursor.fetchone()
        await cursor.close()
        return dict(row) if row else None
    finally:
        await db.close()


async def update_job_record_status(
    job_id: str,
    *,
    status: str,
    ifc_schema: str | None = None,
) -> None:
    now = utc_now_iso()
    db = await get_db()
    try:
        if ifc_schema is None:
            await db.execute(
                """
                UPDATE model_jobs
                SET status = ?, updated_at = ?
                WHERE job_id = ?
                """,
                (status, now, job_id),
            )
        else:
            await db.execute(
                """
                UPDATE model_jobs
                SET status = ?, ifc_schema = ?, updated_at = ?
                WHERE job_id = ?
                """,
                (status, ifc_schema, now, job_id),
            )
        await db.commit()
    finally:
        await db.close()


async def touch_job_opened(job_id: str, user_id: int) -> None:
    now = utc_now_iso()
    db = await get_db()
    try:
        await db.execute(
            """
            UPDATE model_jobs
            SET last_opened_at = ?, updated_at = ?
            WHERE job_id = ? AND owner_user_id = ?
            """,
            (now, now, job_id, user_id),
        )
        await db.commit()
    finally:
        await db.close()


async def rotate_job_file_access_token(job_id: str, user_id: int) -> str:
    token = create_file_access_token()
    now = utc_now_iso()
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            UPDATE model_jobs
            SET file_token_hash = ?, updated_at = ?
            WHERE job_id = ? AND owner_user_id = ?
            """,
            (hash_file_access_token(token), now, job_id, user_id),
        )
        await db.commit()
        updated = cursor.rowcount > 0
        await cursor.close()
        if not updated:
            raise HTTPException(status_code=404, detail="Job not found")
        return token
    finally:
        await db.close()


async def get_user_job_record(job_id: str, user_id: int) -> dict[str, Any] | None:
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT
                job_id, owner_user_id, original_filename, stored_ifc_name,
                file_hash, ifc_schema, status, created_at, updated_at, last_opened_at
            FROM model_jobs
            WHERE job_id = ? AND owner_user_id = ?
            LIMIT 1
            """,
            (job_id, user_id),
        )
        row = await cursor.fetchone()
        await cursor.close()
        return dict(row) if row else None
    finally:
        await db.close()


async def list_user_job_records(user_id: int) -> list[dict[str, Any]]:
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            SELECT
                job_id, owner_user_id, original_filename, stored_ifc_name,
                file_hash, ifc_schema, status, created_at, updated_at, last_opened_at
            FROM model_jobs
            WHERE owner_user_id = ?
            ORDER BY COALESCE(last_opened_at, updated_at, created_at) DESC, created_at DESC
            """,
            (user_id,),
        )
        rows = await cursor.fetchall()
        await cursor.close()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def delete_job_record(job_id: str, user_id: int) -> bool:
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            DELETE FROM model_jobs
            WHERE job_id = ? AND owner_user_id = ?
            """,
            (job_id, user_id),
        )
        await db.commit()
        deleted = cursor.rowcount > 0
        await cursor.close()
        return deleted
    finally:
        await db.close()
