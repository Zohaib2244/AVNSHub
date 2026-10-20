"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { useWidget } from "@/components/framework/WidgetContext";
import { startAnimationLoop } from "@/lib/animationLoop";

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
};

const MATRIX_SIZE = 50;
const BRIGHTNESS_STEPS = 12;
const SPEED: Record<string, number> = { slow: 0.35, normal: 1.0, fast: 2.8 };
const DOT_SCALE: Record<string, number> = { small: 0.27, medium: 0.34, large: 0.43 };

type AnimFn = (c: number, r: number, cols: number, rows: number, t: number) => number;

// Each function returns brightness 0-1 for the dot at column c, row r at time t
const ANIMS: Record<string, AnimFn> = {
  // Two concentric rings + center dot - Nothing Phone idle aesthetic
  glyph(c, r, cols, rows, t) {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
    const outerR = Math.min(cx, cy) * 0.97;
    if (Math.abs(d - outerR) < 0.95) return 0.5 + 0.5 * Math.sin(t * 0.018);
    if (Math.abs(d - outerR * 0.55) < 0.85) return 0.45 + 0.55 * Math.sin(t * 0.022 + Math.PI);
    if (d < 1.1) return 0.7 + 0.3 * Math.sin(t * 0.05);
    return 0.04;
  },

  // Outward pulse wave from center
  pulse(c, r, cols, rows, t) {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
    const maxD = Math.sqrt(cx ** 2 + cy ** 2) || 1;
    return 0.05 + 0.95 * Math.max(0, Math.sin(t * 0.042 - (d / maxD) * Math.PI * 2));
  },

  // Diagonal sine wave sweeping left-to-right
  wave(c, r, _cols, _rows, t) {
    return 0.05 + 0.95 * Math.max(0, Math.sin(c * 0.45 - t * 0.09 + r * 0.2));
  },

  // Expanding concentric rings from center
  ripple(c, r, cols, rows, t) {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
    return 0.05 + 0.95 * Math.max(0, Math.sin(d * 0.75 - t * 0.11));
  },

  // Matrix-style rain drops, staggered per column
  rain(c, r, _cols, rows, t) {
    const dropY = (t * 0.14 + c * 7.3) % (rows + 6) - 3;
    const dist = r - dropY;
    if (dist >= 0 && dist < 0.8) return 1.0;
    if (dist >= 0.8 && dist < 3.5) return Math.max(0, 0.85 - dist * 0.22);
    return 0.04;
  },

  // Bright trail snaking through the grid in a boustrophedon path
  snake(c, r, cols, rows, t) {
    const total = cols * rows;
    const len = Math.max(5, Math.floor(total * 0.09));
    const idx = r % 2 === 0 ? r * cols + c : r * cols + (cols - 1 - c);
    const head = Math.floor(t * 0.28) % total;
    const behind = (idx - head + total) % total;
    return behind < len ? 1.0 - (behind / len) * 0.82 : 0.04;
  },

  // Progressive fill from bottom - Nothing Phone charging animation
  charging(_c, r, _cols, rows, t) {
    const level = (t * 0.016) % 1.08;
    const filled = level * rows;
    const fromBottom = rows - 1 - r;
    if (fromBottom < filled - 0.5) return 0.85 + 0.1 * Math.sin(t * 0.04);
    if (fromBottom < filled + 0.5) return 0.85 * (filled - fromBottom + 0.5);
    return 0.04;
  },

  // Bouncing horizontal scan line
  scan(_c, r, _cols, rows, t) {
    const period = Math.max(2, rows * 2 - 2);
    const cycle = (t * 0.07) % period;
    const pos = cycle < rows ? cycle : period - cycle;
    const d = Math.abs(r - pos);
    if (d < 0.6) return 1.0;
    return d < 3 ? Math.max(0, 1 - d * 0.38) : 0.04;
  },

  // Deterministic pseudo-random bit flicker
  binary(c, r, _cols, _rows, t) {
    const slot = Math.floor(t * 0.18);
    const hash = ((c * 1664525 + r * 22695477 + slot * 1013904223) >>> 0) & 0xffff;
    return hash & 1 ? 0.8 + 0.2 * ((hash >> 1 & 0x7f) / 127) : 0.04;
  },

  // Archimedean spiral
  spiral(c, r, cols, rows, t) {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const angle = Math.atan2(r - cy, c - cx);
    const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
    return 0.05 + 0.95 * Math.max(0, Math.sin(angle + d * 0.6 - t * 0.08));
  },
};

interface WidgetState {
  animation: string;
  speed: string;
  color: string;
  dotScale: number;
}

export function GlyphMatrixWidget() {
  const { size, settings } = useWidget();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tickRef = useRef(0);
  const stateRef = useRef<WidgetState>({
    animation: "glyph",
    speed: "normal",
    color: "orange",
    dotScale: DOT_SCALE.medium,
  });

  const animation = String(settings.animation || "glyph");
  const speed = String(settings.speed || "normal");
  const color = String(settings.color || "orange");
  const dotScale = DOT_SCALE[String(settings.dotSize || "medium")] ?? DOT_SCALE.medium;

  // Sync settings into the ref after render (not during) so the draw loop
  // always reads fresh values without mutating a ref mid-render
  useEffect(() => {
    stateRef.current = { animation, speed, color, dotScale };
  }, [animation, speed, color, dotScale]);

  // One-time setup: ResizeObserver + visibility-aware, frame-capped loop.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvasEl || !wrap) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    // re-bind as non-null locals — TS can't carry the narrowing above into the
    // `draw` closure since it's invoked later via requestAnimationFrame
    const canvas = canvasEl;
    const ctx = context;

    const ro = new ResizeObserver(([entry]) => {
      canvas.width = Math.round(entry.contentRect.width);
      canvas.height = Math.round(entry.contentRect.height);
    });
    ro.observe(wrap);

    let palette = {
      orange: "",
      cyan: "",
      primary: "",
      muted: "",
    };
    let paletteReadAt = 0;

    function readPalette(now: number) {
      if (now - paletteReadAt < 1000 && paletteReadAt !== 0) return;
      const cs = getComputedStyle(document.documentElement);
      palette = {
        orange: cs.getPropertyValue("--accent-orange").trim(),
        cyan: cs.getPropertyValue("--accent-cyan").trim(),
        primary: cs.getPropertyValue("--text-primary").trim(),
        muted: cs.getPropertyValue("--text-muted").trim(),
      };
      paletteReadAt = now;
    }

    function draw(now: number, deltaMs: number) {
      const { animation, speed, color, dotScale } = stateRef.current;
      tickRef.current += deltaMs * 0.06 * (SPEED[speed] ?? 1);
      const t = tickRef.current;

      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;

      const cols = MATRIX_SIZE;
      const rows = MATRIX_SIZE;
      const matrixSide = Math.min(w, h);
      const dotPitch = matrixSide / (MATRIX_SIZE + 1);
      const dotR = dotPitch * dotScale;
      const ox = (w - dotPitch * (MATRIX_SIZE - 1)) / 2;
      const oy = (h - dotPitch * (MATRIX_SIZE - 1)) / 2;
      const cx = (cols - 1) / 2;
      const cy = (rows - 1) / 2;
      const circleR = (MATRIX_SIZE - 1) / 2;
      const circleRSquared = circleR * circleR;

      // CSS reads trigger style resolution, so refresh tokens at most once a
      // second instead of doing four reads for every one of 2500 dots/frames.
      readPalette(now);
      const { orange, cyan, primary, muted } = palette;

      const active = color === "cyan" ? cyan : color === "white" ? primary : orange;
      const inactive = muted || primary || active;
      const animFn = ANIMS[animation] ?? ANIMS.glyph;

      ctx.clearRect(0, 0, w, h);

      // Filling every dot separately caused thousands of canvas state changes
      // per frame. Bucket similar brightness values into a small set of paths
      // so the same 50x50 matrix only needs a handful of fills.
      const inactivePath = new Path2D();
      const activePaths = Array.from({ length: BRIGHTNESS_STEPS }, () => new Path2D());
      const secondaryPaths = color === "mixed"
        ? Array.from({ length: BRIGHTNESS_STEPS }, () => new Path2D())
        : null;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dc = c - cx;
          const dr = r - cy;
          const distanceSquared = dc * dc + dr * dr;
          if (distanceSquared > circleRSquared) continue;

          const br = Math.max(0, Math.min(1, animFn(c, r, cols, rows, t)));
          const x = ox + c * dotPitch;
          const y = oy + r * dotPitch;

          if (br < 0.07) {
            inactivePath.moveTo(x + dotR, y);
            inactivePath.arc(x, y, dotR, 0, Math.PI * 2);
          } else {
            const bucket = Math.min(
              BRIGHTNESS_STEPS - 1,
              Math.max(1, Math.round(br * (BRIGHTNESS_STEPS - 1))),
            );
            const path = secondaryPaths && distanceSquared >= circleRSquared * 0.25
              ? secondaryPaths[bucket]
              : activePaths[bucket];
            path.moveTo(x + dotR, y);
            path.arc(x, y, dotR, 0, Math.PI * 2);
          }
        }
      }

      ctx.globalAlpha = 0.13;
      ctx.fillStyle = inactive;
      ctx.fill(inactivePath);

      for (let bucket = 1; bucket < BRIGHTNESS_STEPS; bucket++) {
        ctx.globalAlpha = 0.1 + (bucket / (BRIGHTNESS_STEPS - 1)) * 0.9;
        ctx.fillStyle = active || primary || inactive;
        ctx.fill(activePaths[bucket]);
        if (secondaryPaths) {
          ctx.fillStyle = cyan || active || primary || inactive;
          ctx.fill(secondaryPaths[bucket]);
        }
      }
      ctx.globalAlpha = 1;
    }

    const stopAnimation = startAnimationLoop({ element: canvas, fps: 15, onFrame: draw });
    return () => {
      ro.disconnect();
      stopAnimation();
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      <div
        ref={wrapRef}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          borderRadius: 12,
          background: "var(--bg-nested)",
          border: "1.5px solid var(--border)",
          boxShadow: "2px 2px 0 var(--shadow)",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", height: "100%", position: "absolute", inset: 0, width: "100%" }}
        />
      </div>
      {size !== "S" && (
        <div
          style={{
            ...labelStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 4,
          }}
        >
          <span>animation</span>
          <span style={{ ...monoStyle, fontSize: "0.62rem" }}>
            {animation}{size === "L" ? ` - ${speed}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
