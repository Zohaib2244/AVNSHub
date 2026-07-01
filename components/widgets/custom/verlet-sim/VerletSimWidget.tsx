"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWidget } from "@/components/framework/WidgetContext";

type AnchorMode = "left" | "suspended";

type RopePoint = {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  pinned: boolean;
  pinX: number;
  pinY: number;
};

type RopeState = {
  height: number;
  points: RopePoint[];
  segmentLength: number;
  width: number;
};

type SimStats = {
  points: number;
  tension: number;
  wind: number;
};

type Palette = {
  accent: string;
  bg: string;
  border: string;
  muted: string;
  primary: string;
  teal: string;
};

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
};

const panelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
  boxShadow: "2px 2px 0 var(--shadow)",
};

const buttonStyle: CSSProperties = {
  ...labelStyle,
  ...panelStyle,
  color: "var(--text-primary)",
  cursor: "pointer",
  padding: "5px 10px",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberSetting(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function readVar(element: HTMLElement, name: string, fallback: string) {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

function readPalette(element: HTMLElement): Palette {
  return {
    accent: readVar(element, "--accent-orange", "CanvasText"),
    bg: readVar(element, "--bg-nested", "Canvas"),
    border: readVar(element, "--border", "CanvasText"),
    muted: readVar(element, "--text-muted", "CanvasText"),
    primary: readVar(element, "--text-primary", "CanvasText"),
    teal: readVar(element, "--accent-cyan", "CanvasText"),
  };
}

function makePoint(x: number, y: number, pinned = false): RopePoint {
  return { x, y, oldX: x, oldY: y, pinned, pinX: x, pinY: y };
}

function createRope(width: number, height: number, segments: number, anchor: AnchorMode): RopeState {
  const safeWidth = Math.max(width, 120);
  const safeHeight = Math.max(height, 80);
  const padding = clamp(Math.min(safeWidth, safeHeight) * 0.12, 12, 26);
  const points: RopePoint[] = [];

  if (anchor === "suspended") {
    const ropeWidth = Math.max(72, safeWidth - padding * 2);
    const segmentLength = ropeWidth / segments;
    const y = padding + safeHeight * 0.08;

    for (let i = 0; i <= segments; i += 1) {
      const x = padding + segmentLength * i;
      const sag = Math.sin((i / segments) * Math.PI) * safeHeight * 0.12;
      points.push(makePoint(x, y + sag, i === 0 || i === segments));
    }

    return { height: safeHeight, points, segmentLength, width: safeWidth };
  }

  const segmentLength = clamp((safeWidth - padding * 2) / Math.max(segments, 1), 7, 18);
  const startX = padding;
  const startY = clamp(safeHeight * 0.34, padding + 8, safeHeight - padding);

  for (let i = 0; i <= segments; i += 1) {
    const x = startX + segmentLength * i;
    const y = startY + Math.sin(i * 0.7) * 6;
    points.push(makePoint(x, y, i === 0));
  }

  return { height: safeHeight, points, segmentLength, width: safeWidth };
}

function constrainToStage(point: RopePoint, width: number, height: number) {
  const margin = 5;
  point.x = clamp(point.x, margin, width - margin);
  point.y = clamp(point.y, margin, height - margin);
}

function satisfyConstraints(state: RopeState, iterations: number) {
  for (let pass = 0; pass < iterations; pass += 1) {
    for (let i = 0; i < state.points.length - 1; i += 1) {
      const a = state.points[i];
      const b = state.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      const difference = (state.segmentLength - distance) / distance;
      const offsetX = dx * difference * 0.5;
      const offsetY = dy * difference * 0.5;

      if (!a.pinned) {
        a.x -= offsetX;
        a.y -= offsetY;
      }

      if (!b.pinned) {
        b.x += offsetX;
        b.y += offsetY;
      }
    }

    for (const point of state.points) {
      if (point.pinned) {
        point.x = point.pinX;
        point.y = point.pinY;
      } else {
        constrainToStage(point, state.width, state.height);
      }
    }
  }
}

function calculateTension(state: RopeState) {
  let stretch = 0;

  for (let i = 0; i < state.points.length - 1; i += 1) {
    const a = state.points[i];
    const b = state.points[i + 1];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    stretch = Math.max(stretch, Math.abs(distance - state.segmentLength) / state.segmentLength);
  }

  return Math.round(clamp(stretch * 100, 0, 99));
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number, palette: Palette) {
  const gap = 24;

  context.save();
  context.globalAlpha = 0.18;
  context.strokeStyle = palette.border;
  context.lineWidth = 1;

  for (let x = gap; x < width; x += gap) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let y = gap; y < height; y += gap) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.restore();
}

function drawRope(context: CanvasRenderingContext2D, state: RopeState, palette: Palette, showTrail: boolean) {
  if (showTrail) {
    context.save();
    context.globalAlpha = 0.26;
    context.fillStyle = palette.bg;
    context.fillRect(0, 0, state.width, state.height);
    context.restore();
  } else {
    context.clearRect(0, 0, state.width, state.height);
  }

  drawGrid(context, state.width, state.height, palette);

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 3;
  context.strokeStyle = palette.accent;
  context.beginPath();
  state.points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();

  for (const point of state.points) {
    context.beginPath();
    context.fillStyle = point.pinned ? palette.primary : palette.teal;
    context.arc(point.x, point.y, point.pinned ? 4 : 3, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

export function VerletSimWidget() {
  const { size, settings } = useWidget();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const ropeRef = useRef<RopeState | null>(null);
  const pointerRef = useRef({ active: false, grabbedIndex: -1, x: 0, y: 0 });
  const impulseRef = useRef(0);
  const impulseDirectionRef = useRef(1);
  const [resetToken, setResetToken] = useState(0);
  const [stats, setStats] = useState<SimStats>({ points: 0, tension: 0, wind: 0 });

  const segmentCount = numberSetting(settings.segments, 16, 8, 32);
  const gravity = numberSetting(settings.gravity, 0.36, 0, 1.2);
  const stiffness = numberSetting(settings.stiffness, 6, 2, 10);
  const showTrail = settings.trails !== false;
  const anchorMode: AnchorMode = settings.anchor === "suspended" ? "suspended" : "left";
  const compact = size === "S";

  const simConfig = useMemo(
    () => ({
      anchorMode,
      gravity,
      segmentCount: Math.round(segmentCount),
      showTrail,
      stiffness: Math.round(stiffness),
    }),
    [anchorMode, gravity, segmentCount, showTrail, stiffness],
  );

  const resetSim = useCallback(() => {
    setResetToken((value) => value + 1);
  }, []);

  const kickRope = useCallback(() => {
    impulseRef.current += impulseDirectionRef.current * 7;
    impulseDirectionRef.current *= -1;
  }, []);

  const updatePointer = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    pointerRef.current.x = event.clientX - bounds.left;
    pointerRef.current.y = event.clientY - bounds.top;
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      updatePointer(event);
      event.currentTarget.setPointerCapture(event.pointerId);

      const rope = ropeRef.current;
      if (!rope) return;

      let grabbedIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;

      rope.points.forEach((point, index) => {
        if (point.pinned) return;
        const distance = Math.hypot(point.x - pointerRef.current.x, point.y - pointerRef.current.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          grabbedIndex = index;
        }
      });

      pointerRef.current.active = true;
      pointerRef.current.grabbedIndex =
        grabbedIndex >= 0 && bestDistance < 48 ? grabbedIndex : Math.max(1, rope.points.length - 1);
    },
    [updatePointer],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!pointerRef.current.active) return;
      updatePointer(event);
    },
    [updatePointer],
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    pointerRef.current.active = false;
    pointerRef.current.grabbedIndex = -1;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !stage || !context) return;

    let animationFrame = 0;
    let lastStatsAt = 0;
    let palette = readPalette(stage);

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      const width = Math.max(120, Math.round(bounds.width || 220));
      const height = Math.max(82, Math.round(bounds.height || 120));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      palette = readPalette(stage);
      ropeRef.current = createRope(width, height, simConfig.segmentCount, simConfig.anchorMode);
      pointerRef.current.active = false;
      pointerRef.current.grabbedIndex = -1;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const tick = (time: number) => {
      const rope = ropeRef.current;
      if (!rope) {
        animationFrame = requestAnimationFrame(tick);
        return;
      }

      if (Math.round(time) % 30 === 0) {
        palette = readPalette(stage);
      }

      const wind = impulseRef.current;
      impulseRef.current *= 0.94;

      for (const point of rope.points) {
        if (point.pinned) {
          point.x = point.pinX;
          point.y = point.pinY;
          point.oldX = point.x;
          point.oldY = point.y;
          continue;
        }

        const velocityX = (point.x - point.oldX) * 0.985;
        const velocityY = (point.y - point.oldY) * 0.985;
        point.oldX = point.x;
        point.oldY = point.y;
        point.x += velocityX + wind * 0.018;
        point.y += velocityY + simConfig.gravity;
        constrainToStage(point, rope.width, rope.height);
      }

      const pointer = pointerRef.current;
      if (pointer.active && pointer.grabbedIndex >= 0) {
        const grabbed = rope.points[pointer.grabbedIndex];
        if (grabbed && !grabbed.pinned) {
          grabbed.x = clamp(pointer.x, 5, rope.width - 5);
          grabbed.y = clamp(pointer.y, 5, rope.height - 5);
          grabbed.oldX = grabbed.x;
          grabbed.oldY = grabbed.y;
        }
      }

      satisfyConstraints(rope, simConfig.stiffness);
      drawRope(context, rope, palette, simConfig.showTrail);

      if (time - lastStatsAt > 220) {
        lastStatsAt = time;
        setStats({
          points: rope.points.length,
          tension: calculateTension(rope),
          wind: Math.round(Math.abs(impulseRef.current) * 10) / 10,
        });
      }

      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, [resetToken, simConfig]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 6 : 8,
        height: "100%",
        minHeight: 0,
      }}
    >
      {compact ? (
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div className="block-label" style={labelStyle}>
            rope
          </div>
          <div className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.68rem" }}>
            {Math.round(segmentCount)}p
          </div>
        </div>
      ) : (
        <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div className="block-label" style={labelStyle}>
              verlet rope
            </div>
            <div className="block-value accent" style={{ ...monoStyle, lineHeight: 1.05 }}>
              {stats.tension}% tension
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
            <div className="block-stat" style={{ ...panelStyle, ...labelStyle, padding: "4px 8px" }}>
              {stats.points} pts
            </div>
            <div className="block-stat" style={{ ...panelStyle, ...labelStyle, padding: "4px 8px" }}>
              wind {stats.wind.toFixed(1)}
            </div>
          </div>
        </div>
      )}

      <div
        ref={stageRef}
        style={{
          ...panelStyle,
          flex: "1 1 auto",
          minHeight: compact ? 62 : 96,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <canvas
          aria-label="interactive verlet rope physics simulation"
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerUp}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          ref={canvasRef}
          style={{
            cursor: "grab",
            display: "block",
            height: "100%",
            touchAction: "none",
            width: "100%",
          }}
        />
        {!compact && (
          <div
            className="block-sub"
            style={{
              ...labelStyle,
              background: "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 12,
              bottom: 8,
              boxShadow: "2px 2px 0 var(--shadow)",
              left: 8,
              padding: "3px 7px",
              position: "absolute",
            }}
          >
            drag nodes
          </div>
        )}
      </div>

      {size === "L" && (
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="more-row" style={{ ...panelStyle, padding: "6px 8px" }}>
            <div className="more-head" style={labelStyle}>
              gravity
            </div>
            <div style={{ ...monoStyle, color: "var(--text-primary)" }}>{gravity.toFixed(2)}</div>
          </div>
          <div className="more-row" style={{ ...panelStyle, padding: "6px 8px" }}>
            <div className="more-head" style={labelStyle}>
              passes
            </div>
            <div style={{ ...monoStyle, color: "var(--text-primary)" }}>{Math.round(stiffness)}</div>
          </div>
          <div className="more-row" style={{ ...panelStyle, padding: "6px 8px" }}>
            <div className="more-head" style={labelStyle}>
              anchor
            </div>
            <div style={{ ...monoStyle, color: "var(--text-primary)" }}>{anchorMode}</div>
          </div>
        </div>
      )}

      {!compact && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={kickRope} style={buttonStyle} type="button">
            impulse
          </button>
          <button onClick={resetSim} style={buttonStyle} type="button">
            reset
          </button>
        </div>
      )}
    </div>
  );
}
