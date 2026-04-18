"""
LifeLogger — FastAPI server (port 7777).
Pure log-writer: receives JSON, inserts into SQLite, returns OK.
"""

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import get_connection, init_db


# ── Pydantic models ──────────────────────────────────────────────────────

class TabLogPayload(BaseModel):
    timestamp: str
    domain: str
    title: str = ""
    url: str = ""
    active_seconds: float = 0
    idle_seconds: float = 0
    yt_progress: Optional[float] = None
    category: str = "other"


class WindowLogPayload(BaseModel):
    timestamp: str
    app_name: str = ""
    window_title: str = ""
    active_seconds: float = 0
    idle_seconds: float = 0


class CheckinPayload(BaseModel):
    timestamp: str
    note: str = ""


# ── App lifecycle ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="LifeLogger", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Endpoints ─────────────────────────────────────────────────────────────

@app.get("/days")
def list_days(limit: int = 30):
    """
    Return distinct days (YYYY-MM-DD) present in any table, newest first.
    """
    conn = get_connection()
    try:
        # timestamp is stored as TEXT (ISO-like). SQLite date() extracts YYYY-MM-DD.
        rows = conn.execute(
            """
            SELECT day FROM (
              SELECT date(timestamp) AS day FROM tab_log
              UNION
              SELECT date(timestamp) AS day FROM window_log
              UNION
              SELECT date(timestamp) AS day FROM checkins
            )
            WHERE day IS NOT NULL
            ORDER BY day DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        days = [r[0] for r in rows if r and r[0]]
        return {"days": days}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


@app.get("/day/{day}")
def get_day(day: str, min_active_seconds: float = 0):
    """
    Return logs for a specific day (YYYY-MM-DD), grouped by table.
    Note: min_active_seconds is applied as a per-row filter.
    """
    conn = get_connection()
    try:
        tab_rows = conn.execute(
            """
            SELECT id, timestamp, domain, title, url, active_seconds, idle_seconds, yt_progress, category
            FROM tab_log
            WHERE date(timestamp) = date(?)
              AND active_seconds >= ?
            ORDER BY timestamp DESC
            """,
            (day, min_active_seconds),
        ).fetchall()

        window_rows = conn.execute(
            """
            SELECT id, timestamp, app_name, window_title, active_seconds, idle_seconds
            FROM window_log
            WHERE date(timestamp) = date(?)
              AND active_seconds >= ?
            ORDER BY timestamp DESC
            """,
            (day, min_active_seconds),
        ).fetchall()

        checkin_rows = conn.execute(
            """
            SELECT id, timestamp, note
            FROM checkins
            WHERE date(timestamp) = date(?)
            ORDER BY timestamp DESC
            """,
            (day,),
        ).fetchall()

        return {
            "day": day,
            "min_active_seconds": min_active_seconds,
            "tab_log": [
                {
                    "id": r[0],
                    "timestamp": r[1],
                    "domain": r[2],
                    "title": r[3],
                    "url": r[4],
                    "active_seconds": r[5],
                    "idle_seconds": r[6],
                    "yt_progress": r[7],
                    "category": r[8],
                }
                for r in tab_rows
            ],
            "window_log": [
                {
                    "id": r[0],
                    "timestamp": r[1],
                    "app_name": r[2],
                    "window_title": r[3],
                    "active_seconds": r[4],
                    "idle_seconds": r[5],
                }
                for r in window_rows
            ],
            "checkins": [
                {"id": r[0], "timestamp": r[1], "note": r[2]} for r in checkin_rows
            ],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


@app.get("/day/{day}/summary")
def get_day_summary(day: str, min_active_seconds: float = 0, limit: int = 20):
    """
    Aggregate active_seconds by application (window_log.app_name) and domain (tab_log.domain).
    min_active_seconds is applied on the aggregated SUM(active_seconds) per group.
    """
    conn = get_connection()
    try:
        app_rows = conn.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(app_name), ''), 'Unknown app') AS key,
                   SUM(active_seconds) AS seconds
            FROM window_log
            WHERE date(timestamp) = date(?)
            GROUP BY key
            HAVING SUM(active_seconds) >= ?
            ORDER BY seconds DESC
            LIMIT ?
            """,
            (day, min_active_seconds, limit),
        ).fetchall()

        domain_rows = conn.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(domain), ''), 'unknown') AS key,
                   SUM(active_seconds) AS seconds
            FROM tab_log
            WHERE date(timestamp) = date(?)
            GROUP BY key
            HAVING SUM(active_seconds) >= ?
            ORDER BY seconds DESC
            LIMIT ?
            """,
            (day, min_active_seconds, limit),
        ).fetchall()

        return {
            "day": day,
            "min_active_seconds": min_active_seconds,
            "apps": [{"app_name": r[0], "active_seconds": float(r[1] or 0)} for r in app_rows],
            "domains": [
                {"domain": r[0], "active_seconds": float(r[1] or 0)} for r in domain_rows
            ],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


@app.post("/log/tab")
def log_tab(payload: TabLogPayload):
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO tab_log
               (timestamp, domain, title, url, active_seconds, idle_seconds, yt_progress, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                payload.timestamp,
                payload.domain,
                payload.title,
                payload.url,
                payload.active_seconds,
                payload.idle_seconds,
                payload.yt_progress,
                payload.category,
            ),
        )
        conn.commit()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()
    return {"status": "ok"}


@app.post("/log/window")
def log_window(payload: WindowLogPayload):
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO window_log
               (timestamp, app_name, window_title, active_seconds, idle_seconds)
               VALUES (?, ?, ?, ?, ?)""",
            (
                payload.timestamp,
                payload.app_name,
                payload.window_title,
                payload.active_seconds,
                payload.idle_seconds,
            ),
        )
        conn.commit()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()
    return {"status": "ok"}


@app.post("/log/checkin")
def log_checkin(payload: CheckinPayload):
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO checkins (timestamp, note) VALUES (?, ?)""",
            (payload.timestamp, payload.note),
        )
        conn.commit()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=7777, reload=True)
