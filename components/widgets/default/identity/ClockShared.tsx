// Small pieces several clock themes reuse verbatim — theme-mode row, lofi
// row, mini calendar — styled by the existing rules in ClockWidget.css
// (.theme-row/.lofi-row/.mini-cal and friends), which this file assumes is
// already imported by the dispatcher.

import { Moon, Pause, Play, Sun, SunMoon } from "lucide-react";
import type { ThemeMode } from "@/lib/theme";
import type { CalendarData } from "./clockData";

const THEME_OPTIONS: { mode: ThemeMode; Icon: typeof Sun }[] = [
  { mode: "light", Icon: Sun },
  { mode: "auto", Icon: SunMoon },
  { mode: "dark", Icon: Moon },
];

export function ThemeModeRow({ mode, setMode }: { mode: ThemeMode; setMode: (m: ThemeMode) => void }) {
  return (
    <div className="theme-row">
      {THEME_OPTIONS.map(({ mode: m, Icon }) => (
        <button
          key={m}
          type="button"
          className={`theme-mode-btn${mode === m ? " active" : ""}`}
          onClick={() => setMode(m)}
        >
          <Icon size={12} strokeWidth={1.75} />
          {m}
        </button>
      ))}
    </div>
  );
}

export function LofiRow({ playing, label, onToggle }: { playing: boolean; label: string; onToggle: () => void }) {
  return (
    <div className="lofi-row">
      <button
        type="button"
        className="lofi-btn"
        onClick={onToggle}
        aria-label={playing ? "Pause lofi radio" : "Play lofi radio"}
      >
        {playing ? <Pause size={12} strokeWidth={1.75} /> : <Play size={12} strokeWidth={1.75} />}
      </button>
      <div className={`wave${playing ? " playing" : ""}`} aria-hidden>
        <span /><span /><span /><span /><span />
      </div>
      <span className="lofi-label">{label}</span>
    </div>
  );
}

export function MiniCalendar({ calendar }: { calendar: CalendarData }) {
  return (
    <div className="mini-cal">
      <div className="cal-header">
        <span>{calendar.title}</span>
      </div>
      <div className="cal-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div className="dow" key={`${d}-${i}`}>{d}</div>
        ))}
        {Array.from({ length: calendar.firstDow }, (_, i) => (
          <div className="day other" key={`pad-${i}`} />
        ))}
        {Array.from({ length: calendar.daysInMonth }, (_, i) => (
          <div className={`day${i + 1 === calendar.today ? " cur" : ""}`} key={i + 1}>
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
