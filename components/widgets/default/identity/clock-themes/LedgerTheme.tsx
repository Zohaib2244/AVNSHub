import type { ClockThemeProps } from "../clockTheme";
import { LofiRow, MiniCalendar, ThemeModeRow } from "../ClockShared";

export function LedgerTheme({ size, d, chrome }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-ldg-s">
        <div className="cth-ldg-time">{d.hh}:{d.mm}</div>
        <div className="cth-ldg-date">{d.dateShort}</div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="cth-ldg-m">
        <div className="cth-ldg-time">{d.hh}:{d.mm}:{d.ss}</div>
        <div className="cth-ldg-date">{d.dateMed}</div>
        <div className="cth-ldg-bar"><i style={{ width: `${d.dayPct}%` }} /></div>
        <div className="cth-ldg-meta">
          <span>sunrise {d.sunriseLabel}</span>
          <span className="cth-orange">{d.phase}</span>
          <span>sunset {d.sunsetLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cth-ldg-l">
      <div className="cth-ldg-l-left">
        <div className="cth-ldg-time">{d.hh}:{d.mm}:{d.ss}</div>
        <div className="cth-ldg-date">{d.dateMed}</div>
        <div className="cth-ldg-bar"><i style={{ width: `${d.dayPct}%` }} /></div>
        <div className="cth-ldg-meta">
          <span>sunrise {d.sunriseLabel}</span>
          <span className="cth-orange">{d.phase}</span>
          <span>sunset {d.sunsetLabel}</span>
        </div>
      </div>
      <div className="cth-ldg-l-div" />
      <div className="cth-ldg-l-right">
        <ThemeModeRow mode={chrome.themeMode} setMode={chrome.setThemeMode} />
        {chrome.showLofi && <LofiRow playing={chrome.lofiPlaying} label={chrome.lofiLabel} onToggle={chrome.toggleLofi} />}
        {chrome.showCalendar && d.calendar && <MiniCalendar calendar={d.calendar} />}
      </div>
    </div>
  );
}
