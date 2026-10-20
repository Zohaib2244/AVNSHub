// Shared time/date/day-progress/calendar computation for every clock theme,
// plus the small bezier helper the illustrated themes (horizon, split-sky)
// use to place a sun/moon marker along a path. One hook so ten themes don't
// each reimplement "what % through the day is it" slightly differently.

import { useEffect, useState } from "react";

export const SUNRISE_MINS = 5 * 60 + 12;
export const SUNSET_MINS = 19 * 60 + 48;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function phaseFor(totalMins: number): { phase: string; color: string } {
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

export type CalendarData = { firstDow: number; daysInMonth: number; today: number; title: string };

export type ClockData = {
  now: Date | null;
  hh: string;
  mm: string;
  ss: string;
  dayShort: string;
  dateShort: string; // "Thu, Sep 24"
  dateMed: string; // "Thursday, September 24 2026"
  dateLong: string; // "Thursday, September 24, 2026"
  dayPct: number; // 0-100, clamped
  phase: string;
  phaseColor: string;
  sunriseLabel: string;
  sunsetLabel: string;
  calendar: CalendarData | null;
};

/** null now/hh/mm/ss until mounted — server and first client render both
    show placeholders, so the live time never causes a hydration mismatch */
export function useClockData(): ClockData {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const totalMins = now ? now.getHours() * 60 + now.getMinutes() : 0;
  const { phase, color } = phaseFor(totalMins);
  const dayPct = Math.min(100, Math.max(0, Math.round(((totalMins - SUNRISE_MINS) / (SUNSET_MINS - SUNRISE_MINS)) * 100)));

  let calendar: CalendarData | null = null;
  if (now) {
    calendar = {
      firstDow: new Date(now.getFullYear(), now.getMonth(), 1).getDay(),
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      today: now.getDate(),
      title: `${MONTH_SHORT[now.getMonth()]} ${now.getFullYear()}`,
    };
  }

  return {
    now,
    hh: now ? pad(now.getHours()) : "--",
    mm: now ? pad(now.getMinutes()) : "--",
    ss: now ? pad(now.getSeconds()) : "--",
    dayShort: now ? DAY_SHORT[now.getDay()] : "—",
    dateShort: now ? `${DAY_SHORT[now.getDay()]}, ${MONTH_SHORT[now.getMonth()]} ${now.getDate()}` : "—",
    dateMed: now ? `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()} ${now.getFullYear()}` : "—",
    dateLong: now ? `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}` : "—",
    dayPct: now ? dayPct : 0,
    phase: now ? phase : "—",
    phaseColor: color,
    sunriseLabel: "05:12",
    sunsetLabel: "19:48",
    calendar,
  };
}

export type Pt = { x: number; y: number };

/** point at t (0-1) along a quadratic bezier through p0/p1/p2, in whatever
    coordinate space the control points are given (themes use a 0-100 box so
    the result can be used directly as CSS percentages). */
export function bezierPoint(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/** SVG path `d` for the same curve, for drawing the visible arc line -
    pair with an <svg viewBox="0 0 100 100" preserveAspectRatio="none"> so
    the 0-100 coordinate space stretches to fill the real container exactly,
    independent of its actual pixel size. */
export function bezierPathD(p0: Pt, p1: Pt, p2: Pt): string {
  return `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
}
