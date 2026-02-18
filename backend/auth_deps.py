"""
Dependencies for authenticated endpoints.
"""

from typing import Any

from fastapi import HTTPException, Request, status
from jose import JWTError, jwt

from config import ACCESS_COOKIE_NAME, JWT_ALGORITHM, SECRET_KEY
from db import get_db


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        ) from exc

    if payload.get("type") != "access" or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return payload


async def _fetch_user_by_id(user_id: int) -> dict[str, Any] | None:
    db = await get_db()
    try:
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
        if not row:
            return None
        user = dict(row)
        user["is_email_verified"] = bool(user.get("is_email_verified"))
        return user
    finally:
        await db.close()


async def get_current_user(request: Request) -> dict[str, Any]:
    access_token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_access_token(access_token)
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated") from exc

    user = await _fetch_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


async def get_current_user_optional(request: Request) -> dict[str, Any] | None:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
