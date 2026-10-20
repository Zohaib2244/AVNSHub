import { Play } from "lucide-react";
import type { ClockThemeProps } from "../clockTheme";

export function MinimalTheme({ size, d, chrome }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-min-s">
        <div className="cth-min-time">{d.hh}:{d.mm}</div>
        <div className="cth-min-date">{d.dateShort.toLowerCase()}</div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="cth-min-m">
        <div className="cth-min-time">{d.hh}:{d.mm}:{d.ss}</div>
        <div className="cth-min-date cth-muted">{d.dateMed}</div>
        <div className="cth-min-thread"><i style={{ left: `${d.dayPct}%` }} /></div>
        <div className="cth-min-phase">
          <span>{d.sunriseLabel}</span>
          <span className="cth-orange">{d.phase}</span>
          <span>{d.sunsetLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cth-min-l">
      <div className="cth-min-l-left">
        <div className="cth-min-time">{d.hh}:{d.mm}:{d.ss}</div>
        <div className="cth-min-date">{d.dateLong}</div>
      </div>
      <div className="cth-min-l-div" />
      <div className="cth-min-l-right">
        <div className="cth-min-l-suns">
          <div>sunrise<b>{d.sunriseLabel}</b></div>
          <div>sunset<b>{d.sunsetLabel}</b></div>
        </div>
        <div className="cth-min-thread"><i style={{ left: `${d.dayPct}%` }} /></div>
        {chrome.showLofi && (
          <button
            type="button"
            onClick={chrome.toggleLofi}
            style={{ alignItems: "center", background: "transparent", border: "none", cursor: "pointer", display: "flex", gap: 8, padding: 0 }}
          >
            <span style={{ alignItems: "center", border: "1px solid var(--border)", borderRadius: "50%", color: "var(--text-muted)", display: "inline-flex", flex: "none", height: 22, justifyContent: "center", width: 22 }}>
              <Play size={10} strokeWidth={1.75} />
            </span>
            <span className="cth-dim" style={{ fontSize: "var(--fs-micro)" }}>{chrome.lofiLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}
