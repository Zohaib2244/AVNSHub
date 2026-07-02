"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

/* ── Schedule constants (minutes from midnight) ── */
const WORK_START = 540;     // 9:00
const LUNCH_START = 780;    // 13:00
const LUNCH_END = 840;      // 14:00
const WORK_END = 1080;      // 18:00
const BLOCK_MORNING = LUNCH_START - WORK_START;
const BLOCK_AFTERNOON = WORK_END - LUNCH_END;
const TOTAL_WORK = BLOCK_MORNING + BLOCK_AFTERNOON;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ── Helpers ── */
function nowMins(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}
function fmtTime(m: number) {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function fmtCountdown(m: number) {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function fmtDuration(m: number) {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (h === 0) return `${min}m`;
  return `${h}h${min > 0 ? `${min.toString().padStart(2, "0")}m` : ""}`;
}

type Phase = "morning" | "lunch" | "afternoon" | "off";

function getPhase(m: number): Phase {
  if (m < WORK_START || m >= WORK_END) return "off";
  if (m >= LUNCH_START && m < LUNCH_END) return "lunch";
  return m < LUNCH_START ? "morning" : "afternoon";
}

function phaseData(m: number) {
  const p = getPhase(m);
  if (p === "morning") return { label: "MORNING BLOCK", start: WORK_START, end: LUNCH_START };
  if (p === "lunch") return { label: "LUNCH", start: LUNCH_START, end: LUNCH_END };
  if (p === "afternoon") return { label: "AFTERNOON BLOCK", start: LUNCH_END, end: WORK_END };
  return { label: "OFF DUTY", start: WORK_START, end: WORK_END };
}

function workedMins(m: number) {
  if (m <= WORK_START) return 0;
  const morning = Math.min(Math.max(0, m - WORK_START), BLOCK_MORNING);
  if (m <= LUNCH_START) return morning;
  if (m < LUNCH_END) return BLOCK_MORNING;
  return BLOCK_MORNING + Math.min(Math.max(0, m - LUNCH_END), BLOCK_AFTERNOON);
}

function statusInfo(m: number) {
  const p = getPhase(m);
  if (p === "lunch") return { text: "LUNCH", color: "var(--accent-cyan)" };
  if (p === "off") {
    if (m < WORK_START) return { text: "BEFORE", color: "var(--text-muted)" };
    return { text: "DONE", color: "var(--status-up)" };
  }
  return { text: "ON", color: "var(--status-up)" };
}

function displayDayIndex(date: Date) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

/* ── Style consts ── */
const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
};
const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};
const dotStyle: CSSProperties = {
  fontFamily: "var(--font-dot-gothic), monospace",
};

/* ── Component ── */
export function OfficeTimeTrackerWidget() {
  const { size } = useWidget();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const m = nowMins(now);
  const phase = getPhase(m);
  const phaseInfo = phaseData(m);
  const worked = workedMins(m);
  const remaining = Math.max(0, TOTAL_WORK - worked);
  const progress = m < LUNCH_START
    ? (Math.max(0, m - WORK_START)) / BLOCK_MORNING
    : m >= LUNCH_END
      ? (BLOCK_MORNING + Math.max(0, m - LUNCH_END)) / TOTAL_WORK
      : BLOCK_MORNING / TOTAL_WORK;
  const pct = Math.min(100, Math.round(progress * 100));
  const countdownMins = phase === "morning" ? LUNCH_START - m
    : phase === "lunch" ? LUNCH_END - m
    : phase === "afternoon" ? WORK_END - m
    : 0;
  const status = statusInfo(m);
  const di = displayDayIndex(now);
  const phaseLabel = phaseInfo.label;

  /* ── Layouts ── */

  if (size === "S") {
    return (
      <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 4, height: "100%", justifyContent: "center", padding: "0 8px" }}>
        <span style={{ ...dotStyle, color: "var(--accent-orange)", fontSize: "0.7rem", letterSpacing: "0.08em" }}>
          {phaseLabel}
        </span>
        {phase !== "off" && countdownMins > 0 ? (
          <>
            <span className="block-value" style={{ ...monoStyle, fontSize: "2rem", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {fmtCountdown(countdownMins)}
            </span>
            <span style={{ ...dotStyle, color: "var(--text-muted)", fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {phase === "morning" ? "until lunch" : phase === "afternoon" ? "until done" : "remaining"}
            </span>
          </>
        ) : (
          <span style={{ ...dotStyle, color: "var(--accent-cyan)", fontSize: "1rem" }}>
            {status.text}
          </span>
        )}
      </div>
    );
  }

  /* ── Shared section helpers ── */

  const sectionBorder: CSSProperties = {
    borderTop: "1.5px solid var(--border)",
  };
  const progressFillStyle: CSSProperties = {
    height: "100%",
    width: `${pct}%`,
    borderRadius: "6px 0 0 6px",
    transition: "width 0.4s ease",
    background: "var(--accent-orange)",
    backgroundImage: `repeating-linear-gradient(135deg, transparent 0, transparent 10px, rgba(0,0,0,0.12) 10px, rgba(0,0,0,0.12) 20px)`,
  };
  const dayBlockBase: CSSProperties = {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: "var(--bg-nested)",
    border: "1px solid var(--border)",
  };
  const dayBlockFilled: CSSProperties = {
    ...dayBlockBase,
    background: "var(--accent-orange)",
    borderColor: "var(--accent-orange)",
  };
  const dayBlockNow: CSSProperties = {
    ...dayBlockBase,
    background: "var(--accent-cyan)",
    borderColor: "var(--accent-cyan)",
    animation: "ott-pulse-glow 1.8s ease-in-out infinite",
  };

  /* ── Standard (M) / Rich (L) ── */

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      <style>{`
        @keyframes ott-pulse-glow {
          0%, 100% { box-shadow: 0 0 6px var(--accent-cyan); }
          50% { box-shadow: 0 0 14px var(--accent-cyan); }
        }
      `}</style>

      {/* Phase hero */}
      <div style={{ padding: `${size === "L" ? "10px 18px 0" : "8px 16px 0"}`, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{
          fontFamily: "var(--font-dot-gothic), monospace",
          fontSize: size === "L" ? "1.8rem" : "1.6rem",
          letterSpacing: "0.06em",
          color: "var(--accent-orange)",
          lineHeight: 1.1,
        }}>
          {phaseLabel}
        </span>
        <span style={{
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
        }}>
          {fmtTime(phaseInfo.start)} &ndash; {fmtTime(phaseInfo.end)}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ padding: `${size === "L" ? "16px 18px 10px" : "14px 16px 8px"}` }}>
        <div style={{
          position: "relative",
          width: "100%",
          height: size === "L" ? 36 : 32,
          background: "var(--bg-nested)",
          borderRadius: 8,
          border: "1.5px solid var(--border)",
          overflow: "hidden",
        }}>
          <div style={progressFillStyle} />
        </div>
      </div>

      {/* Progress labels */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontFamily: "var(--font-dot-gothic), monospace",
        fontSize: "0.55rem",
        letterSpacing: "0.1em",
        color: "var(--text-muted-dim)",
        padding: `0 ${size === "L" ? "18px" : "16px"}`,
      }}>
        <span>{fmtTime(phaseInfo.start)}</span>
        <span>{fmtTime(m)} &middot; {fmtDuration(Math.min(phase !== "off" ? m - phaseInfo.start : 0, phaseInfo.end - phaseInfo.start))} worked</span>
        <span>{fmtTime(phaseInfo.end)}</span>
      </div>

      {/* Countdown */}
      <div style={{ padding: `${size === "L" ? "10px 18px 18px" : "8px 16px 16px"}`, display: "flex", alignItems: "baseline", gap: 10 }}>
        {phase !== "off" && countdownMins > 0 ? (
          <>
            <span className="block-value" style={{
              ...monoStyle,
              fontSize: size === "L" ? "3rem" : "2.6rem",
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}>
              {fmtCountdown(countdownMins)}
            </span>
            <span style={{
              ...dotStyle,
              fontSize: "0.62rem",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}>
              until {phase === "morning" ? "lunch break" : phase === "lunch" ? "afternoon block" : "quitting time"}
            </span>
          </>
        ) : (
          <span style={{
            ...monoStyle,
            fontSize: size === "L" ? "1.4rem" : "1.2rem",
            color: status.color,
            fontWeight: 500,
          }}>
            {status.text}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", ...sectionBorder }}>
        {[
          { value: fmtDuration(worked), label: "worked today" },
          { value: fmtDuration(remaining), label: "remaining" },
          { value: status.text, label: "schedule", valueColor: status.color },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1,
            padding: `${size === "L" ? "12px 18px" : "10px 16px"}`,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            borderLeft: i > 0 ? "1.5px solid var(--border)" : "none",
          }}>
            <span className="block-value" style={{
              ...monoStyle,
              fontSize: size === "L" ? "1.1rem" : "1rem",
              fontWeight: 500,
              color: s.valueColor ?? "var(--text-primary)",
            }}>
              {s.value}
            </span>
            <span style={{
              ...dotStyle,
              fontSize: "0.5rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-muted-dim)",
            }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Day schedule (week view) */}
      <div style={{
        padding: `${size === "L" ? "12px 18px 16px" : "10px 16px 14px"}`,
        display: "flex",
        gap: 4,
        flexDirection: "column",
      }}>
        <div style={{ display: "flex", gap: 4 }}>
          {WEEKDAYS.map((_, i) => (
            <span
              key={i}
              style={
                i < di ? dayBlockFilled
                : i === di ? dayBlockNow
                : dayBlockBase
              }
            />
          ))}
        </div>
        {size === "L" && (
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {WEEKDAYS.map((day, i) => (
              <span key={day} style={{
                flex: 1,
                textAlign: "center",
                fontFamily: "var(--font-dot-gothic), monospace",
                fontSize: "0.45rem",
                letterSpacing: "0.06em",
                color: i === di ? "var(--accent-cyan)" : "var(--text-muted-dim)",
              }}>
                {day}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
