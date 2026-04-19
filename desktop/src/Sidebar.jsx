import React from "react";

const DAEMON_BASE_URL = "http://127.0.0.1:7777";

function Sidebar({ days, loadingDays, selectedDay, setSelectedDay }) {
  return (
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
  );
}

export default Sidebar;
