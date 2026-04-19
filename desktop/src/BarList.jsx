import React from "react";
import "./App.css";

function formatSeconds(s) {
  if (s == null) return "";
  const secs = Math.max(0, Math.round(Number(s)));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function BarList({ title, rows, getLabel, getActiveSeconds, getIdleSeconds }) {
  const max = Math.max(1, ...rows.map((r) => {
    const active = Number(getActiveSeconds(r)) || 0;
    const idle = Number(getIdleSeconds(r)) || 0;
    return active + idle;
  }));

  return (
    <div className="panel">
      <div className="panelTitle">{title}</div>
      <div className="barList">
        {rows.map((r, idx) => {
          const activeSecs = Number(getActiveSeconds(r)) || 0;
          const idleSecs = Number(getIdleSeconds(r)) || 0;
          
          const activePct = Math.max(0, Math.min(100, (activeSecs / max) * 100));
          const idlePct = Math.max(0, Math.min(100, (idleSecs / max) * 100));

          return (
            <div key={`${getLabel(r)}-${idx}`} className="barRow">
              <div className="barLabel">
                <span className="strong">{getLabel(r)}</span>
              </div>
              <div className="barTrack">
                <div className="barFill" style={{ width: `${activePct}%` }} title="Active time" />
                <div className="barFillIdle" style={{ width: `${idlePct}%` }} title="Idle time" />
              </div>
              <div className="barValue mono">
                <div className="activeTime" title="Active time">{formatSeconds(activeSecs)}</div>
                {idleSecs > 0 && <div className="idleTime" title="Idle time">{formatSeconds(idleSecs)}</div>}
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? <div className="muted">No data.</div> : null}
      </div>
    </div>
  );
}

export default BarList;
