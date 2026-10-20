import { Moon, Sun, SunMoon } from "lucide-react";
import type { ClockThemeProps } from "../clockTheme";
import { LofiRow, MiniCalendar, ThemeModeRow } from "../ClockShared";

const iconProps = { size: 8, strokeWidth: 2 };

function NowIcon({ phase }: { phase: string }) {
  if (phase === "night" || phase === "pre-dawn") return <Moon {...iconProps} />;
  if (phase === "midday") return <Sun {...iconProps} />;
  return <SunMoon {...iconProps} />;
}

function Strip({ pct, phase, big }: { pct: number; phase: string; big?: boolean }) {
  return (
    <div className={`cth-spl-strip${big ? " big" : ""}`}>
      <div className="cth-spl-strip-cap top">05:12</div>
      <div className="cth-spl-strip-fill" style={{ height: `${pct}%` }} />
      <div className="cth-spl-strip-now" style={{ bottom: `${pct}%` }}><NowIcon phase={phase} /></div>
      <div className="cth-spl-strip-cap bot">19:48</div>
    </div>
  );
}

export function SplitCardTheme({ size, d, chrome }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-spl-s">
        <div className="cth-spl-accent" />
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
        <Strip pct={d.dayPct} phase={d.phase} />
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
        <Strip pct={d.dayPct} phase={d.phase} big />
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
