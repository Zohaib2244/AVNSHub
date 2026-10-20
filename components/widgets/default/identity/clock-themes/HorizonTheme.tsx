import type { ClockThemeProps } from "../clockTheme";
import { MiniCalendar } from "../ClockShared";
import { bezierPoint } from "../clockData";

// dome shape in a 0-100 box: left horizon -> apex -> right horizon
const CURVE = { p0: { x: 5, y: 84 }, p1: { x: 50, y: 6 }, p2: { x: 95, y: 84 } };

function Sky({ pct, children }: { pct: number; children?: React.ReactNode }) {
  const sun = bezierPoint(CURVE.p0, CURVE.p1, CURVE.p2, pct / 100);
  return (
    <div className="cth-hz-sky">
      <div className="cth-hz-skyline">
        <i style={{ height: "32%" }} /><i style={{ height: "58%" }} /><i style={{ height: "26%" }} /><i style={{ height: "70%" }} />
        <i style={{ height: "40%" }} /><i style={{ height: "52%" }} /><i style={{ height: "30%" }} /><i style={{ height: "64%" }} />
        <i style={{ height: "36%" }} /><i style={{ height: "48%" }} /><i style={{ height: "28%" }} /><i style={{ height: "58%" }} />
      </div>
      <svg className="cth-hz-arc-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          d={`M ${CURVE.p0.x} ${CURVE.p0.y} Q ${CURVE.p1.x} ${CURVE.p1.y} ${CURVE.p2.x} ${CURVE.p2.y}`}
          fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1" strokeDasharray="2,3" vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="cth-hz-sun" style={{ left: `${sun.x}%`, top: `${sun.y}%` }} />
      {children}
    </div>
  );
}

export function HorizonTheme({ size, d, chrome }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-bleed">
        <Sky pct={d.dayPct}>
          <div className="cth-hz-hud"><div className="time">{d.hh}:{d.mm}</div><div className="sub">{d.phase}</div></div>
        </Sky>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="cth-bleed">
        <Sky pct={d.dayPct}>
          <div className="cth-hz-hud"><div className="time" style={{ fontSize: "1.05rem" }}>{d.hh}:{d.mm}:{d.ss}</div><div className="sub">{d.dateShort}</div></div>
          <div className="cth-hz-caps"><span>sunrise {d.sunriseLabel}</span><span>sunset {d.sunsetLabel}</span></div>
        </Sky>
      </div>
    );
  }

  return (
    <div className="cth-bleed">
      <Sky pct={d.dayPct}>
        <div className="cth-hz-hud"><div className="time" style={{ fontSize: "1.3rem" }}>{d.hh}:{d.mm}:{d.ss}</div><div className="sub">live sky</div></div>
        <div className="cth-hz-panel">
          <div className="date">{d.dateLong}</div>
          <div className="phase">{d.phase}</div>
          <div className="suns"><span>sunrise<b>{d.sunriseLabel}</b></span><span>sunset<b>{d.sunsetLabel}</b></span></div>
          {chrome.showCalendar && d.calendar && <MiniCalendar calendar={d.calendar} />}
        </div>
      </Sky>
    </div>
  );
}
