"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
};

const dotGothicStyle: CSSProperties = {
  fontFamily: "var(--font-dot-gothic), monospace",
};

const iconStyle: CSSProperties = {
  width: 12,
  height: 12,
  stroke: "currentColor",
  fill: "none",
  strokeWidth: 1.75,
  flex: "none",
};

const CIRCUMFERENCE = Math.PI * 80;

interface TimerState {
  phase: "focus" | "break";
  timeLeft: number;
  running: boolean;
  sessions: number;
  focusTotal: number;
  breaks: number;
}

interface SessionEntry {
  id: number;
  type: "focus" | "break";
  durationMin: number;
  task: string;
}

export function PomodoroTimerWidget() {
  const { size, settings } = useWidget();

  const focusDurationSec =
    (typeof settings.focusDuration === "number" ? settings.focusDuration : 25) * 60;
  const breakDurationSec =
    (typeof settings.breakDuration === "number" ? settings.breakDuration : 5) * 60;
  const longBreakSec = 15 * 60;

  const [timer, setTimer] = useState<TimerState>({
    phase: "focus",
    timeLeft: focusDurationSec,
    running: false,
    sessions: 0,
    focusTotal: 0,
    breaks: 0,
  });

  const [sessionLog, setSessionLog] = useState<SessionEntry[]>([]);
  const [distractions, setDistractions] = useState(0);
  const [taskName, setTaskName] = useState("");

  const taskNameRef = useRef(taskName);
  taskNameRef.current = taskName;

  const nextIdRef = useRef(0);

  const totalTime =
    timer.phase === "focus"
      ? focusDurationSec
      : timer.sessions > 0 && timer.sessions % 4 === 0
        ? longBreakSec
        : breakDurationSec;

  const progress = timer.timeLeft / totalTime;
  const dashOffset = CIRCUMFERENCE * progress;

  const displayTime = `${String(Math.floor(timer.timeLeft / 60)).padStart(2, "0")}:${String(timer.timeLeft % 60).padStart(2, "0")}`;

  const focusMin =
    typeof settings.focusDuration === "number" ? settings.focusDuration : 25;

  useEffect(() => {
    if (!timer.running) return;

    const id = setInterval(() => {
      setTimer((prev) => {
        if (!prev.running) return prev;
        if (prev.timeLeft <= 1) {
          if (prev.phase === "focus") {
            const newSessions = prev.sessions + 1;
            const isLongBreak = newSessions % 4 === 0;
            setSessionLog((log) => [
              ...log,
              {
                id: nextIdRef.current++,
                type: "focus",
                durationMin: Math.round(focusDurationSec / 60),
                task: taskNameRef.current,
              },
            ]);
            return {
              ...prev,
              phase: "break",
              timeLeft: isLongBreak ? longBreakSec : breakDurationSec,
              running: false,
              sessions: newSessions,
              focusTotal: prev.focusTotal + Math.round(focusDurationSec / 60),
              breaks: prev.breaks + 1,
            };
          }
          return {
            ...prev,
            phase: "focus",
            timeLeft: focusDurationSec,
            running: false,
          };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(id);
  }, [timer.running, focusDurationSec, breakDurationSec, longBreakSec]);

  useEffect(() => {
    if (!timer.running) {
      setTimer((prev) => ({ ...prev, timeLeft: focusDurationSec }));
    }
  }, [focusDurationSec, timer.running]);

  const handleStart = useCallback(() => {
    setTimer((prev) => ({ ...prev, running: true }));
  }, []);

  const handlePause = useCallback(() => {
    setTimer((prev) => ({ ...prev, running: false }));
  }, []);

  const handleReset = useCallback(() => {
    setTimer((prev) => ({
      ...prev,
      phase: "focus",
      timeLeft: focusDurationSec,
      running: false,
    }));
  }, [focusDurationSec]);

  const btnBase: CSSProperties = {
    background: "var(--bg-nested)",
    border: "1.5px solid var(--border)",
    borderRadius: 10,
    boxShadow: "2px 2px 0 var(--shadow)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontFamily: "var(--font-jetbrains-mono), monospace",
    fontSize: "0.72rem",
    padding: "6px 16px",
    display: "flex",
    alignItems: "center",
    gap: 5,
  };

  const btnPrimary: CSSProperties = {
    ...btnBase,
    background: "var(--accent-orange)",
    color: "var(--badge-text)",
    borderColor: "var(--accent-orange)",
  };

  const phaseBadge = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: "var(--bg-nested)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        padding: "3px 10px 3px 8px",
        ...labelStyle,
        color: "var(--text-muted)",
        marginLeft: "auto",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background:
            timer.phase === "focus" ? "var(--accent-orange)" : "var(--accent-cyan)",
          flex: "none",
        }}
      />
      {timer.phase === "focus" ? "FOCUS" : "BREAK"}
    </span>
  );

  const progressRing = (
    <div
      style={{
        width: 180,
        height: 90,
        position: "relative",
        marginBottom: 8,
        overflow: "visible",
        flex: "none",
      }}
    >
      <svg viewBox="0 0 180 90" style={{ width: 180, height: 90 }}>
        <path
          d="M 10 90 A 80 80 0 0 1 170 90"
          fill="none"
          stroke="var(--bg-nested)"
          strokeWidth={4}
        />
        <path
          d="M 10 90 A 80 80 0 0 1 170 90"
          fill="none"
          stroke={
            timer.phase === "focus" ? "var(--accent-orange)" : "var(--accent-cyan)"
          }
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
    </div>
  );

  const controlsRow = (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button type="button" onClick={handleStart} style={btnPrimary}>
        <svg style={iconStyle} viewBox="0 0 24 24">
          <polygon points="8,5 19,12 8,19" />
        </svg>
        start
      </button>
      <button type="button" onClick={handlePause} style={btnBase}>
        <svg style={iconStyle} viewBox="0 0 24 24">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
        pause
      </button>
      <button type="button" onClick={handleReset} style={btnBase}>
        <svg style={iconStyle} viewBox="0 0 24 24">
          <polyline points="1,4 1,10 7,10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
        reset
      </button>
    </div>
  );

  const sessionDotsRow = (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 6 }}>
      {Array.from({ length: 6 }, (_, i) => {
        const mod = timer.sessions % 6;
        let bg = "var(--border)";
        if (i < mod) {
          bg =
            timer.phase === "focus" ? "var(--accent-orange)" : "var(--accent-cyan)";
        } else if (i === mod) {
          bg = "var(--text-muted)";
        }
        return (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: bg,
              transition: "background 0.2s",
            }}
          />
        );
      })}
    </div>
  );

  const timerSection = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 12px 16px",
      }}
    >
      {progressRing}
      <div
        style={{
          ...dotGothicStyle,
          fontSize: "3.5rem",
          lineHeight: 1,
          letterSpacing: "0.04em",
          color: timer.running
            ? timer.phase === "focus"
              ? "var(--accent-orange)"
              : "var(--accent-cyan)"
            : "var(--text-primary)",
          marginBottom: 16,
        }}
      >
        {displayTime}
      </div>
      {controlsRow}
      {sessionDotsRow}
    </div>
  );

  const statsBar = (
    <div
      style={{
        display: "flex",
        borderTop: "1px solid var(--border)",
        padding: "10px 12px",
        gap: 16,
        background: "var(--bg-nested)",
      }}
    >
      {[
        { num: String(timer.sessions), label: "sessions" },
        {
          num: `${Math.floor(timer.focusTotal / 60)}h ${timer.focusTotal % 60}m`,
          label: "focus time",
        },
        { num: String(timer.breaks), label: "breaks" },
      ].map((s) => (
        <div
          key={s.label}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            flex: 1,
            gap: 2,
          }}
        >
          <span
            style={{
              ...dotGothicStyle,
              fontSize: "1.1rem",
              color: "var(--text-primary)",
            }}
          >
            {s.num}
          </span>
          <span
            style={{
              ...labelStyle,
              fontSize: "0.55rem",
              letterSpacing: "0.12em",
              color: "var(--text-muted-dim)",
            }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );

  const miniRingRadius = 50;
  const miniCirc = Math.PI * miniRingRadius;
  const miniDashOffset = miniCirc * (timer.timeLeft / totalTime);
  const miniRing = (
    <div style={{ width: 120, height: 60, position: "relative", flex: "none" }}>
      <svg viewBox="0 0 120 60" style={{ width: 120, height: 60 }}>
        <path
          d={`M 10 60 A ${miniRingRadius} ${miniRingRadius} 0 0 1 110 60`}
          fill="none"
          stroke="var(--bg-nested)"
          strokeWidth={3}
        />
        <path
          d={`M 10 60 A ${miniRingRadius} ${miniRingRadius} 0 0 1 110 60`}
          fill="none"
          stroke={
            timer.phase === "focus" ? "var(--accent-orange)" : "var(--accent-cyan)"
          }
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={miniCirc}
          strokeDashoffset={miniDashOffset}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
    </div>
  );

  if (size === "S") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px 12px",
        }}
      >
        {miniRing}
        <div
          style={{
            ...dotGothicStyle,
            fontSize: "2.2rem",
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: timer.running
              ? timer.phase === "focus"
                ? "var(--accent-orange)"
                : "var(--accent-cyan)"
              : "var(--text-primary)",
          }}
        >
          {Math.ceil(timer.timeLeft / 60)}m
        </div>
        {phaseBadge}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={timer.running ? handlePause : handleStart}
            style={timer.running ? btnBase : btnPrimary}
          >
            <svg style={iconStyle} viewBox="0 0 24 24">
              {timer.running ? (
                <>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </>
              ) : (
                <polygon points="8,5 19,12 8,19" />
              )}
            </svg>
            {timer.running ? "pause" : "start"}
          </button>
          <button type="button" onClick={handleReset} style={btnBase}>
            <svg style={iconStyle} viewBox="0 0 24 24">
              <polyline points="1,4 1,10 7,10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  const mView = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 12px 0",
          flex: "none",
        }}
      >
        {phaseBadge}
      </div>
      {timerSection}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "0 12px 10px",
        }}
      >
        <span style={{ ...labelStyle, fontSize: "0.55rem", color: "var(--text-muted-dim)" }}>
          focus
        </span>
        <span style={{ ...monoStyle, fontSize: "0.75rem", color: "var(--text-primary)" }}>
          {focusMin}m
        </span>
      </div>
      {statsBar}
    </div>
  );

  const lView = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 12px 0",
          flex: "none",
        }}
      >
        {phaseBadge}
      </div>
      {timerSection}

      <div
        style={{
          padding: "0 12px 8px",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
          placeholder="current task..."
          style={{
            flex: 1,
            background: "var(--bg-nested)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: "0.7rem",
            padding: "4px 8px",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => setDistractions((d) => d + 1)}
          style={{
            ...btnBase,
            fontSize: "0.65rem",
            padding: "4px 8px",
            whiteSpace: "nowrap",
          }}
        >
          +1 distract
        </button>
      </div>

      <div
        style={{
          padding: "0 12px 4px",
          display: "flex",
          gap: 12,
        }}
      >
        <span
          style={{
            ...labelStyle,
            fontSize: "0.55rem",
            color: "var(--text-muted-dim)",
          }}
        >
          distractions: {distractions}
        </span>
        <span
          style={{
            ...labelStyle,
            fontSize: "0.55rem",
            color: "var(--text-muted-dim)",
          }}
        >
          breaks taken: {timer.breaks}
        </span>
      </div>

      {sessionLog.length > 0 && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            padding: "6px 12px",
            maxHeight: 80,
            overflowY: "auto",
          }}
        >
          {sessionLog
            .slice(-6)
            .reverse()
            .map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  ...monoStyle,
                  fontSize: "0.65rem",
                  color: "var(--text-muted)",
                  padding: "2px 0",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flex: "none",
                    background:
                      e.type === "focus"
                        ? "var(--accent-orange)"
                        : "var(--accent-cyan)",
                  }}
                />
                <span>
                  {e.type === "focus" ? "F" : "B"} {e.durationMin}m
                </span>
                {e.task && (
                  <span style={{ color: "var(--text-primary)" }}>{e.task}</span>
                )}
              </div>
            ))}
        </div>
      )}

      {statsBar}
    </div>
  );

  if (size === "M") return mView;
  return lView;
}
