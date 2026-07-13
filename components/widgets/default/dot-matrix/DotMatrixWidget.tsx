"use client";

import { type CSSProperties, useCallback, useEffect, useRef } from "react";
import { useWidget } from "@/components/framework/WidgetContext";
import { startAnimationLoop } from "@/lib/animationLoop";

interface Particle {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};

function buildGrid(w: number, h: number, sp: number): Particle[] {
  const cols = Math.max(1, Math.floor(w / sp));
  const rows = Math.max(1, Math.floor(h / sp));
  const ox = (w - (cols - 1) * sp) / 2;
  const oy = (h - (rows - 1) * sp) / 2;
  const list: Particle[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hx = ox + c * sp;
      const hy = oy + r * sp;
      list.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0 });
    }
  }
  return list;
}

export function DotMatrixWidget() {
  const { size, settings } = useWidget();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const timeRef = useRef(0);
  const dimRef = useRef({ w: 0, h: 0 });

  const colorMode = String(settings.colorMode ?? "orange");
  const interactionMode = String(settings.interaction ?? "repel");

  // Tighter spacing and stronger flow at larger sizes
  const spacing = size === "S" ? 22 : size === "M" ? 18 : 14;
  const dotR = 2.5;
  const spring = 0.055;
  const damp = 0.875;
  const mouseR = 70;
  // S size gets no flow field - just spring + mouse for a cleaner minimal look
  const hasFlow = size !== "S";
  const flowStr = size === "L" ? 0.045 : 0.03;

  const initGrid = useCallback(
    (w: number, h: number) => {
      particlesRef.current = buildGrid(w, h, spacing);
      dimRef.current = { w, h };
    },
    [spacing],
  );

  // Canvas sizing and particle rebuild on container resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const { width: w, height: h } = rect;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      initGrid(w, h);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [initGrid]);

  // Physics + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let paletteReadAt = 0;
    let mutedClr = "";
    let accentClr = "";

    const tick = (now: number, deltaMs: number) => {
      timeRef.current += deltaMs * 0.00066;
      const t = timeRef.current;
      const { w, h } = dimRef.current;
      const ps = particlesRef.current;
      const m = mouseRef.current;

      if (!w || !h || !ps.length) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (paletteReadAt === 0 || now - paletteReadAt >= 1000) {
        const rs = getComputedStyle(document.documentElement);
        mutedClr = rs.getPropertyValue("--text-muted").trim();
        accentClr = rs.getPropertyValue(
          colorMode === "cyan" ? "--accent-cyan" : "--accent-orange",
        ).trim();
        paletteReadAt = now;
      }
      const sign = interactionMode === "attract" ? -1 : 1;

      for (const p of ps) {
        // Divergence-free (curl) flow field: two overlapping potential functions.
        // The curl of phi(x,y) is (d phi/dy, -d phi/dx), which is incompressible
        // and creates the swirling, fluid-like motion.
        if (hasFlow) {
          const px = p.hx * 0.014;
          const py = p.hy * 0.014;
          p.vx +=
            (Math.sin(px + t * 0.9) * Math.cos(py + t * 0.7) +
              Math.sin(py * 1.3 - t * 0.5) * Math.cos(px * 0.8 + t * 1.1) * 0.5) *
            flowStr;
          p.vy +=
            (-Math.cos(px + t * 0.9) * Math.sin(py + t * 0.7) -
              Math.cos(py * 1.3 - t * 0.5) * Math.sin(px * 0.8 + t * 1.1) * 0.5) *
            flowStr;
        }

        // Spring restoring force - pulls each dot back to its grid home
        p.vx += (p.hx - p.x) * spring;
        p.vy += (p.hy - p.y) * spring;

        // Mouse push/pull with quadratic falloff
        const mdx = p.x - m.x;
        const mdy = p.y - m.y;
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < mouseR && md > 0.1) {
          const tf = 1 - md / mouseR;
          const f = tf * tf * 4;
          p.vx += (mdx / md) * f * sign;
          p.vy += (mdy / md) * f * sign;
        }

        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx;
        p.y += p.vy;

        // Displacement from home drives visual: radius grows and color shifts to accent
        const dx = p.x - p.hx;
        const dy = p.y - p.hy;
        const disp = Math.sqrt(dx * dx + dy * dy);
        const blend = Math.min(disp / (mouseR * 0.5), 1);

        ctx.globalAlpha = 0.3 + blend * 0.7;
        ctx.fillStyle = blend > 0.1 ? accentClr : mutedClr;
        ctx.beginPath();
        ctx.arc(p.x * dpr, p.y * dpr, (dotR + blend * 1.6) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

    return startAnimationLoop({ element: canvas, fps: 30, onFrame: tick });
  }, [colorMode, damp, dotR, flowStr, hasFlow, interactionMode, mouseR, spring]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onMouseLeave = useCallback(() => {
    mouseRef.current = { x: -9999, y: -9999 };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const touch = e.touches[0];
    if (!rect || !touch) return;
    mouseRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }, []);

  const onTouchEnd = useCallback(() => {
    mouseRef.current = { x: -9999, y: -9999 };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", overflow: "hidden", position: "relative", width: "100%" }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {size === "L" && (
        <div
          style={{
            bottom: 8,
            left: 12,
            pointerEvents: "none",
            position: "absolute",
            ...labelStyle,
          }}
        >
          fluid physics | {colorMode} | {interactionMode}
        </div>
      )}
    </div>
  );
}
