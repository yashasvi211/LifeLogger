import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import BarList from "./BarList";
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
      <Sidebar
        days={days}
        loadingDays={loadingDays}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
      />

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
                  <div className="kpi kpiRow">
                    <div className="kpiInfo">
                      <div className="kpiLabel">Computer time</div>
                      <div className="kpiValue mono">{formatSeconds(computer?.total_seconds ?? 0)}</div>
                      <div className="kpiLegendList">
                        <div className="kpiLegendItem">
                          <span className="dot browser"></span>Browser {formatSeconds(Math.min(browser?.active_seconds || 0, computer?.active_seconds || 0))}
                        </div>
                        <div className="kpiLegendItem">
                          <span className="dot active"></span>Other App {formatSeconds(Math.max(0, (computer?.active_seconds || 0) - (browser?.active_seconds || 0)))}
                        </div>
                        <div className="kpiLegendItem">
                          <span className="dot idle"></span>Idle {formatSeconds(computer?.idle_seconds ?? 0)}
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const cTotal = computer?.total_seconds || 1;
                      const cActive = computer?.active_seconds || 0;
                      const cIdle = computer?.idle_seconds || 0;
                      const bActive = Math.min(browser?.active_seconds || 0, cActive);
                      const otherActive = cActive - bActive;
                      
                      const bPct = (bActive / cTotal) * 100;
                      const oPct = (otherActive / cTotal) * 100;

                      const gradient = `conic-gradient(
                        rgba(167, 139, 250, 0.85) 0% ${bPct}%, 
                        rgba(125, 211, 252, 0.85) ${bPct}% ${bPct + oPct}%, 
                        rgba(255, 255, 255, 0.15) ${bPct + oPct}% 100%
                      )`;

                      return (
                        <div className="kpiChartContainer">
                          <div 
                            className="kpiDonut" 
                            style={{ background: gradient }}
                            title={`Browser: ${formatSeconds(bActive)} | Other: ${formatSeconds(otherActive)} | Idle: ${formatSeconds(cIdle)}`}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid">
                  <BarList
                    title="Time spent by application"
                    rows={summary?.apps ?? []}
                    getLabel={(r) => r.app_name}
                    getActiveSeconds={(r) => r.active_seconds}
                    getIdleSeconds={(r) => r.idle_seconds}
                  />
                  <BarList
                    title="Browser time by domain"
                    rows={summary?.domains ?? []}
                    getLabel={(r) => r.domain}
                    getActiveSeconds={(r) => r.active_seconds}
                    getIdleSeconds={(r) => r.idle_seconds}
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
