import { Moon, Sun, SunMoon } from "lucide-react";
import type { ClockThemeProps } from "../clockTheme";
import { MiniCalendar } from "../ClockShared";

function Ring({ size, stroke, pct }: { size: number; stroke: number; pct: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-orange)" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

const PhaseIcon = ({ phase }: { phase: string }) =>
  phase === "night" || phase === "pre-dawn" ? <Moon size={12} strokeWidth={1.75} /> : phase === "midday" ? <Sun size={12} strokeWidth={1.75} /> : <SunMoon size={12} strokeWidth={1.75} />;

export function ArcDialTheme({ size, d }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-arc-s">
        <div className="cth-arc-wrap">
          <Ring size={72} stroke={6} pct={d.dayPct} />
          <div className="cth-arc-time">{d.hh}:{d.mm}<small>{d.phase}</small></div>
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="cth-arc-m">
        <div className="cth-arc-wrap">
          <Ring size={104} stroke={7} pct={d.dayPct} />
          <div className="cth-arc-time">{d.hh}:{d.mm}:{d.ss}<small>{d.dayPct}% through the day</small></div>
        </div>
        <div className="cth-arc-side">
          <div className="cth-arc-date">{d.dateShort}</div>
          <div className="cth-arc-phase"><PhaseIcon phase={d.phase} />{d.phase}</div>
          <div className="cth-arc-suns"><span>sunrise <b>{d.sunriseLabel}</b></span><span>sunset <b>{d.sunsetLabel}</b></span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="cth-arc-l">
      <div className="cth-arc-wrap">
        <Ring size={140} stroke={9} pct={d.dayPct} />
        <div className="cth-arc-time">{d.hh}:{d.mm}:{d.ss}<small>{d.dayPct}% through the day</small></div>
      </div>
      <div className="cth-arc-l-right">
        <div className="cth-arc-l-date">{d.dateLong}</div>
        <div className="cth-arc-l-suns">
          <div>sunrise<b>{d.sunriseLabel}</b></div>
          <div>sunset<b>{d.sunsetLabel}</b></div>
          <div>phase<b className="cth-orange">{d.phase}</b></div>
        </div>
        {d.calendar && <MiniCalendar calendar={d.calendar} />}
      </div>
    </div>
  );
}
