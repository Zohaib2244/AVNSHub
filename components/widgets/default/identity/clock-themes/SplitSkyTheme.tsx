import type { ClockThemeProps } from "../clockTheme";
import { LofiRow, MiniCalendar, ThemeModeRow } from "../ClockShared";
import { bezierPoint } from "../clockData";

// control points in a 0-100 box; the SVG viewBox + preserveAspectRatio="none"
// stretches that box to the real (variable) strip size, so the curve and the
// sun marker's position stay correct regardless of actual pixel dimensions.
const CURVE = { p0: { x: 50, y: 4 }, p1: { x: 14, y: 50 }, p2: { x: 50, y: 96 } };

function SkyStrip({ pct, big, caps = true }: { pct: number; big?: boolean; caps?: boolean }) {
  const sun = bezierPoint(CURVE.p0, CURVE.p1, CURVE.p2, pct / 100);
  return (
    <div className={`cth-sky-strip${big ? " big" : ""}`}>
      <span className="cth-sky-star" style={{ top: "9%", left: "30%", animationDelay: ".2s" }} />
      <span className="cth-sky-star" style={{ top: "16%", left: "62%", animationDelay: "1.1s" }} />
      <div className="cth-sky-horizon">
        <i style={{ height: "55%" }} /><i style={{ height: "100%" }} /><i style={{ height: "35%" }} />
        <i style={{ height: "75%" }} /><i style={{ height: "50%" }} />
      </div>
      <svg className="cth-sky-arc-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          d={`M ${CURVE.p0.x} ${CURVE.p0.y} Q ${CURVE.p1.x} ${CURVE.p1.y} ${CURVE.p2.x} ${CURVE.p2.y}`}
          fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1" strokeDasharray="2,3" vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="cth-sky-sun" style={{ left: `${sun.x}%`, top: `${sun.y}%` }} />
      {caps && <div className="cth-sky-caps"><span>05:12</span><span>19:48</span></div>}
    </div>
  );
}

function Spine({ pct }: { pct: number }) {
  const sun = bezierPoint(CURVE.p0, CURVE.p1, CURVE.p2, pct / 100);
  return (
    <div className="cth-sky-spine">
      <i style={{ top: "14%" }} />
      <span
        className="cth-sky-sun"
        style={{ height: 8, left: `${sun.x}%`, margin: -4, top: `${sun.y}%`, width: 8 }}
      />
    </div>
  );
}

export function SplitSkyTheme({ size, d, chrome }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-spl-s">
        <Spine pct={d.dayPct} />
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
          <div className="cth-spl-time cth-spl-time-glow">{d.hh}:{d.mm}:{d.ss}</div>
          <div className="cth-spl-date">{d.dateMed}</div>
        </div>
        <SkyStrip pct={d.dayPct} />
      </div>
    );
  }

  return (
    <div className="cth-spl-l">
      <div className="cth-spl-l-top">
        <div className="cth-spl-l-main">
          <div className="cth-spl-time cth-spl-time-glow">{d.hh}:{d.mm}:{d.ss}</div>
          <div className="cth-spl-date">{d.dateLong}</div>
          <div className="cth-spl-l-phase">{d.phase}</div>
        </div>
        <SkyStrip pct={d.dayPct} big />
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
