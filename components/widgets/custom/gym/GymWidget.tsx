"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, Flame, Target } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";

const STORAGE_KEY = "nutmag-gym-attendance";
const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return localDateStr(new Date());
}

function parseLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function loadEntries(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : []);
  } catch {
    return new Set();
  }
}

function saveEntries(entries: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries].sort()));
}

function clampGoal(value: unknown): number {
  const goal = typeof value === "number" && Number.isFinite(value) ? value : 4;
  return Math.min(7, Math.max(1, Math.round(goal)));
}

function computeStreak(entries: Set<string>, today: string): number {
  const cursor = parseLocalDate(today);
  let streak = 0;

  if (!entries.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (entries.has(localDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function weekFrom(today: string): { date: string; label: string }[] {
  const date = parseLocalDate(today);
  const dayOfWeek = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  return WEEK_LABELS.map((label, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return { date: localDateStr(day), label };
  });
}

function monthCells(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1);
  const mondayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(mondayOffset).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(localDateStr(new Date(year, month, day)));
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function percent(count: number, goal: number): number {
  return Math.min(100, Math.round((count / goal) * 100));
}

const actionButtonStyle = (active: boolean, compact = false): CSSProperties => ({
  alignItems: "center",
  background: active ? "var(--accent-orange)" : "var(--bg-nested)",
  border: `1.5px solid ${active ? "var(--accent-orange)" : "var(--border)"}`,
  borderRadius: 12,
  boxShadow: active ? "2px 2px 0 var(--shadow)" : "none",
  color: active ? "var(--bg-card)" : "var(--text-primary)",
  cursor: "pointer",
  display: "inline-flex",
  fontFamily: "var(--font-display)",
  fontSize: compact ? "0.56rem" : "0.62rem",
  gap: 5,
  justifyContent: "center",
  letterSpacing: "0.12em",
  lineHeight: 1,
  minHeight: compact ? 24 : 30,
  padding: compact ? "5px 8px" : "7px 12px",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});

const dayButtonStyle = (logged: boolean, isToday: boolean): CSSProperties => ({
  alignItems: "center",
  aspectRatio: "1",
  background: logged ? "var(--accent-orange)" : "var(--bg-nested)",
  border: `1.5px solid ${isToday ? "var(--accent-cyan)" : logged ? "var(--accent-orange)" : "var(--border)"}`,
  borderRadius: 12,
  boxShadow: logged ? "2px 2px 0 var(--shadow)" : "none",
  color: logged ? "var(--bg-card)" : isToday ? "var(--accent-cyan)" : "var(--text-muted)",
  cursor: "pointer",
  display: "flex",
  fontFamily: "var(--font-mono)",
  fontSize: "0.62rem",
  justifyContent: "center",
  lineHeight: 1,
  minWidth: 0,
  padding: 0,
});

function AttendanceButton({
  date,
  label,
  logged,
  onToggle,
  compact = false,
}: {
  date: string;
  label: string;
  logged: boolean;
  onToggle: (date: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={logged}
      aria-label={`${logged ? "remove" : "log"} gym attendance for ${date}`}
      onClick={() => onToggle(date)}
      style={actionButtonStyle(logged, compact)}
    >
      {logged && <Check size={compact ? 10 : 12} strokeWidth={2} />}
      {label}
    </button>
  );
}

function WeekStrip({
  week,
  today,
  entries,
  onToggle,
  compact = false,
}: {
  week: { date: string; label: string }[];
  today: string;
  entries: Set<string>;
  onToggle: (date: string) => void;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: compact ? 3 : 5, gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
      {week.map(({ date, label }) => {
        const logged = entries.has(date);
        const isToday = date === today;

        return (
          <div key={date} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <button
              type="button"
              aria-pressed={logged}
              aria-label={`${date}: ${logged ? "logged" : "not logged"}`}
              onClick={() => onToggle(date)}
              style={dayButtonStyle(logged, isToday)}
            >
              {logged && <Check size={compact ? 9 : 11} strokeWidth={2.2} />}
            </button>
            <span
              className="block-sub"
              style={{
                color: isToday ? "var(--accent-cyan)" : "var(--text-muted)",
                fontFamily: "var(--font-display)",
                fontSize: compact ? "0.5rem" : "0.56rem",
                letterSpacing: "0.1em",
                lineHeight: 1,
                textAlign: "center",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  accent = false,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="block-label" style={{ marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ alignItems: "baseline", display: "flex", gap: 4, minWidth: 0 }}>
        <span className={`block-value${accent ? " accent" : ""}`} style={{ fontSize: "1.35rem", lineHeight: 1 }}>
          {value}
        </span>
        {suffix && (
          <span className="block-sub" style={{ lineHeight: 1 }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function GymWidget() {
  const { size, settings } = useWidget();
  const [entries, setEntries] = useState<Set<string>>(() => new Set());
  const today = todayStr();
  const weeklyGoal = clampGoal(settings.weeklyGoal);

  useEffect(() => {
    setEntries(loadEntries());
  }, []);

  const toggleDate = useCallback((date: string) => {
    setEntries((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      saveEntries(next);
      return next;
    });
  }, []);

  const week = useMemo(() => weekFrom(today), [today]);
  const weekCount = week.filter(({ date }) => entries.has(date)).length;
  const goalPercent = percent(weekCount, weeklyGoal);
  const streak = computeStreak(entries, today);
  const todayLogged = entries.has(today);

  if (size === "S") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", justifyContent: "space-between" }}>
        <div style={{ alignItems: "center", display: "flex", gap: 7, minWidth: 0 }}>
          <Flame
            size={15}
            strokeWidth={1.8}
            style={{ color: streak > 0 ? "var(--accent-orange)" : "var(--text-muted)", flexShrink: 0 }}
          />
          <span className="block-value accent" style={{ fontSize: "2.15rem", lineHeight: 1 }}>
            {streak}
          </span>
          <span className="block-sub" style={{ alignSelf: "flex-end", lineHeight: 1, paddingBottom: 3 }}>
            day{streak === 1 ? "" : "s"}
          </span>
        </div>
        <AttendanceButton date={today} label={todayLogged ? "logged" : "log today"} logged={todayLogged} onToggle={toggleDate} compact />
      </div>
    );
  }

  if (size === "M") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <WeekStrip week={week} today={today} entries={entries} onToggle={toggleDate} />

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto", alignItems: "end" }}>
          <Stat label="streak" value={streak} suffix="days" accent={streak > 0} />
          <Stat label="this week" value={weekCount} suffix={`/${weeklyGoal}`} />
          <AttendanceButton date={today} label={todayLogged ? "logged" : "log today"} logged={todayLogged} onToggle={toggleDate} compact />
        </div>
      </div>
    );
  }

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const grid = monthCells(year, month);
  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthCount = grid.filter((date) => date && entries.has(date)).length;
  const totalSessions = entries.size;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ alignItems: "center", display: "flex", gap: 10, justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div className="block-label" style={{ marginBottom: 3 }}>
            {monthName}
          </div>
          <div className="block-sub" style={{ alignItems: "center", display: "flex", gap: 5 }}>
            <Target size={12} strokeWidth={1.8} style={{ color: "var(--accent-cyan)", flexShrink: 0 }} />
            {goalPercent}% of weekly goal
          </div>
        </div>
        <AttendanceButton date={today} label={todayLogged ? "logged" : "log today"} logged={todayLogged} onToggle={toggleDate} compact />
      </div>

      <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {WEEK_LABELS.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="block-label"
            style={{
              display: "block",
              fontSize: "0.54rem",
              marginBottom: 0,
              overflow: "hidden",
              textAlign: "center",
            }}
          >
            {label}
          </div>
        ))}

        {grid.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} aria-hidden="true" />;
          }

          const logged = entries.has(date);
          const isToday = date === today;

          return (
            <button
              key={date}
              type="button"
              aria-pressed={logged}
              aria-label={`${date}: ${logged ? "logged" : "not logged"}`}
              onClick={() => toggleDate(date)}
              style={dayButtonStyle(logged, isToday)}
            >
              {parseLocalDate(date).getDate()}
            </button>
          );
        })}
      </div>

      <div style={{ borderTop: "1.5px solid var(--border)", display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))", paddingTop: 9 }}>
        <Stat label="streak" value={streak} suffix="days" accent={streak > 0} />
        <Stat label="week" value={weekCount} suffix={`/${weeklyGoal}`} />
        <Stat label="month" value={monthCount} />
        <Stat label="total" value={totalSessions} />
      </div>
    </div>
  );
}
