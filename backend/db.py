"""
SQLite database helpers for lightweight server-side features.
"""

from pathlib import Path
from datetime import datetime, timezone

import aiosqlite

from config import DB_PATH

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       TEXT    NOT NULL,
    global_id    TEXT    NOT NULL,
    element_name TEXT    DEFAULT '',
    element_type TEXT    DEFAULT '',
    category     TEXT    NOT NULL DEFAULT 'note',
    title        TEXT    NOT NULL,
    description  TEXT    DEFAULT '',
    priority     TEXT    NOT NULL DEFAULT 'medium',
    status       TEXT    NOT NULL DEFAULT 'open',
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_element
ON maintenance_logs(job_id, global_id);

CREATE INDEX IF NOT EXISTS idx_logs_job_status
ON maintenance_logs(job_id, status);

CREATE TABLE IF NOT EXISTS model_jobs (
    job_id            TEXT    PRIMARY KEY,
    owner_user_id     INTEGER NOT NULL,
    original_filename TEXT    NOT NULL,
    stored_ifc_name   TEXT    NOT NULL,
    file_token_hash   TEXT    NOT NULL,
    created_at        TEXT    NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_model_jobs_owner
ON model_jobs(owner_user_id);

CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    email             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash     TEXT    NOT NULL,
    display_name      TEXT    DEFAULT '',
    is_email_verified INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL,
    last_login_at     TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    token_hash     TEXT    NOT NULL UNIQUE,
    expires_at     TEXT    NOT NULL,
    revoked_at     TEXT,
    replaced_by_id INTEGER,
    created_at     TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (replaced_by_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
ON refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry
ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    event_type TEXT    NOT NULL,
    ip_address TEXT,
    details    TEXT    DEFAULT '',
    created_at TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user
ON audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event
ON audit_logs(event_type);
"""


async def get_db() -> aiosqlite.Connection:
    """
    Open a configured SQLite connection.
    """
    db = await aiosqlite.connect(Path(DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute("PRAGMA synchronous = NORMAL")
    await db.execute("PRAGMA cache_size = -8000")
    await db.execute("PRAGMA busy_timeout = 5000")
    return db


async def init_db() -> None:
    """
    Initialize database schema at application startup.
    """
    db = await get_db()
    try:
        await db.executescript(SCHEMA_SQL)
        await db.commit()
    finally:
        await db.close()


def utc_now_iso() -> str:
    """
    Return current UTC timestamp as ISO 8601.
    """
    return datetime.now(timezone.utc).isoformat()
