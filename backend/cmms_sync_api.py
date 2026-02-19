"""
CMMS sync settings and work-order sync endpoints.
"""

from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from auth_deps import get_current_user
from cmms_sync import create_adapter, decrypt_credentials, encrypt_credentials
from cmms_sync_models import CMMSSettingsResponse, CMMSSettingsUpdate, CMMSWebhookPayload, SyncSystem
from config import CMMS_WEBHOOK_SHARED_SECRET, CSRF_COOKIE_NAME
from db import get_db, utc_now_iso
from job_security import ensure_job_access
from work_order_models import WOResponse

router = APIRouter(tags=["cmms-sync"])

SELECT_COLUMNS = """
    id, job_id, work_order_no, global_id, element_name, element_type, storey,
    category, title, description, priority, status,
    assigned_to, due_date, completed_at, estimated_hours, actual_hours, cost,
    external_system, external_work_order_id, external_sync_status, external_synced_at,
    created_at, updated_at
"""


def _to_work_order_response(row: Any) -> WOResponse:
    return WOResponse(**dict(row))


def _to_settings_response(
    *,
    enabled: bool,
    system: str,
    base_url: str,
    credentials: dict[str, str],
    updated_at: str | None,
) -> CMMSSettingsResponse:
    return CMMSSettingsResponse(
        enabled=enabled,
        system=system,  # type: ignore[arg-type]
        base_url=base_url,
        has_api_key=bool(credentials.get("api_key")),
        has_webhook_secret=bool(credentials.get("webhook_secret")),
        updated_at=updated_at,
    )


def _client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _enforce_csrf(request: Request) -> None:
    csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
    csrf_header = request.headers.get("X-CSRF-Token")
    if not csrf_cookie or not csrf_header:
        raise HTTPException(status_code=403, detail="Invalid CSRF token")
    if not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=403, detail="Invalid CSRF token")


async def _log_audit(
    db,
    request: Request,
    event_type: str,
    user_id: int | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    await db.execute(
        """
        INSERT INTO audit_logs (user_id, event_type, ip_address, details, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            event_type,
            _client_ip(request),
            json.dumps(details or {}, separators=(",", ":")),
            utc_now_iso(),
        ),
    )


async def _get_settings_row(db, user_id: int):
    cursor = await db.execute(
        """
        SELECT user_id, enabled, system, base_url, credentials_encrypted, created_at, updated_at
        FROM cmms_sync_settings
        WHERE user_id = ?
        LIMIT 1
        """,
        (user_id,),
    )
    row = await cursor.fetchone()
    await cursor.close()
    return row


async def _upsert_settings(
    db,
    *,
    user_id: int,
    enabled: bool,
    system: SyncSystem,
    base_url: str,
    encrypted_credentials: str,
) -> None:
    now = utc_now_iso()
    await db.execute(
        """
        INSERT INTO cmms_sync_settings (
            user_id, enabled, system, base_url, credentials_encrypted, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            enabled = excluded.enabled,
            system = excluded.system,
            base_url = excluded.base_url,
            credentials_encrypted = excluded.credentials_encrypted,
            updated_at = excluded.updated_at
        """,
        (
            user_id,
            1 if enabled else 0,
            system,
            base_url.strip(),
            encrypted_credentials,
            now,
            now,
        ),
    )


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


def _filter_work_order_updates(payload: dict[str, Any], now_iso: str) -> dict[str, Any]:
    updates: dict[str, Any] = {}

    for key in ("status", "priority", "category", "title", "description", "assigned_to", "due_date"):
        if key in payload and payload[key] is not None:
            updates[key] = payload[key]

    if updates.get("status") == "closed":
        updates["completed_at"] = now_iso
    elif "status" in updates and updates["status"] != "closed":
        updates["completed_at"] = None

    if "external_sync_status" in payload and payload["external_sync_status"] is not None:
        updates["external_sync_status"] = payload["external_sync_status"]

    return updates


async def _apply_work_order_updates(
    db,
    *,
    job_id: str,
    wo_id: int,
    updates: dict[str, Any],
) -> None:
    if not updates:
        return
    set_clause = ", ".join(f"{key} = ?" for key in updates.keys())
    params = [*updates.values(), job_id, wo_id]
    cursor = await db.execute(
        f"""
        UPDATE work_orders
        SET {set_clause}
        WHERE job_id = ? AND id = ? AND deleted_at IS NULL
        """,
        params,
    )
    updated_rows = cursor.rowcount
    await cursor.close()
    if updated_rows == 0:
        raise HTTPException(status_code=404, detail="Work order not found")


@router.get("/api/cmms/settings", response_model=CMMSSettingsResponse)
async def get_cmms_settings(current_user: dict[str, Any] = Depends(get_current_user)):
    user_id = int(current_user["id"])
    db = await get_db()
    try:
        row = await _get_settings_row(db, user_id)
        if not row:
            return _to_settings_response(
                enabled=False,
                system="mock",
                base_url="",
                credentials={},
                updated_at=None,
            )

        credentials = decrypt_credentials(row["credentials_encrypted"])
        return _to_settings_response(
            enabled=bool(row["enabled"]),
            system=str(row["system"]),
            base_url=str(row["base_url"] or ""),
            credentials=credentials,
            updated_at=str(row["updated_at"] or ""),
        )
    finally:
        await db.close()


@router.put("/api/cmms/settings", response_model=CMMSSettingsResponse)
async def update_cmms_settings(
    payload: CMMSSettingsUpdate,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    _enforce_csrf(request)
    user_id = int(current_user["id"])

    db = await get_db()
    try:
        existing_row = await _get_settings_row(db, user_id)
        credentials = decrypt_credentials(existing_row["credentials_encrypted"]) if existing_row else {}

        if payload.api_key is not None:
            api_key = payload.api_key.strip()
            if api_key:
                credentials["api_key"] = api_key
            else:
                credentials.pop("api_key", None)

        if payload.webhook_secret is not None:
            webhook_secret = payload.webhook_secret.strip()
            if webhook_secret:
                credentials["webhook_secret"] = webhook_secret
            else:
                credentials.pop("webhook_secret", None)

        encrypted_credentials = encrypt_credentials(credentials)
        await _upsert_settings(
            db,
            user_id=user_id,
            enabled=payload.enabled,
            system=payload.system,
            base_url=payload.base_url,
            encrypted_credentials=encrypted_credentials,
        )
        await _log_audit(
            db,
            request,
            "cmms_settings_updated",
            user_id=user_id,
            details={
                "enabled": payload.enabled,
                "system": payload.system,
                "has_api_key": bool(credentials.get("api_key")),
                "has_webhook_secret": bool(credentials.get("webhook_secret")),
            },
        )
        await db.commit()

        saved_row = await _get_settings_row(db, user_id)
        if not saved_row:
            raise HTTPException(status_code=500, detail="Failed to save CMMS settings")
        saved_credentials = decrypt_credentials(saved_row["credentials_encrypted"])
        return _to_settings_response(
            enabled=bool(saved_row["enabled"]),
            system=str(saved_row["system"]),
            base_url=str(saved_row["base_url"] or ""),
            credentials=saved_credentials,
            updated_at=str(saved_row["updated_at"] or ""),
        )
    finally:
        await db.close()


@router.post("/api/work-orders/{job_id}/{wo_id}/sync/push", response_model=WOResponse)
async def push_work_order_to_cmms(
    job_id: str,
    wo_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    _enforce_csrf(request)
    user_id = int(current_user["id"])
    await ensure_job_access(job_id, user_id)

    db = await get_db()
    try:
        work_order_row = await _get_work_order_row(db, job_id, wo_id)
        if not work_order_row:
            raise HTTPException(status_code=404, detail="Work order not found")

        settings_row = await _get_settings_row(db, user_id)
        if not settings_row or not bool(settings_row["enabled"]):
            raise HTTPException(status_code=400, detail="CMMS sync is not enabled")

        settings_system = str(settings_row["system"])
        credentials = decrypt_credentials(settings_row["credentials_encrypted"])
        adapter = create_adapter(
            settings_system,
            str(settings_row["base_url"] or ""),
            credentials,
        )
        try:
            push_result = adapter.push_work_order(dict(work_order_row))
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"CMMS push failed: {exc}") from exc

        now = utc_now_iso()
        updates = _filter_work_order_updates(push_result, now)
        external_id = str(
            push_result.get("external_work_order_id")
            or work_order_row["external_work_order_id"]
            or f"SYNC-{job_id}-{wo_id}"
        )
        updates["external_system"] = settings_system
        updates["external_work_order_id"] = external_id
        updates["external_sync_status"] = str(push_result.get("external_sync_status") or "synced")
        updates["external_synced_at"] = now
        updates["updated_at"] = now

        await _apply_work_order_updates(db, job_id=job_id, wo_id=wo_id, updates=updates)
        await _log_audit(
            db,
            request,
            "work_order_sync_push",
            user_id=user_id,
            details={
                "job_id": job_id,
                "work_order_id": wo_id,
                "system": settings_system,
                "external_work_order_id": external_id,
            },
        )
        await db.commit()

        updated_row = await _get_work_order_row(db, job_id, wo_id)
        if not updated_row:
            raise HTTPException(status_code=404, detail="Work order not found")
        return _to_work_order_response(updated_row)
    finally:
        await db.close()


@router.post("/api/work-orders/{job_id}/{wo_id}/sync/pull", response_model=WOResponse)
async def pull_work_order_from_cmms(
    job_id: str,
    wo_id: int,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    _enforce_csrf(request)
    user_id = int(current_user["id"])
    await ensure_job_access(job_id, user_id)

    db = await get_db()
    try:
        work_order_row = await _get_work_order_row(db, job_id, wo_id)
        if not work_order_row:
            raise HTTPException(status_code=404, detail="Work order not found")

        settings_row = await _get_settings_row(db, user_id)
        if not settings_row or not bool(settings_row["enabled"]):
            raise HTTPException(status_code=400, detail="CMMS sync is not enabled")

        external_id = str(work_order_row["external_work_order_id"] or "").strip()
        if not external_id:
            raise HTTPException(status_code=400, detail="Work order has no external ID")

        settings_system = str(settings_row["system"])
        credentials = decrypt_credentials(settings_row["credentials_encrypted"])
        adapter = create_adapter(
            settings_system,
            str(settings_row["base_url"] or ""),
            credentials,
        )
        try:
            pull_result = adapter.pull_work_order(external_id, dict(work_order_row))
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"CMMS pull failed: {exc}") from exc

        now = utc_now_iso()
        updates = _filter_work_order_updates(pull_result, now)
        updates["external_system"] = settings_system
        updates["external_work_order_id"] = str(pull_result.get("external_work_order_id") or external_id)
        updates["external_sync_status"] = str(pull_result.get("external_sync_status") or "synced")
        updates["external_synced_at"] = now
        updates["updated_at"] = now

        await _apply_work_order_updates(db, job_id=job_id, wo_id=wo_id, updates=updates)
        await _log_audit(
            db,
            request,
            "work_order_sync_pull",
            user_id=user_id,
            details={
                "job_id": job_id,
                "work_order_id": wo_id,
                "system": settings_system,
                "external_work_order_id": updates["external_work_order_id"],
            },
        )
        await db.commit()

        updated_row = await _get_work_order_row(db, job_id, wo_id)
        if not updated_row:
            raise HTTPException(status_code=404, detail="Work order not found")
        return _to_work_order_response(updated_row)
    finally:
        await db.close()


@router.post("/api/cmms/webhooks/{system}")
async def cmms_webhook(
    system: SyncSystem,
    payload: CMMSWebhookPayload,
    request: Request,
):
    incoming_secret = request.headers.get("X-CMMS-Webhook-Secret", "")
    if not incoming_secret or not secrets.compare_digest(incoming_secret, CMMS_WEBHOOK_SHARED_SECRET):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook secret")

    db = await get_db()
    try:
        where_clause = "external_system = ? AND external_work_order_id = ? AND deleted_at IS NULL"
        params: list[Any] = [system, payload.external_work_order_id]
        if payload.job_id:
            where_clause += " AND job_id = ?"
            params.append(payload.job_id)

        cursor = await db.execute(
            f"""
            SELECT id, job_id
            FROM work_orders
            WHERE {where_clause}
            ORDER BY id DESC
            LIMIT 2
            """,
            params,
        )
        rows = await cursor.fetchall()
        await cursor.close()

        if not rows:
            raise HTTPException(status_code=404, detail="Work order not found")
        if len(rows) > 1:
            raise HTTPException(status_code=409, detail="Multiple work orders matched; send job_id")

        work_order_id = int(rows[0]["id"])
        job_id = str(rows[0]["job_id"])

        now = utc_now_iso()
        webhook_updates = _filter_work_order_updates(payload.model_dump(), now)
        webhook_updates["external_system"] = system
        webhook_updates["external_work_order_id"] = payload.external_work_order_id
        webhook_updates["external_sync_status"] = payload.external_sync_status or "synced"
        webhook_updates["external_synced_at"] = now
        webhook_updates["updated_at"] = now

        await _apply_work_order_updates(
            db,
            job_id=job_id,
            wo_id=work_order_id,
            updates=webhook_updates,
        )
        await _log_audit(
            db,
            request,
            "work_order_sync_webhook",
            details={
                "job_id": job_id,
                "work_order_id": work_order_id,
                "system": system,
                "external_work_order_id": payload.external_work_order_id,
            },
        )
        await db.commit()
        return {"status": "accepted", "job_id": job_id, "work_order_id": work_order_id}
    finally:
        await db.close()
