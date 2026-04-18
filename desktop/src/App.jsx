import { useEffect, useState } from "react";
import "./App.css";

const DAEMON_BASE_URL = "http://127.0.0.1:7777";
const MIN_ACTIVE_SECONDS = 0;

function formatSeconds(s) {
  if (s == null) return "";
  const secs = Math.max(0, Math.round(Number(s)));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeFromTimestamp(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function BarList({ title, rows, getLabel, getSeconds }) {
  const max = Math.max(1, ...rows.map((r) => Number(getSeconds(r)) || 0));
  return (
    <section className="panel">
      <div className="panelTitle">{title}</div>
      <div className="barList">
        {rows.map((r, idx) => {
          const secs = Number(getSeconds(r)) || 0;
          const pct = Math.max(0, Math.min(100, (secs / max) * 100));
          return (
            <div key={`${getLabel(r)}-${idx}`} className="barRow">
              <div className="barLabel">
                <span className="strong">{getLabel(r)}</span>
              </div>
              <div className="barTrack">
                <div className="barFill" style={{ width: `${pct}%` }} />
              </div>
              <div className="barValue mono">{formatSeconds(secs)}</div>
            </div>
          );
        })}
        {rows.length === 0 ? <div className="muted">No data.</div> : null}
      </div>
    </section>
  );
}

function App() {
  const [days, setDays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingDays, setLoadingDays] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadDays() {
      setLoadingDays(true);
      setError("");
      try {
        const res = await fetch(`${DAEMON_BASE_URL}/days?limit=90`);
        if (!res.ok) throw new Error(`Daemon /days failed (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        const list = Array.isArray(json.days) ? json.days : [];
        setDays(list);
        setSelectedDay((prev) => prev ?? list[0] ?? null);
      } catch (e) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoadingDays(false);
      }
    }
    loadDays();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDay) return;
    let cancelled = false;
    async function loadSummary() {
      setLoadingSummary(true);
      setError("");
      try {
        const res = await fetch(
          `${DAEMON_BASE_URL}/day/${encodeURIComponent(selectedDay)}/summary?min_active_seconds=${MIN_ACTIVE_SECONDS}&limit=20`,
        );
        if (!res.ok) throw new Error(`Daemon /summary failed (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        setSummary(json);
      } catch (e) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    }
    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [selectedDay]);

  const totals = summary?.totals;
  const computer = totals?.computer;
  const browser = totals?.browser;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebarHeader">
          <div className="appTitle">LifeLogger</div>
          <div className="appSub">Date-wise logs</div>
        </div>

        <div className="sidebarSection">
          <div className="sidebarLabel">Days</div>
          {loadingDays ? (
            <div className="muted">Loading…</div>
          ) : days.length === 0 ? (
            <div className="muted">No data yet.</div>
          ) : (
            <div className="dayList">
              {days.map((d) => (
                <button
                  key={d}
                  className={`dayItem ${selectedDay === d ? "active" : ""}`}
                  onClick={() => setSelectedDay(d)}
                  type="button"
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sidebarFooter">
          <div className="muted">
            Source: <span className="mono">{DAEMON_BASE_URL}</span>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="contentHeader">
          <div>
            <div className="contentTitle">{selectedDay ?? "—"}</div>
            <div className="contentMeta">Date-wise total time spent</div>
          </div>
          <div className="contentMeta">Source: {DAEMON_BASE_URL}</div>
        </header>

        {error ? <div className="errorBox">{error}</div> : null}

        {!selectedDay ? (
          <div className="panel">Select a day.</div>
        ) : (
          <>
            {loadingSummary ? (
              <div className="panel">Loading…</div>
            ) : !summary ? (
              <div className="panel">No data.</div>
            ) : (
              <>
                <div className="kpiGrid">
                  <div className="kpi">
                    <div className="kpiLabel">Computer time</div>
                    <div className="kpiValue mono">{formatSeconds(computer?.total_seconds ?? 0)}</div>
                    <div className="kpiMeta">
                      Active {formatSeconds(computer?.active_seconds ?? 0)} • Idle{" "}
                      {formatSeconds(computer?.idle_seconds ?? 0)}
                      {browser ? ` • Browser active ${formatSeconds(browser.active_seconds ?? 0)}` : ""}
                    </div>
                  </div>
                </div>

                <div className="grid">
                  <BarList
                    title="Time spent by application (active time)"
                    rows={summary?.apps ?? []}
                    getLabel={(r) => r.app_name}
                    getSeconds={(r) => r.active_seconds}
                  />
                  <BarList
                    title="Browser time by domain (active time)"
                    rows={summary?.domains ?? []}
                    getLabel={(r) => r.domain}
                    getSeconds={(r) => r.active_seconds}
                  />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
