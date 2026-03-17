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
    allow_methods=["POST"],
    allow_headers=["*"],
)


# ── Endpoints ─────────────────────────────────────────────────────────────

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
