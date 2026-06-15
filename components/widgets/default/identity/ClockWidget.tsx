"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Moon, Pause, Play, Sun, SunMoon } from "lucide-react";
import {
  applyTheme,
  getServerThemeMode,
  getThemeMode,
  setThemeMode,
  subscribeTheme,
  type ThemeMode,
} from "@/lib/theme";
import { useWidget } from "@/components/framework/WidgetContext";

const SUNRISE_MINS = 5 * 60 + 12;
const SUNSET_MINS = 19 * 60 + 48;
const LOFI_STREAM = "https://streams.ilovemusic.de/iloveradio17.mp3";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const THEME_OPTIONS: { mode: ThemeMode; Icon: typeof Sun }[] = [
  { mode: "light", Icon: Sun },
  { mode: "auto", Icon: SunMoon },
  { mode: "dark", Icon: Moon },
];

function phaseFor(totalMins: number): { phase: string; color: string } {
  if (totalMins < SUNRISE_MINS) return { phase: "pre-dawn", color: "#3a4a7a" };
  if (totalMins < SUNRISE_MINS + 90) return { phase: "morning", color: "#e8a050" };
  if (totalMins < 12 * 60) return { phase: "morning", color: "#f0b840" };
  if (totalMins < 14 * 60) return { phase: "midday", color: "var(--accent-cyan)" };
  if (totalMins < SUNSET_MINS - 90) return { phase: "afternoon", color: "var(--accent-orange)" };
  if (totalMins < SUNSET_MINS) return { phase: "dusk", color: "#c05030" };
  return { phase: "night", color: "#3a4a7a" };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function ClockWidget() {
  // null until mounted — server and first client render both show placeholders,
  // so the live time never causes a hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  const [lofiPlaying, setLofiPlaying] = useState(false);
  const [lofiLabel, setLofiLabel] = useState("lofi hip-hop radio");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, getServerThemeMode);
  const { settings } = useWidget();

  useEffect(() => {
    const tick = () => {
      setNow(new Date());
      applyTheme(); // keeps auto mode flipping at 06:00 / 20:00 — no-op otherwise
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      audioRef.current?.pause();
    };
  }, []);

  function toggleLofi() {
    if (lofiPlaying) {
      audioRef.current?.pause();
      setLofiPlaying(false);
      setLofiLabel("lofi hip-hop radio");
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio(LOFI_STREAM);
      audioRef.current.volume = 0.4;
    }
    audioRef.current
      .play()
      .then(() => setLofiLabel("lofi hip-hop radio — live"))
      .catch(() => setLofiLabel("autoplay blocked — allow audio"));
    setLofiPlaying(true);
  }

  const totalMins = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const { phase, color } = phaseFor(totalMins);
  const dayPct = Math.min(100, Math.max(0, Math.round(((totalMins - SUNRISE_MINS) / (SUNSET_MINS - SUNRISE_MINS)) * 100)));

  // mini calendar
  let calendar: { firstDow: number; daysInMonth: number; today: number; title: string } | null = null;
  if (now) {
    calendar = {
      firstDow: new Date(now.getFullYear(), now.getMonth(), 1).getDay(),
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      today: now.getDate(),
      title: `${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`,
    };
  }

  return (
    <>
      <div className="clock-time">
        {now ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : "--:--:--"}
      </div>
      <div className="clock-date">
        {now ? `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()} ${now.getFullYear()}` : "—"}
      </div>

      <div className="tint-bar">
        <div className="tint-fill" style={{ width: `${now ? dayPct : 0}%`, background: color }} />
      </div>
      <div className="tint-meta">
        <span>sunrise 05:12</span>
        <span>{now ? phase : "—"}</span>
        <span>sunset 19:48</span>
      </div>

      {settings.showLofi === true && (
      <div className="lofi-row">
        <button
          type="button"
          className="lofi-btn"
          onClick={toggleLofi}
          aria-label={lofiPlaying ? "Pause lofi radio" : "Play lofi radio"}
        >
          {lofiPlaying ? <Pause size={12} strokeWidth={1.75} /> : <Play size={12} strokeWidth={1.75} />}
        </button>
        <div className={`wave${lofiPlaying ? " playing" : ""}`} aria-hidden>
          <span /><span /><span /><span /><span />
        </div>
        <span className="lofi-label">{lofiLabel}</span>
      </div>
      )}

      <div className="theme-row">
        {THEME_OPTIONS.map(({ mode: m, Icon }) => (
          <button
            key={m}
            type="button"
            className={`theme-mode-btn${mode === m ? " active" : ""}`}
            onClick={() => setThemeMode(m)}
          >
            <Icon size={12} strokeWidth={1.75} />
            {m}
          </button>
        ))}
      </div>

      {settings.showCalendar === true && calendar && (
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
      )}
    </>
  );
}
