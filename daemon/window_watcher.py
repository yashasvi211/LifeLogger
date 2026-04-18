#!/usr/bin/env python3
"""
LifeLogger — OS window watcher.
Polls the active window every 2 s via xdotool, detects idle via xprintidle,
and POSTs accumulated time to the daemon on every window change.
"""

import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

import subprocess
import time
from datetime import datetime, timezone

import requests

DAEMON_URL = "http://localhost:7777/log/window"
POLL_INTERVAL = 2        # seconds
IDLE_THRESHOLD = 60_000  # milliseconds (60 s)


def _run(cmd: list[str]) -> str | None:
    """Run a command and return stripped stdout, or None on failure."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


def get_idle_ms() -> int:
    """Return user idle time in milliseconds."""
    # Try GNOME Mutter IdleMonitor (Wayland compatibility)
    raw_dbus = _run(["gdbus", "call", "--session", "--dest", "org.gnome.Mutter.IdleMonitor", 
                     "--object-path", "/org/gnome/Mutter/IdleMonitor/Core", 
                     "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime"])
    if raw_dbus and "(uint64" in raw_dbus:
        try:
            return int(raw_dbus.split("uint64 ")[1].split(",")[0])
        except Exception:
            pass
            
    # Fallback to xprintidle (X11 / XWayland)
    raw = _run(["xprintidle"])
    return int(raw) if raw and raw.isdigit() else 0


def get_active_window_info() -> tuple[str, str] | None:
    """Return (app_name, window_title) of the focused window via AT-SPI."""
    try:
        desktop = Atspi.get_desktop(0)
        if not desktop:
            return None
        for i in range(desktop.get_child_count()):
            app = desktop.get_child_at_index(i)
            if not app: continue
            for j in range(app.get_child_count()):
                window = app.get_child_at_index(j)
                if not window: continue
                state = window.get_state_set()
                if state.contains(Atspi.StateType.ACTIVE):
                    return (app.get_name() or "", window.get_name() or "")
    except Exception:
        pass
    return None


def post_log(app_name: str, window_title: str, active_s: float, idle_s: float) -> None:
    """Send accumulated time to the daemon."""
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "app_name": app_name,
        "window_title": window_title,
        "active_seconds": round(active_s, 2),
        "idle_seconds": round(idle_s, 2),
    }
    try:
        requests.post(DAEMON_URL, json=payload, timeout=3)
    except requests.RequestException:
        pass  # daemon might not be up yet; silently drop


def main() -> None:
    prev_app = ""
    prev_title = ""
    active_seconds = 0.0
    idle_seconds = 0.0
    last_t = time.monotonic()

    while True:
        time.sleep(POLL_INTERVAL)
        now_t = time.monotonic()
        dt = max(0.0, now_t - last_t)
        last_t = now_t

        info = get_active_window_info()
        if info is None:
            continue

        app_name, title = info
        idle_ms = get_idle_ms()
        is_idle = idle_ms >= IDLE_THRESHOLD

        # First observation: initialize the "current" window without losing time.
        if not prev_app and not prev_title:
            prev_app = app_name
            prev_title = title
            continue

        changed = app_name != prev_app or title != prev_title

        # Attribute elapsed time to the previous window (not the new one).
        if is_idle:
            idle_seconds += dt
        else:
            active_seconds += dt

        if changed:
            post_log(prev_app, prev_title, active_seconds, idle_seconds)
            prev_app = app_name
            prev_title = title
            active_seconds = 0.0
            idle_seconds = 0.0


if __name__ == "__main__":
    main()
