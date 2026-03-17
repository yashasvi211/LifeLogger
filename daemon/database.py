"""
LifeLogger — SQLite database initialization and helpers.
Database lives at ~/.local/share/lifelogger/lifelogger.db
"""

import os
import sqlite3
from pathlib import Path

DB_DIR = Path.home() / ".local" / "share" / "lifelogger"
DB_PATH = DB_DIR / "lifelogger.db"

_CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS tab_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT    NOT NULL,
    domain          TEXT    NOT NULL,
    title           TEXT    NOT NULL DEFAULT '',
    url             TEXT    NOT NULL DEFAULT '',
    active_seconds  REAL    NOT NULL DEFAULT 0,
    idle_seconds    REAL    NOT NULL DEFAULT 0,
    yt_progress     REAL,
    category        TEXT    NOT NULL DEFAULT 'other'
);

CREATE TABLE IF NOT EXISTS window_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT    NOT NULL,
    app_name        TEXT    NOT NULL DEFAULT '',
    window_title    TEXT    NOT NULL DEFAULT '',
    active_seconds  REAL    NOT NULL DEFAULT 0,
    idle_seconds    REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checkins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT    NOT NULL,
    note            TEXT    NOT NULL DEFAULT ''
);
"""


def _ensure_dir() -> None:
    DB_DIR.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    """Return a new SQLite connection (one per request)."""
    _ensure_dir()
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_db() -> None:
    """Create tables if they don't exist yet."""
    conn = get_connection()
    try:
        conn.executescript(_CREATE_TABLES)
        conn.commit()
    finally:
        conn.close()
