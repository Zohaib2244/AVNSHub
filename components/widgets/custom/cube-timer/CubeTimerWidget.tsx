"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

const FACES = ["U", "D", "L", "R", "F", "B"] as const;
const MODS = ["", "'", "2"] as const;
const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

type Phase = "idle" | "ready" | "running" | "stopped";

const PHASE_HINT: Record<Phase, string> = {
  idle: "hold space / tap to start",
  ready: "release!",
  running: "space / tap to stop",
  stopped: "hold space / tap for next",
};

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const dotStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.55rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};
const chipPanelStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 52,
  padding: "5px 10px",
};

function generateScramble(length: number): string {
  const moves: string[] = [];
  let prev = "";
  let prevPrev = "";

  for (let i = 0; i < length; i++) {
    let face = "";
    let tries = 0;

    do {
      face = FACES[Math.floor(Math.random() * FACES.length)];
      tries++;
    } while (
      tries < 100 &&
      (face === prev ||
        (prev !== "" &&
          prevPrev !== "" &&
          AXIS[face] === AXIS[prev] &&
          AXIS[prev] === AXIS[prevPrev]))
    );

    prevPrev = prev;
    prev = face;
    moves.push(face + MODS[Math.floor(Math.random() * MODS.length)]);
  }

  return moves.join(" ");
}

function fmtTime(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const cents = Math.floor((ms % 1000) / 10);

  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}.${cents.toString().padStart(2, "0")}`;
  }

  return `${secs}.${cents.toString().padStart(2, "0")}`;
}

function calcAverage(times: number[], n: number): string {
  if (times.length < n) return "--";

  const slice = times.slice(0, n);
  if (n >= 5) {
    const sorted = [...slice].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    return fmtTime(trimmed.reduce((total, time) => total + time, 0) / trimmed.length);
  }

  return fmtTime(slice.reduce((total, time) => total + time, 0) / slice.length);
}

function timerColor(phase: Phase): string {
  if (phase === "ready") return "var(--accent-cyan)";
  if (phase === "running") return "var(--accent-orange)";
  return "var(--text-primary)";
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={chipPanelStyle}>
      <span style={dotStyle}>{label}</span>
      <span
        style={{
          ...monoStyle,
          color: "var(--text-primary)",
          fontSize: "0.78rem",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ScrambleBar({ scramble }: { scramble: string }) {
  return (
    <div
      style={{
        ...monoStyle,
        borderBottom: "1px solid var(--border)",
        color: "var(--text-muted)",
        fontSize: "0.65rem",
        lineHeight: 1.55,
        paddingBottom: 7,
        wordBreak: "break-word",
      }}
    >
      {scramble}
    </div>
  );
}

export function CubeTimerWidget() {
  const { size, settings, isFocused } = useWidget();
  const showScramble = settings.showScramble !== false;
  const showStats = settings.showStats !== false;
  const configuredLength =
    typeof settings.scrambleLength === "number" ? settings.scrambleLength : 20;
  const scrambleLength = Math.max(10, Math.min(30, configuredLength));

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [solves, setSolves] = useState<number[]>([]);
  const [scramble, setScramble] = useState(() => generateScramble(scrambleLength));

  const startRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    startRef.current = Date.now();
    setElapsed(0);
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 30);
    setPhase("running");
  }, [clearTimer]);

  const stopTimer = useCallback(() => {
    clearTimer();
    const time = Date.now() - startRef.current;
    setElapsed(time);
    setSolves((prev) => [time, ...prev]);
    setScramble(generateScramble(scrambleLength));
    setPhase("stopped");
  }, [clearTimer, scrambleLength]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (!isFocused) return;
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();

      if (phaseRef.current === "running") {
        stopTimer();
        return;
      }

      if (phaseRef.current === "idle" || phaseRef.current === "stopped") {
        setPhase("ready");
      }
    };

    const onUp = (event: KeyboardEvent) => {
      if (!isFocused) return;
      if (event.code !== "Space") return;
      event.preventDefault();

      if (phaseRef.current === "ready") {
        startTimer();
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);

    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [startTimer, stopTimer, isFocused]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleTap = useCallback(() => {
    if (phase === "running") {
      stopTimer();
      return;
    }

    if (phase === "idle" || phase === "ready" || phase === "stopped") {
      startTimer();
    }
  }, [phase, startTimer, stopTimer]);

  const best = solves.length ? fmtTime(Math.min(...solves)) : "--";
  const ao5 = calcAverage(solves, 5);
  const ao12 = calcAverage(solves, 12);
  const color = timerColor(phase);
  const hint = PHASE_HINT[phase];

  if (size === "S") {
    return (
      <div
        onClick={handleTap}
        style={{
          alignItems: "center",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          height: "100%",
          justifyContent: "center",
          userSelect: "none",
        }}
      >
        <div
          className="block-value"
          style={{
            ...monoStyle,
            color,
            fontSize: "1.8rem",
            fontWeight: 500,
            lineHeight: 1,
            transition: "color 0.15s",
          }}
        >
          {fmtTime(elapsed)}
        </div>
        <div className="block-sub" style={{ fontSize: "0.58rem", textAlign: "center" }}>
          {phase === "stopped" ? `best ${best}` : hint}
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", userSelect: "none" }}>
        {showScramble && <ScrambleBar scramble={scramble} />}
        <div
          onClick={handleTap}
          style={{
            alignItems: "center",
            cursor: "pointer",
            display: "flex",
            flex: 1,
            flexDirection: "column",
            gap: 5,
            justifyContent: "center",
          }}
        >
          <div
            className="block-value"
            style={{
              ...monoStyle,
              color,
              fontSize: "2.4rem",
              fontWeight: 500,
              lineHeight: 1,
              transition: "color 0.15s",
            }}
          >
            {fmtTime(elapsed)}
          </div>
          <div className="block-sub" style={{ fontSize: "0.6rem" }}>
            {hint}
          </div>
        </div>
        {showStats && solves.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            <StatChip label="best" value={best} />
            <StatChip label="ao5" value={ao5} />
            <StatChip label="ao12" value={ao12} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", userSelect: "none" }}>
      {showScramble && (
        <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
          <div style={{ ...dotStyle, marginBottom: 3 }}>scramble</div>
          <div style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.72rem", lineHeight: 1.6 }}>
            {scramble}
          </div>
        </div>
      )}

      <div
        onClick={handleTap}
        style={{
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          justifyContent: "center",
          padding: "14px 0",
        }}
      >
        <div
          className="block-value"
          style={{
            ...monoStyle,
            color,
            fontSize: "3.2rem",
            fontWeight: 500,
            lineHeight: 1,
            transition: "color 0.15s",
          }}
        >
          {fmtTime(elapsed)}
        </div>
        <div className="block-sub" style={{ fontSize: "0.6rem" }}>
          {hint}
        </div>
      </div>

      {showStats && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          <StatChip label="best" value={best} />
          <StatChip label="ao5" value={ao5} />
          <StatChip label="ao12" value={ao12} />
          <StatChip label="solves" value={String(solves.length)} />
        </div>
      )}

      {solves.length > 0 && (
        <div className="size-l-more" style={{ flex: 1, minHeight: 0 }}>
          <div className="more-head">history</div>
          {solves.slice(0, 20).map((time, index) => {
            const isBest = time === Math.min(...solves);

            return (
              <div
                key={`${time}-${index}`}
                className="more-row"
                style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}
              >
                <span className="more-meta">#{index + 1}</span>
                <span
                  style={{
                    ...monoStyle,
                    color: isBest ? "var(--accent-orange)" : "var(--text-primary)",
                    fontSize: "0.75rem",
                  }}
                >
                  {fmtTime(time)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
