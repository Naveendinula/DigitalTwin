"""
Authentication router: register, login, logout, me, refresh, and reset stub.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from argon2.low_level import Type
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from jose import JWTError, jwt

from auth_deps import get_current_user, get_current_user_optional
from auth_models import (
    AuthSessionResponse,
    LoginRequest,
    MessageResponse,
    PasswordResetRequest,
    RegisterRequest,
    UserResponse,
)
from config import (
    ACCESS_COOKIE_NAME,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    CSRF_COOKIE_NAME,
    JWT_ALGORITHM,
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
)
from db import get_db, utc_now_iso

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_LOGIN_ERROR = "Invalid email or password"
GENERIC_RESET_MESSAGE = "If the account exists, reset instructions were sent."
GENERIC_TOO_MANY_ATTEMPTS = "Too many requests. Try again later."

password_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=19456,
    parallelism=1,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)
DUMMY_PASSWORD_HASH = password_hasher.hash("dummy-password-for-timing-safety")


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        now_ts = datetime.now(timezone.utc).timestamp()
        cutoff_ts = now_ts - window_seconds
        async with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] < cutoff_ts:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now_ts)
            return True


rate_limiter = SlidingWindowRateLimiter()


def _client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _validate_password(password: str) -> None:
    if len(password) < 8 or len(password) > 128:
        raise HTTPException(status_code=400, detail="Password must be 8-128 characters.")
    if any(not char.isprintable() for char in password):
        raise HTTPException(status_code=400, detail="Password contains invalid characters.")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated") from exc


def _create_access_token(user_id: int, email: str) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _create_refresh_token(user_id: int, email: str, jti: str) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def _verify_refresh_token(refresh_token: str) -> dict[str, Any]:
    payload = _decode_token(refresh_token)
    if payload.get("type") != "refresh" or "sub" not in payload or "jti" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return payload


def _set_cookie(response: JSONResponse, key: str, value: str, max_age: int, http_only: bool) -> None:
    response.set_cookie(
        key=key,
        value=value,
        max_age=max_age,
        expires=max_age,
        httponly=http_only,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def _set_session_cookies(
    response: JSONResponse,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    _set_cookie(
        response,
        ACCESS_COOKIE_NAME,
        access_token,
        ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        http_only=True,
    )
    _set_cookie(
        response,
        REFRESH_COOKIE_NAME,
        refresh_token,
        REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        http_only=True,
    )
    _set_cookie(
        response,
        CSRF_COOKIE_NAME,
        csrf_token,
        REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        http_only=False,
    )


def _clear_session_cookies(response: JSONResponse) -> None:
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")


def _enforce_csrf(request: Request) -> None:
    csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
    csrf_header = request.headers.get("X-CSRF-Token")
    if not csrf_cookie or not csrf_header:
        raise HTTPException(status_code=403, detail="Invalid CSRF token")
    if not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=403, detail="Invalid CSRF token")


def _to_user_response(user_row: dict[str, Any]) -> UserResponse:
    return UserResponse(
        id=int(user_row["id"]),
        email=str(user_row["email"]),
        display_name=str(user_row.get("display_name") or ""),
        is_email_verified=bool(user_row.get("is_email_verified")),
        created_at=str(user_row["created_at"]),
        last_login_at=user_row.get("last_login_at"),
    )


def _build_auth_response(user_row: dict[str, Any], status_code: int = 200) -> JSONResponse:
    body = AuthSessionResponse(user=_to_user_response(user_row)).model_dump()
    return JSONResponse(status_code=status_code, content=body)


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


async def _rate_limit_or_429(
    request: Request,
    scope: str,
    limit: int,
    window_seconds: int,
) -> None:
    key = f"{scope}:{_client_ip(request)}"
    allowed = await rate_limiter.allow(key, limit=limit, window_seconds=window_seconds)
    if not allowed:
        raise HTTPException(status_code=429, detail=GENERIC_TOO_MANY_ATTEMPTS)


async def _get_user_by_email(db, email: str) -> dict[str, Any] | None:
    cursor = await db.execute(
        """
        SELECT id, email, password_hash, display_name, is_email_verified, created_at, last_login_at
        FROM users
        WHERE email = ? COLLATE NOCASE
        """,
        (email,),
    )
    row = await cursor.fetchone()
    await cursor.close()
    return dict(row) if row else None


async def _get_user_by_id(db, user_id: int) -> dict[str, Any] | None:
    cursor = await db.execute(
        """
        SELECT id, email, display_name, is_email_verified, created_at, last_login_at
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    )
    row = await cursor.fetchone()
    await cursor.close()
    return dict(row) if row else None


async def _create_refresh_record(
    db,
    user_id: int,
    token_hash: str,
    expires_at: str,
    created_at: str,
) -> int:
    cursor = await db.execute(
        """
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked_at, replaced_by_id, created_at)
        VALUES (?, ?, ?, NULL, NULL, ?)
        """,
        (user_id, token_hash, expires_at, created_at),
    )
    record_id = int(cursor.lastrowid)
    await cursor.close()
    return record_id


async def _create_session_tokens(db, user_row: dict[str, Any]) -> tuple[str, str, str, int]:
    user_id = int(user_row["id"])
    email = str(user_row["email"])

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    refresh_expiry = (now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()

    access_token = _create_access_token(user_id, email)
    refresh_token = _create_refresh_token(user_id, email, str(uuid.uuid4()))
    refresh_token_hash = _hash_token(refresh_token)
    refresh_record_id = await _create_refresh_record(
        db=db,
        user_id=user_id,
        token_hash=refresh_token_hash,
        expires_at=refresh_expiry,
        created_at=now_iso,
    )
    csrf_token = secrets.token_urlsafe(32)
    return access_token, refresh_token, csrf_token, refresh_record_id


async def _revoke_all_refresh_tokens(db, user_id: int, revoked_at: str) -> None:
    await db.execute(
        """
        UPDATE refresh_tokens
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE user_id = ?
        """,
        (revoked_at, user_id),
    )


async def _get_refresh_record_by_hash(db, token_hash: str) -> dict[str, Any] | None:
    cursor = await db.execute(
        """
        SELECT id, user_id, token_hash, expires_at, revoked_at, replaced_by_id, created_at
        FROM refresh_tokens
        WHERE token_hash = ?
        """,
        (token_hash,),
    )
    row = await cursor.fetchone()
    await cursor.close()
    return dict(row) if row else None


def _is_expired(expires_at: str) -> bool:
    try:
        expiry_dt = datetime.fromisoformat(expires_at)
    except ValueError:
        return True
    return expiry_dt <= datetime.now(timezone.utc)


@router.post("/register", response_model=AuthSessionResponse, status_code=201)
async def register(payload: RegisterRequest, request: Request):
    email = _normalize_email(payload.email)
    display_name = payload.display_name.strip()
    _validate_password(payload.password)

    db = await get_db()
    try:
        existing_user = await _get_user_by_email(db, email)
        if existing_user:
            await _log_audit(
                db,
                request,
                "register_failed",
                details={"reason": "duplicate_email"},
            )
            await db.commit()
            raise HTTPException(status_code=400, detail="Registration failed")

        password_hash = password_hasher.hash(payload.password)
        created_at = utc_now_iso()

        cursor = await db.execute(
            """
            INSERT INTO users (email, password_hash, display_name, is_email_verified, created_at, last_login_at)
            VALUES (?, ?, ?, 0, ?, NULL)
            """,
            (email, password_hash, display_name, created_at),
        )
        user_id = int(cursor.lastrowid)
        await cursor.close()

        user_row = await _get_user_by_id(db, user_id)
        if not user_row:
            raise HTTPException(status_code=500, detail="Failed to create account")

        access_token, refresh_token, csrf_token, _ = await _create_session_tokens(db, user_row)
        await _log_audit(db, request, "register_success", user_id=user_id)
        await db.commit()

        response = _build_auth_response(user_row, status_code=201)
        _set_session_cookies(response, access_token, refresh_token, csrf_token)
        return response
    finally:
        await db.close()


@router.post("/login", response_model=AuthSessionResponse)
async def login(payload: LoginRequest, request: Request):
    await _rate_limit_or_429(request, scope="login", limit=8, window_seconds=900)
    email = _normalize_email(payload.email)

    db = await get_db()
    try:
        user_row = await _get_user_by_email(db, email)

        is_password_valid = False
        if user_row:
            try:
                is_password_valid = password_hasher.verify(user_row["password_hash"], payload.password)
            except (VerifyMismatchError, InvalidHashError):
                is_password_valid = False
        else:
            try:
                password_hasher.verify(DUMMY_PASSWORD_HASH, payload.password)
            except (VerifyMismatchError, InvalidHashError):
                pass

        if not is_password_valid:
            await _log_audit(
                db,
                request,
                "login_failed",
                user_id=int(user_row["id"]) if user_row else None,
                details={"email": email},
            )
            await db.commit()
            raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)

        try:
            if password_hasher.check_needs_rehash(user_row["password_hash"]):
                new_hash = password_hasher.hash(payload.password)
                await db.execute(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    (new_hash, int(user_row["id"])),
                )
        except InvalidHashError:
            pass

        last_login_at = utc_now_iso()
        await db.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?",
            (last_login_at, int(user_row["id"])),
        )

        user_public_row = await _get_user_by_id(db, int(user_row["id"]))
        if not user_public_row:
            raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)

        access_token, refresh_token, csrf_token, _ = await _create_session_tokens(db, user_public_row)
        await _log_audit(db, request, "login_success", user_id=int(user_public_row["id"]))
        await db.commit()

        response = _build_auth_response(user_public_row)
        _set_session_cookies(response, access_token, refresh_token, csrf_token)
        return response
    finally:
        await db.close()


@router.get("/me", response_model=UserResponse)
async def me(current_user: dict[str, Any] = Depends(get_current_user)):
    return _to_user_response(current_user)


@router.post("/refresh", response_model=AuthSessionResponse)
async def refresh_session(request: Request):
    _enforce_csrf(request)
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = _verify_refresh_token(refresh_token)
    token_hash = _hash_token(refresh_token)
    expected_user_id = int(payload["sub"])

    db = await get_db()
    try:
        refresh_record = await _get_refresh_record_by_hash(db, token_hash)
        now_iso = utc_now_iso()

        if not refresh_record:
            await _log_audit(
                db,
                request,
                "refresh_failed",
                details={"reason": "token_not_found"},
            )
            await db.commit()
            raise HTTPException(status_code=401, detail="Not authenticated")

        record_user_id = int(refresh_record["user_id"])
        if refresh_record.get("revoked_at"):
            await _revoke_all_refresh_tokens(db, record_user_id, now_iso)
            await _log_audit(
                db,
                request,
                "refresh_reuse_detected",
                user_id=record_user_id,
                details={"token_id": int(refresh_record["id"])},
            )
            await db.commit()
            raise HTTPException(status_code=401, detail="Not authenticated")

        if _is_expired(str(refresh_record["expires_at"])) or record_user_id != expected_user_id:
            await db.execute(
                "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
                (now_iso, int(refresh_record["id"])),
            )
            await _log_audit(
                db,
                request,
                "refresh_failed",
                user_id=record_user_id,
                details={"reason": "expired_or_invalid_subject"},
            )
            await db.commit()
            raise HTTPException(status_code=401, detail="Not authenticated")

        user_row = await _get_user_by_id(db, record_user_id)
        if not user_row:
            await db.execute(
                "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
                (now_iso, int(refresh_record["id"])),
            )
            await _log_audit(
                db,
                request,
                "refresh_failed",
                user_id=record_user_id,
                details={"reason": "user_missing"},
            )
            await db.commit()
            raise HTTPException(status_code=401, detail="Not authenticated")

        access_token, new_refresh_token, csrf_token, new_refresh_record_id = await _create_session_tokens(db, user_row)
        await db.execute(
            """
            UPDATE refresh_tokens
            SET revoked_at = ?, replaced_by_id = ?
            WHERE id = ?
            """,
            (now_iso, new_refresh_record_id, int(refresh_record["id"])),
        )
        await _log_audit(
            db,
            request,
            "refresh_success",
            user_id=record_user_id,
            details={
                "old_token_id": int(refresh_record["id"]),
                "new_token_id": int(new_refresh_record_id),
            },
        )
        await db.commit()

        response = _build_auth_response(user_row)
        _set_session_cookies(response, access_token, new_refresh_token, csrf_token)
        return response
    finally:
        await db.close()


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    current_user: dict[str, Any] | None = Depends(get_current_user_optional),
):
    _enforce_csrf(request)

    user_id: int | None = int(current_user["id"]) if current_user else None
    if user_id is None:
        refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
        if refresh_token:
            try:
                payload = _verify_refresh_token(refresh_token)
                user_id = int(payload["sub"])
            except HTTPException:
                user_id = None

    db = await get_db()
    try:
        if user_id is not None:
            await _revoke_all_refresh_tokens(db, user_id=user_id, revoked_at=utc_now_iso())
            await _log_audit(db, request, "logout_success", user_id=user_id)
        else:
            await _log_audit(db, request, "logout_success", details={"user_id": "unknown"})
        await db.commit()
    finally:
        await db.close()

    response = JSONResponse(content=MessageResponse(message="Logged out").model_dump())
    _clear_session_cookies(response)
    return response


@router.post("/password-reset-request", response_model=MessageResponse)
async def request_password_reset(payload: PasswordResetRequest, request: Request):
    await _rate_limit_or_429(request, scope="password-reset", limit=5, window_seconds=3600)
    email = _normalize_email(payload.email)

    db = await get_db()
    try:
        user_row = await _get_user_by_email(db, email)
        if user_row:
            reset_stub_token = secrets.token_urlsafe(32)
            print(
                "[auth.reset.stub] user_id=%s email=%s token=%s"
                % (user_row["id"], email, reset_stub_token)
            )
            await _log_audit(
                db,
                request,
                "password_reset_requested",
                user_id=int(user_row["id"]),
                details={"stub_token": reset_stub_token},
            )
        else:
            await _log_audit(
                db,
                request,
                "password_reset_requested",
                details={"email": email},
            )
        await db.commit()
    finally:
        await db.close()

    return MessageResponse(message=GENERIC_RESET_MESSAGE)
