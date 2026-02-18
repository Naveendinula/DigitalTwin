# Authentication Guide

This project now includes cookie-based JWT auth for local development.

## Overview

- Access token: short-lived JWT (default 15 minutes), stored in HttpOnly cookie.
- Refresh token: long-lived JWT (default 7 days), stored in HttpOnly cookie.
- Refresh rotation: each `/auth/refresh` call revokes old refresh token and issues a new one.
- Logout: revokes all refresh tokens for the user.
- CSRF: double-submit cookie (`csrf_token`) + `X-CSRF-Token` header on state-changing requests.
- Password hashing: Argon2id via `argon2-cffi`.
- Audit logging: auth events are persisted to `audit_logs` in the same SQLite DB.
- Job authorization: model jobs are bound to an owner user and job-scoped APIs enforce ownership checks.
- File authorization: `/files/{job_id}/{filename}` is protected by either owner session cookie or per-job file token.

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout` (requires CSRF header)
- `GET /auth/me`
- `POST /auth/refresh` (requires CSRF header)
- `POST /auth/password-reset-request` (stub: logs token server-side, no email service)

## Local Cookie Security

For local HTTP development (`http://localhost:*`), set:

- `COOKIE_SECURE=false` (default in this repo)

For HTTPS environments, set:

- `COOKIE_SECURE=true`

## Environment Variables

- `SECRET_KEY`: JWT signing key
- `JWT_ALGORITHM`: defaults to `HS256`
- `ACCESS_TOKEN_EXPIRE_MINUTES`: defaults to `15`
- `REFRESH_TOKEN_EXPIRE_DAYS`: defaults to `7`
- `DB_PATH`: optional SQLite file override (defaults to `backend/maintenance.db`)
- `FRONTEND_ORIGINS`: comma-separated CORS origins
- `COOKIE_SECURE`: `true`/`false`
- `COOKIE_SAMESITE`: defaults to `lax`
