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

CREATE TABLE IF NOT EXISTS work_orders (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                 TEXT    NOT NULL,
    work_order_no          TEXT    NOT NULL,
    global_id              TEXT    NOT NULL,
    element_name           TEXT    DEFAULT '',
    element_type           TEXT    DEFAULT '',
    storey                 TEXT    DEFAULT '',
    category               TEXT    NOT NULL DEFAULT 'note',
    title                  TEXT    NOT NULL,
    description            TEXT    DEFAULT '',
    priority               TEXT    NOT NULL DEFAULT 'medium',
    status                 TEXT    NOT NULL DEFAULT 'open',
    assigned_to            TEXT,
    due_date               TEXT,
    completed_at           TEXT,
    estimated_hours        REAL,
    actual_hours           REAL,
    cost                   REAL,
    external_system        TEXT,
    external_work_order_id TEXT,
    external_sync_status   TEXT,
    external_synced_at     TEXT,
    created_at             TEXT    NOT NULL,
    updated_at             TEXT    NOT NULL,
    deleted_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_wo_job_status
ON work_orders(job_id, status);

CREATE INDEX IF NOT EXISTS idx_wo_element
ON work_orders(job_id, global_id);

CREATE INDEX IF NOT EXISTS idx_wo_external
ON work_orders(external_system, external_work_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wo_job_number_unique
ON work_orders(job_id, work_order_no);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wo_job_external_unique
ON work_orders(job_id, external_system, external_work_order_id)
WHERE external_system IS NOT NULL AND external_work_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cmms_sync_settings (
    user_id                INTEGER PRIMARY KEY,
    enabled                INTEGER NOT NULL DEFAULT 0,
    system                 TEXT    NOT NULL DEFAULT 'mock',
    base_url               TEXT    DEFAULT '',
    credentials_encrypted  TEXT    DEFAULT '',
    created_at             TEXT    NOT NULL,
    updated_at             TEXT    NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_jobs (
    job_id            TEXT    PRIMARY KEY,
    owner_user_id     INTEGER NOT NULL,
    original_filename TEXT    NOT NULL,
    stored_ifc_name   TEXT    NOT NULL,
    file_token_hash   TEXT    NOT NULL,
    file_hash         TEXT    DEFAULT '',
    ifc_schema        TEXT,
    status            TEXT    NOT NULL DEFAULT 'pending',
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    last_opened_at    TEXT,
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


async def _table_exists(db: aiosqlite.Connection, table_name: str) -> bool:
    cursor = await db.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        LIMIT 1
        """,
        (table_name,),
    )
    row = await cursor.fetchone()
    await cursor.close()
    return row is not None


async def _column_exists(db: aiosqlite.Connection, table_name: str, column_name: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table_name})")
    rows = await cursor.fetchall()
    await cursor.close()
    return any(str(row["name"]) == column_name for row in rows)


async def _ensure_column_exists(
    db: aiosqlite.Connection,
    table_name: str,
    column_name: str,
    definition_sql: str,
) -> None:
    if await _column_exists(db, table_name, column_name):
        return
    await db.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition_sql}")


async def _ensure_model_jobs_columns(db: aiosqlite.Connection) -> None:
    has_model_jobs = await _table_exists(db, "model_jobs")
    if not has_model_jobs:
        return

    await _ensure_column_exists(db, "model_jobs", "file_hash", "TEXT DEFAULT ''")
    await _ensure_column_exists(db, "model_jobs", "ifc_schema", "TEXT")
    await _ensure_column_exists(db, "model_jobs", "status", "TEXT NOT NULL DEFAULT 'pending'")
    await _ensure_column_exists(db, "model_jobs", "updated_at", "TEXT")
    await _ensure_column_exists(db, "model_jobs", "last_opened_at", "TEXT")

    # Backfill updated_at for legacy rows.
    await db.execute(
        """
        UPDATE model_jobs
        SET updated_at = COALESCE(updated_at, created_at)
        """
    )

    # Ensure index exists for owner+hash dedupe lookups.
    await db.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_model_jobs_owner_hash
        ON model_jobs(owner_user_id, file_hash)
        """
    )


async def _migrate_maintenance_logs_to_work_orders(db: aiosqlite.Connection) -> None:
    has_logs = await _table_exists(db, "maintenance_logs")
    has_work_orders = await _table_exists(db, "work_orders")
    if not has_logs or not has_work_orders:
        return

    existing_cursor = await db.execute("SELECT COUNT(*) AS count FROM work_orders")
    existing_row = await existing_cursor.fetchone()
    await existing_cursor.close()
    if existing_row and int(existing_row["count"]) > 0:
        return

    logs_cursor = await db.execute(
        """
        SELECT
            id, job_id, global_id, element_name, element_type,
            category, title, description, priority, status,
            created_at, updated_at
        FROM maintenance_logs
        ORDER BY job_id ASC, id ASC
        """
    )
    rows = await logs_cursor.fetchall()
    await logs_cursor.close()
    if not rows:
        return

    sequence_per_job: dict[str, int] = {}
    for row in rows:
        job_id = str(row["job_id"])
        next_seq = sequence_per_job.get(job_id, 0) + 1
        sequence_per_job[job_id] = next_seq

        status = str(row["status"])
        completed_at = str(row["updated_at"]) if status == "closed" else None

        await db.execute(
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
                f"WO-{next_seq:04d}",
                row["global_id"],
                row["element_name"],
                row["element_type"],
                "",
                row["category"],
                row["title"],
                row["description"],
                row["priority"],
                row["status"],
                None,
                None,
                completed_at,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                row["created_at"],
                row["updated_at"],
            ),
        )


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
        await _ensure_model_jobs_columns(db)
        await _migrate_maintenance_logs_to_work_orders(db)
        await db.commit()
    finally:
        await db.close()


def utc_now_iso() -> str:
    """
    Return current UTC timestamp as ISO 8601.
    """
    return datetime.now(timezone.utc).isoformat()
