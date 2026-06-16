"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Play, StopCircle, RotateCcw, Trophy, Trash2 } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";

const STORAGE_KEY = "nutmag-cube-solves";

type Solve = {
  id: string;
  time: number; // milliseconds
  date: string;
};

function loadSolves(): Solve[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (solve): solve is Solve =>
        typeof solve === "object" &&
        solve !== null &&
        typeof solve.id === "string" &&
        typeof solve.time === "number" &&
        Number.isFinite(solve.time) &&
        typeof solve.date === "string",
    );
  } catch {
    return [];
  }
}

function saveSolves(solves: Solve[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(solves));
}

function formatTime(ms: number): string {
  const cs = Math.floor((ms % 1000) / 10);
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) {
    return `${min}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }
  return `${sec}.${String(cs).padStart(2, "0")}`;
}

function computeBest(solves: Solve[]): number | null {
  if (!solves.length) return null;
  return Math.min(...solves.map((s) => s.time));
}

function computeAo(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null;
  const recent = [...solves.slice(-n).map((s) => s.time)].sort((a, b) => a - b);
  // WCA: remove best and worst, average the rest
  const trimmed = recent.slice(1, -1);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

function btnStyle(variant: "primary" | "ghost", compact = false): CSSProperties {
  const isPrimary = variant === "primary";
  return {
    alignItems: "center",
    background: isPrimary ? "var(--accent-orange)" : "var(--bg-nested)",
    border: `1.5px solid ${isPrimary ? "var(--accent-orange)" : "var(--border)"}`,
    borderRadius: 12,
    boxShadow: isPrimary ? "2px 2px 0 var(--shadow)" : "none",
    color: isPrimary ? "var(--bg-card)" : "var(--text-primary)",
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "var(--font-display)",
    fontSize: compact ? "0.56rem" : "0.62rem",
    gap: 5,
    justifyContent: "center",
    letterSpacing: 0,
    lineHeight: 1,
    minHeight: compact ? 24 : 30,
    padding: compact ? "5px 8px" : "7px 12px",
    textTransform: "uppercase" as const,
    whiteSpace: "nowrap" as const,
  };
}

function StatBox({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="block-label" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "0.88rem",
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {value ?? "n/a"}
      </div>
    </div>
  );
}

function TimerDisplay({
  color,
  displayTime,
  fontSize,
}: {
  color: string;
  displayTime: number;
  fontSize: string;
}) {
  return (
    <div
      className="block-value"
      style={{
        color,
        fontFamily: "var(--font-mono)",
        fontSize,
        fontVariantNumeric: "tabular-nums",
        fontWeight: 500,
        letterSpacing: 0,
        lineHeight: 1,
        transition: "color 0.2s",
      }}
    >
      {formatTime(displayTime)}
    </div>
  );
}

function Controls({
  compact = false,
  running,
  onReset,
  onStart,
  onStop,
}: {
  compact?: boolean;
  running: boolean;
  onReset: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
      {!running ? (
        <button type="button" aria-label="start cube solve timer" onClick={onStart} style={btnStyle("primary", compact)}>
          <Play size={compact ? 10 : 12} strokeWidth={2} />
          start
        </button>
      ) : (
        <button type="button" aria-label="stop and save cube solve time" onClick={onStop} style={btnStyle("primary", compact)}>
          <StopCircle size={compact ? 10 : 12} strokeWidth={2} />
          stop
        </button>
      )}
      {running && (
        <button type="button" aria-label="reset cube solve timer" title="reset" onClick={onReset} style={btnStyle("ghost", compact)}>
          <RotateCcw size={compact ? 10 : 12} strokeWidth={2} />
          {compact ? "" : "reset"}
        </button>
      )}
    </div>
  );
}

export function CubeWidget() {
  const { size } = useWidget();
  const [solves, setSolves] = useState<Solve[]>(() => loadSolves());
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [lastRecorded, setLastRecorded] = useState<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;

    let frame = 0;

    const tick = (now: number) => {
      if (startRef.current === null) return;
      setElapsed(now - startRef.current);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [running]);

  const startTimer = useCallback(() => {
    if (running) return;
    setLastRecorded(null);
    startRef.current = performance.now();
    setElapsed(0);
    setRunning(true);
  }, [running]);

  const stopTimer = useCallback(() => {
    const finalTime = startRef.current !== null ? performance.now() - startRef.current : 0;
    startRef.current = null;
    setRunning(false);
    setElapsed(0);

    if (finalTime > 200) {
      setLastRecorded(finalTime);
      const solve: Solve = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: finalTime,
        date: new Date().toISOString(),
      };
      setSolves((prev) => {
        const next = [...prev, solve];
        saveSolves(next);
        return next;
      });
    } else {
      setLastRecorded(null);
    }
  }, []);

  const resetTimer = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    setLastRecorded(null);
    startRef.current = null;
  }, []);

  const deleteSolve = useCallback((id: string) => {
    setSolves((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSolves(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSolves([]);
    saveSolves([]);
    setLastRecorded(null);
  }, []);

  const bestTime = computeBest(solves);
  const ao5 = computeAo(solves, 5);
  const ao12 = computeAo(solves, 12);
  const displayTime = running ? elapsed : (lastRecorded ?? 0);

  const timerColor = running
    ? "var(--accent-orange)"
    : lastRecorded !== null
      ? "var(--accent-cyan)"
      : "var(--text-muted)";

  if (size === "S") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", justifyContent: "space-between" }}>
        <TimerDisplay color={timerColor} displayTime={displayTime} fontSize="clamp(1.35rem, 30cqw, 2rem)" />
        <div style={{ alignItems: "center", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Controls compact running={running} onReset={resetTimer} onStart={startTimer} onStop={stopTimer} />
          {bestTime !== null && (
            <span
              className="block-sub"
              style={{ color: "var(--text-muted)", fontSize: "0.58rem", lineHeight: 1 }}
            >
              best {formatTime(bestTime)}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (size === "M") {
    const last5 = solves.slice(-5).reverse();
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 10, justifyContent: "space-between" }}>
          <TimerDisplay color={timerColor} displayTime={displayTime} fontSize="clamp(1.55rem, 20cqw, 2.2rem)" />
          <Controls compact running={running} onReset={resetTimer} onStart={startTimer} onStop={stopTimer} />
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <StatBox label="best" value={bestTime !== null ? formatTime(bestTime) : null} />
          <StatBox label="ao5" value={ao5 !== null ? formatTime(ao5) : null} />
          <StatBox label="solves" value={String(solves.length)} />
        </div>

        {last5.length > 0 && (
          <div style={{ borderTop: "1.5px solid var(--border)", paddingTop: 8 }}>
            {last5.map((solve, i) => {
              const num = solves.length - i;
              const isBest = solve.time === bestTime;
              return (
                <div
                  key={solve.id}
                  style={{
                    alignItems: "center",
                    display: "flex",
                    gap: 6,
                    justifyContent: "space-between",
                    padding: "2px 0",
                  }}
                >
                  <span
                    className="block-sub"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.58rem", minWidth: 24 }}
                  >
                    #{num}
                  </span>
                  <span
                    style={{
                      alignItems: "center",
                      color: isBest ? "var(--accent-cyan)" : "var(--text-primary)",
                      display: "flex",
                      flex: 1,
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.85rem",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 500,
                      gap: 4,
                      justifyContent: "flex-end",
                      lineHeight: 1,
                    }}
                  >
                    {isBest && <Trophy size={10} strokeWidth={1.8} />}
                    {formatTime(solve.time)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // L size
  const recentSolves = [...solves].reverse();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ alignItems: "center", display: "flex", gap: 10, justifyContent: "space-between" }}>
        <TimerDisplay color={timerColor} displayTime={displayTime} fontSize="clamp(1.8rem, 12cqw, 2.6rem)" />
        <Controls running={running} onReset={resetTimer} onStart={startTimer} onStop={stopTimer} />
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <StatBox label="best" value={bestTime !== null ? formatTime(bestTime) : null} />
        <StatBox label="ao5" value={ao5 !== null ? formatTime(ao5) : null} />
        <StatBox label="ao12" value={ao12 !== null ? formatTime(ao12) : null} />
        <StatBox label="solves" value={String(solves.length)} />
      </div>

      <div style={{ borderTop: "1.5px solid var(--border)", display: "flex", flex: 1, flexDirection: "column", minHeight: 0, paddingTop: 8 }}>
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="block-label">history</span>
          {solves.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              style={{ ...btnStyle("ghost", true), color: "var(--text-muted)", fontSize: "0.52rem" }}
            >
              <Trash2 size={9} strokeWidth={2} />
              clear all
            </button>
          )}
        </div>

        {recentSolves.length === 0 ? (
          <div
            className="block-sub"
            style={{ color: "var(--text-muted)", paddingTop: 4, textAlign: "center" }}
          >
            no solves yet - hit start to begin
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
            {recentSolves.map((solve, i) => {
              const num = solves.length - i;
              const isBest = solve.time === bestTime;
              return (
                <div
                  key={solve.id}
                  style={{
                    alignItems: "center",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    gap: 6,
                    padding: "4px 0",
                  }}
                >
                  <span
                    className="block-sub"
                    style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.6rem", minWidth: 30 }}
                  >
                    #{num}
                  </span>
                  <span
                    style={{
                      alignItems: "center",
                      color: isBest ? "var(--accent-cyan)" : "var(--text-primary)",
                      display: "flex",
                      flex: 1,
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.9rem",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 500,
                      gap: 5,
                      lineHeight: 1,
                    }}
                  >
                    {isBest && <Trophy size={11} strokeWidth={1.8} />}
                    {formatTime(solve.time)}
                  </span>
                  <span
                    className="block-sub"
                    style={{ color: "var(--text-muted)", fontSize: "0.58rem", textAlign: "right" }}
                  >
                    {new Date(solve.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button
                    type="button"
                    aria-label={`delete solve #${num}`}
                    onClick={() => deleteSolve(solve.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      opacity: 0.5,
                      padding: "2px 4px",
                    }}
                  >
                    <Trash2 size={11} strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
