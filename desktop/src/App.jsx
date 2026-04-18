import { useEffect, useMemo, useState } from "react";
import "./App.css";

const DAEMON_BASE_URL = "http://127.0.0.1:7777";
// Threshold is applied per-app/per-domain totals (not per individual row),
// because the daemon stores time in many small chunks.
const MIN_ACTIVE_SECONDS = 5 * 60;

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
        {rows.length === 0 ? <div className="muted">No data above 5 minutes.</div> : null}
      </div>
    </section>
  );
}

function App() {
  const [days, setDays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayData, setDayData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingDays, setLoadingDays] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
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
    async function loadDay() {
      setLoadingDay(true);
      setError("");
      try {
        // Fetch full day; we'll filter rows based on summary totals.
        const res = await fetch(`${DAEMON_BASE_URL}/day/${encodeURIComponent(selectedDay)}`);
        if (!res.ok) throw new Error(`Daemon /day failed (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        setDayData(json);
      } catch (e) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoadingDay(false);
      }
    }
    loadDay();
    return () => {
      cancelled = true;
    };
  }, [selectedDay]);

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

  const filtered = useMemo(() => {
    const allowedApps = new Set((summary?.apps ?? []).map((r) => r.app_name));
    const allowedDomains = new Set((summary?.domains ?? []).map((r) => r.domain));
    const tab = (dayData?.tab_log ?? []).filter((r) => allowedDomains.has(r.domain));
    const win = (dayData?.window_log ?? []).filter((r) => allowedApps.has(r.app_name || "Unknown app"));
    const checks = dayData?.checkins ?? [];
    return { tab, win, checks };
  }, [dayData, summary]);

  const stats = useMemo(() => {
    const tabs = filtered.tab;
    const wins = filtered.win;
    const checks = filtered.checks;
    const tabActive = tabs.reduce((a, r) => a + (Number(r.active_seconds) || 0), 0);
    const winActive = wins.reduce((a, r) => a + (Number(r.active_seconds) || 0), 0);
    return {
      tabsCount: tabs.length,
      winsCount: wins.length,
      checksCount: checks.length,
      tabActive,
      winActive,
    };
  }, [filtered]);

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
            <div className="contentMeta">
              Tabs: {stats.tabsCount} • Windows: {stats.winsCount} • Check-ins: {stats.checksCount}
            </div>
          </div>
          <div className="contentMeta">
            Showing only apps/domains ≥ 5 min • Active (tabs): {formatSeconds(stats.tabActive)} • Active (windows):{" "}
            {formatSeconds(stats.winActive)}
          </div>
        </header>

        {error ? <div className="errorBox">{error}</div> : null}

        {loadingDay ? (
          <div className="panel">Loading day…</div>
        ) : !selectedDay ? (
          <div className="panel">Select a day.</div>
        ) : !dayData ? (
          <div className="panel">No data.</div>
        ) : (
          <div className="grid">
            {loadingSummary ? (
              <section className="panel span2">Loading graphs…</section>
            ) : (
              <>
                <BarList
                  title="Time spent (apps)"
                  rows={summary?.apps ?? []}
                  getLabel={(r) => r.app_name}
                  getSeconds={(r) => r.active_seconds}
                />
                <BarList
                  title="Time spent (domains)"
                  rows={summary?.domains ?? []}
                  getLabel={(r) => r.domain}
                  getSeconds={(r) => r.active_seconds}
                />
              </>
            )}

            <section className="panel">
              <div className="panelTitle">Tab log</div>
              <div className="list">
                {(filtered.tab ?? []).map((r) => (
                  <div key={r.id} className="rowItem">
                    <div className="rowTop">
                      <div className="rowPrimary">
                        <span className="mono">{timeFromTimestamp(r.timestamp)}</span>{" "}
                        <span className="pill">{r.category}</span>{" "}
                        <span className="strong">{r.domain}</span>
                      </div>
                      <div className="rowSecondary">
                        {formatSeconds(r.active_seconds)}
                        {Number(r.idle_seconds) ? ` • idle ${formatSeconds(r.idle_seconds)}` : ""}
                      </div>
                    </div>
                    {r.title ? <div className="rowText">{r.title}</div> : null}
                    {r.url ? <div className="rowUrl mono">{r.url}</div> : null}
                  </div>
                ))}
                {(filtered.tab ?? []).length === 0 ? <div className="muted">No tab logs ≥ 5 min (by domain).</div> : null}
              </div>
            </section>

            <section className="panel">
              <div className="panelTitle">Window log</div>
              <div className="list">
                {(filtered.win ?? []).map((r) => (
                  <div key={r.id} className="rowItem">
                    <div className="rowTop">
                      <div className="rowPrimary">
                        <span className="mono">{timeFromTimestamp(r.timestamp)}</span>{" "}
                        <span className="strong">{r.app_name || "Unknown app"}</span>
                      </div>
                      <div className="rowSecondary">
                        {formatSeconds(r.active_seconds)}
                        {Number(r.idle_seconds) ? ` • idle ${formatSeconds(r.idle_seconds)}` : ""}
                      </div>
                    </div>
                    {r.window_title ? <div className="rowText">{r.window_title}</div> : null}
                  </div>
                ))}
                {(filtered.win ?? []).length === 0 ? (
                  <div className="muted">No window logs ≥ 5 min (by app).</div>
                ) : null}
              </div>
            </section>

            <section className="panel span2">
              <div className="panelTitle">Check-ins</div>
              <div className="list">
                {(dayData.checkins ?? []).map((r) => (
                  <div key={r.id} className="rowItem">
                    <div className="rowTop">
                      <div className="rowPrimary">
                        <span className="mono">{timeFromTimestamp(r.timestamp)}</span>
                      </div>
                    </div>
                    <div className="rowText">{r.note || <span className="muted">Empty note</span>}</div>
                  </div>
                ))}
                {(dayData.checkins ?? []).length === 0 ? <div className="muted">No check-ins.</div> : null}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
