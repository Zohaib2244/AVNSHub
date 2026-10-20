"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { AlertTriangle, Circle, Coffee, LogIn, LogOut, Moon } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { useCanvasSyncedState } from "@/lib/canvasStore";

type ShiftState = {
  clockInAt: number | null;
  clockInDate: string | null;
};

type Phase = "weekend" | "idle" | "working" | "break" | "overtime";

const SHIFT_MS = 9 * 60 * 60 * 1000;
const OT_LANE_MS = 60 * 60 * 1000;
const DOMAIN_MS = SHIFT_MS + OT_LANE_MS;
const TICK_MS = 30000;

/** retro HP-bar style meter: 30-minute pips, 18 for the shift + 2 for the OT lane */
const PIP_MS = 30 * 60 * 1000;
const SHIFT_PIPS = SHIFT_MS / PIP_MS;
const OT_PIPS = OT_LANE_MS / PIP_MS;
const TOTAL_PIPS = SHIFT_PIPS + OT_PIPS;

function buildDefaultShiftState(): ShiftState {
  return { clockInAt: null, clockInDate: null };
}

function sanitizeShiftState(raw: unknown): ShiftState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (value.clockInAt === null && value.clockInDate === null) {
    return { clockInAt: null, clockInDate: null };
  }
  if (typeof value.clockInAt === "number" && typeof value.clockInDate === "string") {
    return { clockInAt: value.clockInAt, clockInDate: value.clockInDate };
  }
  return null;
}

function dateKey(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isFriday(date: Date): boolean {
  return date.getDay() === 5;
}

function breakWindow(date: Date): { start: number; end: number } {
  const start = new Date(date);
  start.setHours(13, 0, 0, 0);
  const end = new Date(date);
  end.setHours(14, isFriday(date) ? 15 : 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}

function breakLabel(date: Date): string {
  return isFriday(date) ? "1:00 PM - 2:15 PM" : "1:00 PM - 2:00 PM";
}

function formatHM(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function computePhase(now: Date, clockInAt: number | null): Phase {
  if (isWeekend(now)) return "weekend";
  if (clockInAt === null) return "idle";
  const elapsed = now.getTime() - clockInAt;
  if (elapsed >= SHIFT_MS) return "overtime";
  const { start, end } = breakWindow(now);
  const t = now.getTime();
  if (t >= start && t < end) return "break";
  return "working";
}

const PHASE_COLOR: Record<Phase, string> = {
  weekend: "var(--text-muted)",
  idle: "var(--text-muted)",
  working: "var(--accent-cyan)",
  break: "color-mix(in srgb, var(--accent-cyan) 45%, var(--accent-orange) 55%)",
  overtime: "var(--accent-orange)",
};

const PHASE_LABEL: Record<Phase, string> = {
  weekend: "Weekend - No Shift",
  idle: "Not Clocked In",
  working: "Working",
  break: "On Break",
  overtime: "Overtime",
};

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const labelStyle: CSSProperties = {
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.7rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

function PhaseIcon({ phase, size }: { phase: Phase; size: number }) {
  const style: CSSProperties = { color: PHASE_COLOR[phase], flex: "0 0 auto" };
  if (phase === "weekend") return <Moon size={size} strokeWidth={1.75} style={style} />;
  if (phase === "break") return <Coffee size={size} strokeWidth={1.75} style={style} />;
  if (phase === "overtime") return <AlertTriangle size={size} strokeWidth={1.75} style={style} />;
  return <Circle size={size} strokeWidth={1.75} style={style} />;
}

/** retro segmented "HP bar" style progress meter — 30-min pips instead of a
    smooth fill, with the last two pips forming the hatched overtime lane */
function PixelMeter({ elapsedMs, overtimeMs }: { elapsedMs: number; overtimeMs: number }) {
  const pips = Array.from({ length: TOTAL_PIPS }, (_, i) => {
    const isOt = i >= SHIFT_PIPS;
    const filled = isOt ? overtimeMs >= (i - SHIFT_PIPS + 1) * PIP_MS : elapsedMs >= (i + 1) * PIP_MS;
    return { isOt, filled };
  });

  return (
    <div style={{ display: "flex", gap: 2, width: "100%" }}>
      {pips.map((pip, i) => (
        <div
          key={i}
          style={{
            background: pip.filled
              ? pip.isOt
                ? "var(--accent-orange)"
                : "var(--accent-cyan)"
              : "var(--bg-nested)",
            border: `1px solid ${pip.isOt ? "var(--accent-orange)" : "var(--border)"}`,
            borderRadius: 2,
            flex: "1 1 0",
            height: 12,
            marginLeft: i === SHIFT_PIPS ? 4 : 0,
            opacity: pip.isOt && !pip.filled ? 0.4 : 1,
          }}
        />
      ))}
    </div>
  );
}

function readPixelVar(el: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

function readMascotPalette(el: HTMLElement) {
  return {
    bg: readPixelVar(el, "--bg-nested", "Canvas"),
    border: readPixelVar(el, "--border", "CanvasText"),
    cyan: readPixelVar(el, "--accent-cyan", "CanvasText"),
    muted: readPixelVar(el, "--text-muted", "GrayText"),
    orange: readPixelVar(el, "--accent-orange", "CanvasText"),
  };
}

/** small canvas-drawn 8-bit sprite that acts out the current phase: walking
    on the spot while Working, sipping coffee on Break, alarmed with arms up
    and a blinking "!" during Overtime, and asleep with drifting "z" pixels
    on idle days/weekends. Pure rectangles at a chunky pixel scale, redrawn
    every frame; phase is read from a ref so the loop never restarts. */
function PixelMascot({ phase }: { phase: Phase }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !stage || !context) return;

    let palette = readMascotPalette(stage);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssWidth = 40;
    let cssHeight = 40;

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      cssWidth = Math.max(24, Math.round(bounds.width || 40));
      cssHeight = Math.max(24, Math.round(bounds.height || 40));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = false;
      palette = readMascotPalette(stage);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const startedAt = performance.now();
    let raf = 0;

    const block = (originX: number, originY: number, px: number, col: number, row: number, w: number, h: number, color: string) => {
      context.fillStyle = color;
      context.fillRect(originX + col * px, originY + row * px, w * px, h * px);
    };

    const draw = (t: number) => {
      context.clearRect(0, 0, cssWidth, cssHeight);

      const currentPhase = phaseRef.current;
      const elapsed = (t - startedAt) / 1000;
      const px = Math.max(2, Math.floor(Math.min(cssWidth, cssHeight) / 12));
      const originX = Math.round(cssWidth / 2 - px * 3);
      const originY = Math.round(cssHeight - px * 11);

      const bodyColor =
        currentPhase === "overtime" ? palette.orange : currentPhase === "idle" || currentPhase === "weekend" ? palette.muted : palette.cyan;
      const blink = Math.floor(elapsed * 0.6) % 6 === 0;
      const otFlash = Math.floor(elapsed * 3) % 2 === 0;
      const walkFrame = Math.floor(elapsed * 2.2) % 2;

      // head + face
      block(originX, originY, px, 1, 0, 4, 3, currentPhase === "overtime" && otFlash ? palette.orange : bodyColor);
      if (currentPhase !== "weekend" && !blink) {
        block(originX, originY, px, 2, 1, 1, 1, palette.bg);
        block(originX, originY, px, 4, 1, 1, 1, palette.bg);
      } else {
        block(originX, originY, px, 2, 1, 2, 1, palette.bg);
      }

      // torso (shorter while sitting on break)
      block(originX, originY, px, 1, 3, 4, currentPhase === "break" ? 3 : 4, bodyColor);

      if (currentPhase === "break") {
        block(originX, originY, px, 1, 6, 2, 2, bodyColor);
        block(originX, originY, px, 3, 6, 2, 2, bodyColor);
        block(originX, originY, px, 0, 3, 1, 3, bodyColor);
        block(originX, originY, px, 5, 4, 1, 2, palette.border);
        const steamRow = 2 - (Math.floor(elapsed * 1.5) % 3);
        context.globalAlpha = 0.55;
        block(originX, originY, px, 5, steamRow, 1, 1, palette.muted);
        context.globalAlpha = 1;
      } else if (currentPhase === "overtime") {
        block(originX, originY, px, 0, 2, 1, 2, otFlash ? palette.orange : bodyColor);
        block(originX, originY, px, 5, 2, 1, 2, otFlash ? palette.orange : bodyColor);
        block(originX, originY, px, 1, 7, 2, 3, bodyColor);
        block(originX, originY, px, 3, 7, 2, 3, bodyColor);
        if (otFlash) {
          block(originX, originY, px, 2, -3, 1, 2, palette.orange);
          block(originX, originY, px, 2, -1, 1, 1, palette.orange);
        }
      } else if (currentPhase === "weekend" || currentPhase === "idle") {
        block(originX, originY, px, 0, 3, 1, 3, bodyColor);
        block(originX, originY, px, 5, 3, 1, 3, bodyColor);
        block(originX, originY, px, 1, 7, 2, 3, bodyColor);
        block(originX, originY, px, 3, 7, 2, 3, bodyColor);
        if (currentPhase === "weekend") {
          const drift = (elapsed * 6) % 12;
          context.globalAlpha = Math.max(0, 1 - drift / 12);
          block(originX, originY, px, 5, Math.round(1 - drift / 3), 1, 1, palette.muted);
          context.globalAlpha = 1;
        }
      } else {
        // working: alternating walk cycle
        if (walkFrame === 0) {
          block(originX, originY, px, 1, 7, 2, 3, bodyColor);
          block(originX, originY, px, 3, 7, 2, 2, bodyColor);
          block(originX, originY, px, 0, 3, 1, 3, bodyColor);
          block(originX, originY, px, 5, 4, 1, 2, bodyColor);
        } else {
          block(originX, originY, px, 1, 7, 2, 2, bodyColor);
          block(originX, originY, px, 3, 7, 2, 3, bodyColor);
          block(originX, originY, px, 0, 4, 1, 2, bodyColor);
          block(originX, originY, px, 5, 3, 1, 3, bodyColor);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={stageRef} style={{ height: "100%", position: "relative", width: "100%" }}>
      <canvas ref={canvasRef} style={{ display: "block", height: "100%", width: "100%" }} />
    </div>
  );
}

export function ShiftTrackerWidget() {
  const { preset, size, orientation } = useWidget();
  const view = preset ?? (size === "S" ? (orientation === "v" ? "column" : "badge") : "card");

  const [state, setState] = useCanvasSyncedState<ShiftState>(
    "shift-tracker-state",
    buildDefaultShiftState,
    sanitizeShiftState,
  );

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const todayKey = dateKey(now);
  const effectiveClockInAt =
    state.clockInAt !== null && state.clockInDate === todayKey ? state.clockInAt : null;

  const phase = computePhase(now, effectiveClockInAt);
  const weekend = isWeekend(now);

  const elapsedMs = effectiveClockInAt !== null ? Math.max(0, now.getTime() - effectiveClockInAt) : 0;
  const remainingMs = Math.max(0, SHIFT_MS - elapsedMs);
  const overtimeMs = Math.max(0, elapsedMs - SHIFT_MS);

  const handleClockIn = () => {
    if (isWeekend(new Date())) return;
    const ts = Date.now();
    setState({ clockInAt: ts, clockInDate: dateKey(new Date(ts)) });
  };

  const handleClockOut = () => {
    setState({ clockInAt: null, clockInDate: null });
  };

  const handlePrimaryAction = () => {
    if (weekend) return;
    if (effectiveClockInAt === null) handleClockIn();
    else handleClockOut();
  };

  const badgeTime =
    phase === "weekend"
      ? "Off"
      : phase === "idle"
        ? "Clock In"
        : phase === "working"
          ? `-${formatHM(remainingMs)}`
          : phase === "break"
            ? "On Break"
            : `OT +${formatHM(overtimeMs)}`;

  if (view === "badge") {
    return (
      <div
        onClick={handlePrimaryAction}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handlePrimaryAction();
          }
        }}
        role="button"
        tabIndex={weekend ? -1 : 0}
        style={{
          alignItems: "center",
          cursor: weekend ? "default" : "pointer",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          minWidth: 0,
          padding: "4px 8px",
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "center", minWidth: 0, width: "100%" }}>
          <div
            style={{
              alignItems: "center",
              border: `1.5px solid ${PHASE_COLOR[phase]}`,
              borderRadius: "50%",
              display: "flex",
              flex: "0 0 auto",
              height: 22,
              justifyContent: "center",
              width: 22,
            }}
          >
            <PhaseIcon phase={phase} size={12} />
          </div>
          <div
            className="block-value"
            style={{
              ...monoStyle,
              color: phase === "overtime" ? "var(--accent-orange)" : "var(--text-primary)",
              fontSize: "var(--fs-lead)",
              fontWeight: 500,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {badgeTime}
          </div>
        </div>
      </div>
    );
  }

  if (view === "column") {
    return (
      <div
        onClick={handlePrimaryAction}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handlePrimaryAction();
          }
        }}
        role="button"
        tabIndex={weekend ? -1 : 0}
        style={{
          alignItems: "center",
          cursor: weekend ? "default" : "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          height: "100%",
          justifyContent: "center",
          padding: "8px 4px",
          width: "100%",
        }}
      >
        <div style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
          <PixelMascot phase={phase} />
        </div>
        <div
          style={{
            alignItems: "center",
            border: `1.5px solid ${PHASE_COLOR[phase]}`,
            borderRadius: "50%",
            display: "flex",
            flex: "0 0 auto",
            height: 20,
            justifyContent: "center",
            width: 20,
          }}
        >
          <PhaseIcon phase={phase} size={11} />
        </div>
        <div
          className="block-value"
          style={{
            ...monoStyle,
            color: phase === "overtime" ? "var(--accent-orange)" : "var(--text-primary)",
            fontSize: "var(--fs-body)",
            fontWeight: 500,
            maxWidth: "100%",
            overflow: "hidden",
            textAlign: "center",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {badgeTime}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: "100%",
        minHeight: 0,
        padding: "2px 2px 4px",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div
          style={{
            ...labelStyle,
            color: PHASE_COLOR[phase],
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {PHASE_LABEL[phase]}
        </div>
        <div style={{ flex: "0 0 auto", height: 36, width: 36 }}>
          <PixelMascot phase={phase} />
        </div>
      </div>

      <div
        className="block-value"
        style={{
          ...monoStyle,
          color: phase === "overtime" ? "var(--accent-orange)" : "var(--text-primary)",
          flex: "0 0 auto",
          fontSize: "var(--fs-stat)",
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        {effectiveClockInAt !== null ? formatHM(elapsedMs) : "--"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <PixelMeter elapsedMs={elapsedMs} overtimeMs={overtimeMs} />
        <div
          style={{
            ...monoStyle,
            color: "var(--text-muted)",
            display: "flex",
            fontSize: "var(--fs-micro)",
            justifyContent: "space-between",
          }}
        >
          <span>0h</span>
          <span>9h</span>
          <span>+1h OT</span>
        </div>
      </div>

      {!weekend && (
        <div style={{ alignItems: "center", color: "var(--text-muted)", display: "flex", fontSize: "var(--fs-micro)", gap: 6, minWidth: 0 }}>
          <Coffee size={14} strokeWidth={1.75} style={{ color: "var(--text-muted)", flex: "0 0 auto" }} />
          <span style={{ ...monoStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Break: {breakLabel(now)}
          </span>
        </div>
      )}

      {phase === "overtime" && (
        <div
          style={{
            alignItems: "center",
            background: "color-mix(in srgb, var(--accent-orange) 16%, transparent)",
            border: "1.5px solid var(--accent-orange)",
            borderRadius: 8,
            color: "var(--accent-orange)",
            display: "flex",
            fontSize: "var(--fs-micro)",
            gap: 6,
            padding: "4px 8px",
            textTransform: "uppercase",
          }}
        >
          <AlertTriangle size={14} strokeWidth={1.75} style={{ flex: "0 0 auto" }} />
          <span style={{ ...monoStyle, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Overtime - OT +{formatHM(overtimeMs)}
          </span>
        </div>
      )}

      <button
        disabled={weekend}
        onClick={handlePrimaryAction}
        style={{
          ...labelStyle,
          alignItems: "center",
          background: weekend
            ? "var(--bg-nested)"
            : effectiveClockInAt === null
              ? "var(--accent-cyan)"
              : "var(--accent-orange)",
          border: "1.5px solid var(--border)",
          borderRadius: 9,
          color: weekend ? "var(--text-muted)" : "var(--bg-card)",
          cursor: weekend ? "default" : "pointer",
          display: "flex",
          fontSize: "var(--fs-label)",
          gap: 6,
          height: 32,
          justifyContent: "center",
          marginTop: "auto",
          width: "100%",
        }}
        type="button"
      >
        {weekend ? (
          <span>No Shift Today</span>
        ) : effectiveClockInAt === null ? (
          <>
            <LogIn size={14} strokeWidth={1.75} />
            <span>Clock In</span>
          </>
        ) : (
          <>
            <LogOut size={14} strokeWidth={1.75} />
            <span>Clock Out</span>
          </>
        )}
      </button>
    </div>
  );
}
