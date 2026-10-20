import type { ClockThemeProps } from "../clockTheme";
import { LofiRow, MiniCalendar, ThemeModeRow } from "../ClockShared";

function PulseStrip({ pct, big }: { pct: number; big?: boolean }) {
  return (
    <div className={`cth-pls-strip${big ? " big" : ""}`}>
      <div className="cth-pls-fill" style={{ height: `${pct}%` }} />
      <div className="cth-pls-ticks">
        <i style={{ top: "20%" }} /><i style={{ top: "40%" }} /><i style={{ top: "60%" }} /><i style={{ top: "80%" }} />
      </div>
      <div className="cth-pls-now" style={{ bottom: `${pct}%` }} />
      <div className="cth-pls-caps"><span>05:12</span><span>19:48</span></div>
    </div>
  );
}

export function SplitPulseTheme({ size, d, chrome }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-spl-s">
        <div className="cth-pls-spine"><div className="cth-pls-fill" style={{ height: `${d.dayPct}%` }} /></div>
        <div className="cth-spl-s-main">
          <div className="cth-spl-time">{d.hh}:{d.mm}</div>
          <div className="cth-spl-date">{d.dateShort}</div>
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="cth-spl-m">
        <div className="cth-spl-m-main">
          <div className="cth-spl-time">{d.hh}:{d.mm}:{d.ss}</div>
          <div className="cth-spl-date">{d.dateMed}</div>
        </div>
        <PulseStrip pct={d.dayPct} />
      </div>
    );
  }

  return (
    <div className="cth-spl-l">
      <div className="cth-spl-l-top">
        <div className="cth-spl-l-main">
          <div className="cth-spl-time">{d.hh}:{d.mm}:{d.ss}</div>
          <div className="cth-spl-date">{d.dateLong}</div>
          <div className="cth-spl-l-phase">{d.phase}</div>
        </div>
        <PulseStrip pct={d.dayPct} big />
      </div>
      <div className="cth-spl-l-bottom" style={{ alignItems: "center", display: "flex", gap: 16 }}>
        {chrome.showLofi && <LofiRow playing={chrome.lofiPlaying} label={chrome.lofiLabel} onToggle={chrome.toggleLofi} />}
        <div style={{ flex: 1 }} />
        <ThemeModeRow mode={chrome.themeMode} setMode={chrome.setThemeMode} />
        {chrome.showCalendar && d.calendar && (
          <div style={{ width: 150 }}><MiniCalendar calendar={d.calendar} /></div>
        )}
      </div>
    </div>
  );
}
