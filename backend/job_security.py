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
) -> None:
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO model_jobs (
                job_id, owner_user_id, original_filename, stored_ifc_name, file_token_hash, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                job_id,
                owner_user_id,
                original_filename,
                stored_ifc_name,
                hash_file_access_token(file_access_token),
                utc_now_iso(),
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
