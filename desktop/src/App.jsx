import { useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import BarList from "./BarList";
import { formatDuration } from "./formatDuration";
import "./App.css";

const DAEMON_BASE_URL = "http://127.0.0.1:7777";
const MIN_ACTIVE_SECONDS = 0;
const REFRESH_INTERVAL_MS = 2000;

function App() {
  const [days, setDays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingDays, setLoadingDays] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState(null);
  const hasLoadedDaysRef = useRef(false);
  const hasLoadedSummaryRef = useRef(false);
  const [daemonStatus, setDaemonStatus] = useState("checking");

  useEffect(() => {
    let cancelled = false;
    async function loadDays() {
      if (!hasLoadedDaysRef.current) {
        setLoadingDays(true);
      }
      setError("");
      try {
        const res = await fetch(`${DAEMON_BASE_URL}/days?limit=90&_t=${Date.now()}`);
        if (!res.ok) throw new Error(`Daemon /days failed (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        const list = Array.isArray(json.days) ? json.days : [];
        hasLoadedDaysRef.current = true;
        setDays(list);
        setDaemonStatus("operational");
        
        setSelectedDay((prev) => {
          if (!prev) return list[0] ?? null;
          // If we were on the latest day, and now there's a new latest day, switch to it
          if (days.length > 0 && prev === days[0] && list[0] && prev !== list[0]) {
            return list[0];
          }
          return prev;
        });
      } catch (e) {
        if (!cancelled) {
          setError(String(e?.message ?? e));
          setDaemonStatus("error");
        }
      } finally {
        if (!cancelled) setLoadingDays(false);
      }
    }
    loadDays();
    const intervalId = window.setInterval(loadDays, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!selectedDay) return;
    let cancelled = false;
    hasLoadedSummaryRef.current = false;
    setLoadingSummary(true);
    setSummary(null);

    async function loadSummary() {
      if (!hasLoadedSummaryRef.current) {
        setLoadingSummary(true);
      }
      setError("");
      try {
        const res = await fetch(
          `${DAEMON_BASE_URL}/day/${encodeURIComponent(selectedDay)}/summary?min_active_seconds=${MIN_ACTIVE_SECONDS}&limit=20&_t=${Date.now()}`,
        );
        if (!res.ok) throw new Error(`Daemon /summary failed (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        hasLoadedSummaryRef.current = true;
        setSummary(json);
        setLastSynced(new Date());
        setDaemonStatus("operational");
      } catch (e) {
        if (!cancelled) {
          setError(String(e?.message ?? e));
          setDaemonStatus("error");
        }
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    }
    loadSummary();
    const intervalId = window.setInterval(loadSummary, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
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
          <div className="headerRight">
            <div className="syncStatus">
              <span className={`statusIndicator ${daemonStatus}`}>
                {daemonStatus === "operational" && "● Daemon Operational"}
                {daemonStatus === "error" && "● Daemon Error"}
                {daemonStatus === "checking" && "● Checking..."}
              </span>
              {lastSynced && <span className="syncTime">Synced {lastSynced.toLocaleTimeString()}</span>}
              <button 
                className="refreshBtn" 
                onClick={async () => {
                  setLastSynced(null);
                  // These are inside effects, so we can't call them directly here 
                  // unless we move them. But we can just reload the window 
                  // or use a 'refresh key' to trigger effects.
                  window.location.reload(); 
                }}
                title="Force Reload"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              </button>
            </div>
            <div className="contentMeta">Source: {DAEMON_BASE_URL}</div>
          </div>
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
                      <div className="kpiValue mono">{formatDuration(computer?.total_seconds ?? 0)}</div>
                      <div className="kpiLegendList">
                        <div className="kpiLegendItem">
                          <span className="dot active"></span>Active {formatDuration(computer?.active_seconds || 0)}
                        </div>
                        <div className="kpiLegendItem">
                          <span className="dot idle"></span>Idle {formatDuration(computer?.idle_seconds ?? 0)}
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const cTotal = computer?.total_seconds || 1;
                      const cActive = computer?.active_seconds || 0;
                      const cIdle = computer?.idle_seconds || 0;
                      
                      const activePct = (cActive / cTotal) * 100;

                      const gradient = `conic-gradient(
                        rgba(125, 211, 252, 0.85) 0% ${activePct}%, 
                        rgba(255, 255, 255, 0.15) ${activePct}% 100%
                      )`;

                      return (
                        <div className="kpiChartContainer">
                          <div 
                            className="kpiDonut" 
                            style={{ background: gradient }}
                            title={`Active: ${formatDuration(cActive)} | Idle: ${formatDuration(cIdle)}`}
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
