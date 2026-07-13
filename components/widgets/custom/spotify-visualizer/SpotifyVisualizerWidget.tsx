"use client";

import { type CSSProperties, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";
import { startAnimationLoop } from "@/lib/animationLoop";
import { ChevronLeft, ChevronRight, Music, Pause, Play } from "lucide-react";
import type { NowPlaying as NowPlayingData, PlayerAction, SpotifyCreds } from "@/lib/spotify";

// ─── constants ────────────────────────────────────────────────────

const POLL_URL = "/api/now-playing";
const POLL_MS = 10_000;

const cornerBadgeStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: "0.5rem",
  color: "var(--text-muted-dim)",
  letterSpacing: "0.06em",
  pointerEvents: "none",
  position: "absolute",
  zIndex: 4,
};

// ─── helpers ──────────────────────────────────────────────────────

function spotifyCredsFrom(s: Record<string, string | number | boolean>): SpotifyCreds | undefined {
  const g = (k: string) => String(s[k] ?? "").trim();
  const clientId = g("spotifyClientId");
  const clientSecret = g("spotifyClientSecret");
  const refreshToken = g("spotifyRefreshToken");
  if (!clientId && !clientSecret && !refreshToken) return undefined;
  return { clientId, clientSecret, refreshToken };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function readVar(el: HTMLElement, name: string, fb: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fb;
}

function readPalette(el: HTMLElement) {
  return {
    cyan: readVar(el, "--accent-cyan", "#00b4c8"),
    orange: readVar(el, "--accent-orange", "#ff6b2b"),
    border: readVar(el, "--border", "#3d3220"),
    dim: readVar(el, "--text-muted-dim", "#8b8475"),
    primary: readVar(el, "--text-primary", "#e8dfc8"),
  };
}

function rgba(c: string, a: number): string {
  const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
  return c;
}

function fmtMs(ms: number): string {
  const t = Math.floor(ms / 1000);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, "0")}`;
}

async function sendControl(action: PlayerAction, refresh: () => void, creds?: SpotifyCreds): Promise<string | null> {
  try {
    const r = await fetch("/api/spotify-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, creds }),
    });
    const j = (await r.json()) as { ok: boolean; error?: string };
    if (!j.ok) return j.error ?? "control failed";
    setTimeout(refresh, 700);
    return null;
  } catch {
    return "request failed";
  }
}

// ─── canvas oscillator engine ────────────────────────────────────

type WaveParams = [number[], number[], number];

function seedParams(seed: number): WaveParams {
  const f = [1.5, 3.7, 7.2, 11.3, 0.8];
  const a = [0.7, 0.35, 0.2, 0.08, 0.3];
  const m = 0.55;
  if (seed === 0) return [f, a, m];
  const r = (i: number) => 0.3 + ((seed * (i + 1) * 7) % 97) / 97 * 1.4;
  const mm = 0.35 + ((seed * 19) % 53) / 53 * 0.4;
  return [
    f.map((v, i) => v * (0.8 + ((seed * (i + 1) * 11) % 43) / 43 * 1.2)),
    a.map((v, i) => Math.min(1, v * (0.6 + r(i)))),
    mm,
  ];
}

function runCanvas(
  canvas: HTMLCanvasElement,
  stage: HTMLDivElement,
  trackRef: MutableRefObject<string>,
  isPlayingRef: MutableRefObject<boolean>,
): () => void {
  const ctx = canvas.getContext("2d")!;
  if (!ctx) return () => {};
  let ratio = 1;
  let paletteReadAt = 0;
  let palette = readPalette(stage);
  let prevSeed = -1;
  let params: WaveParams = seedParams(0);

  function resize() {
    const b = stage.getBoundingClientRect();
    const W = Math.max(120, Math.round(b.width || 300));
    const H = Math.max(48, Math.round(b.height || 80));
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    palette = readPalette(stage);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  function drawGrid(W: number, H: number) {
    const midY = H / 2;
    ctx.save();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    for (let x = 0; x <= W; x += W / 12) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x), 0);
      ctx.lineTo(Math.round(x), H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += H / 8) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y));
      ctx.lineTo(W, Math.round(y));
      ctx.stroke();
    }
    ctx.strokeStyle = palette.dim;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(midY));
    ctx.lineTo(W, Math.round(midY));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(Math.round(W / 2), 0);
    ctx.lineTo(Math.round(W / 2), H);
    ctx.stroke();
    ctx.restore();
  }

  function tick(ts: number) {
    if (paletteReadAt === 0 || ts - paletteReadAt >= 1000) {
      palette = readPalette(stage);
      paletteReadAt = ts;
    }

    const W = canvas.width / ratio;
    const H = canvas.height / ratio;
    const midY = H / 2;

    ctx.clearRect(0, 0, W, H);
    drawGrid(W, H);

    const track = trackRef.current;
    const seed = track ? hashStr(track) : 0;
    if (seed !== prevSeed) {
      params = seedParams(seed);
      prevSeed = seed;
    }

    const isPlaying = isPlayingRef.current;
    const [freqs, amps, modBase] = params;
    const wave: number[] = [];

    const beat = isPlaying ? 1 : 0.3;
    const energy = isPlaying ? 1 : 0.35;
    const modAmp = (modBase + Math.sin(ts * 0.002 + 1) * 0.3) * energy;

    for (let i = 0; i < W; i++) {
      const x = i / W;
      let y = 0;
      for (let f = 0; f < freqs.length; f++) {
        y += amps[f] * Math.sin(x * freqs[f] * Math.PI * 2 + ts * 0.015 * freqs[f] * beat + f * 1.2);
      }
      if (isPlaying && Math.sin(ts * 0.05 + i * 0.005) > 0.97) {
        y += 0.5 * Math.sin(i * 0.5) * Math.exp(-(((i % 40) - 20) ** 2) / 40);
      }
      y *= modAmp;
      y = Math.max(-1, Math.min(1, y));
      wave.push(y);
    }

    // Main cyan waveform
    ctx.beginPath();
    for (let i = 0; i < W; i++) {
      const sy = midY - wave[i] * (H * 0.38);
      if (i === 0) ctx.moveTo(i, sy);
      else ctx.lineTo(i, sy);
    }
    ctx.strokeStyle = palette.cyan;
    ctx.lineWidth = 2;
    ctx.shadowColor = palette.cyan;
    ctx.shadowBlur = isPlaying ? 16 : 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Glow under-wave fill
    ctx.beginPath();
    ctx.moveTo(0, midY);
    for (let i = 0; i < W; i++) ctx.lineTo(i, midY - wave[i] * (H * 0.38));
    ctx.lineTo(W, midY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgba(palette.cyan, isPlaying ? 0.06 : 0.02));
    grad.addColorStop(0.5, rgba(palette.cyan, isPlaying ? 0.03 : 0.01));
    grad.addColorStop(1, rgba(palette.cyan, 0));
    ctx.fillStyle = grad;
    ctx.fill();

    // Secondary orange waveform
    if (isPlaying) {
      ctx.beginPath();
      for (let i = 0; i < W; i++) {
        const w2 = wave[i] * 0.3 + Math.sin((i / W) * Math.PI * 6 + ts * 0.02) * 0.25 + Math.sin((i / W) * Math.PI * 11 + ts * 0.03) * 0.12;
        const sy = midY - 20 * (H / 484) - w2 * (H * 0.25);
        if (i === 0) ctx.moveTo(i, sy);
        else ctx.lineTo(i, sy);
      }
      ctx.strokeStyle = palette.orange;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = palette.orange;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Trigger indicator
    const trigX = W * 0.15;
    const trigR = 6 * (H / 484);
    const trigH = 12 * (H / 484);
    ctx.fillStyle = palette.primary;
    ctx.fillRect(trigX - 0.5, midY - trigH / 2, 1, trigH);
    ctx.fillStyle = rgba(palette.primary, 0.3);
    ctx.beginPath();
    ctx.arc(trigX, midY, trigR, 0, Math.PI * 2);
    ctx.fill();

  }

  const stopAnimation = startAnimationLoop({ element: canvas, fps: 30, onFrame: tick });

  return () => {
    ro.disconnect();
    stopAnimation();
  };
}

// ─── component ────────────────────────────────────────────────────

export function SpotifyVisualizerWidget() {
  const { size, settings } = useWidget();
  const creds = spotifyCredsFrom(settings);
  const { data, refresh } = usePolling<NowPlayingData>(POLL_URL, POLL_MS, creds);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef("");
  const isPlayingRef = useRef(false);

  const [controlErr, setControlErr] = useState<string | null>(null);

  const compact = size === "S";
  const showFooter = size === "L";

  // Keep refs in sync with latest poll data
  useEffect(() => {
    trackRef.current = data?.trackName ?? "";
    isPlayingRef.current = data?.isPlaying ?? false;
  }, [data]);

  // Canvas animation (mount once)
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    return runCanvas(canvas, stage, trackRef, isPlayingRef);
  }, []);

  const control = async (action: PlayerAction) => {
    setControlErr(null);
    setControlErr(await sendControl(action, refresh, creds));
  };

  const progressPercent = data?.progressMs != null && data.durationMs
    ? Math.min(100, Math.max(0, (data.progressMs / data.durationMs) * 100))
    : 0;
  const elapsed = fmtMs(data?.progressMs ?? 0);
  const duration = fmtMs(data?.durationMs ?? 0);

  // ── S: compact ──────────────────────────────────────────────────
  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div
            ref={stageRef}
            style={{
              background: "var(--bg-nested)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              flex: 1,
              minHeight: 48,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <canvas ref={canvasRef} style={{ display: "block", height: "100%", width: "100%" }} />
            <div style={{
              background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)",
              inset: 0, pointerEvents: "none", position: "absolute", zIndex: 2,
            }} />
            <div style={{
              background: "radial-gradient(ellipse at 60% 30%, rgba(255,255,255,0.02) 0%, transparent 60%)",
              inset: 0, pointerEvents: "none", position: "absolute", zIndex: 3,
            }} />
            <span style={{ ...cornerBadgeStyle, left: 6, bottom: 6 }}>{data?.trackName ?? "—"}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── M / L: standard + rich ─────────────────────────────────────
  const albumArt = data?.albumArtUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote Spotify art is already delivered at thumbnail size
    <img src={data.albumArtUrl} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <Music size={showFooter ? 20 : 16} strokeWidth={1.75} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: showFooter ? 10 : 8, padding: showFooter ? "4px 12px 10px" : "4px 12px 10px", minHeight: 0 }}>
        <div
          ref={stageRef}
          style={{
            background: "var(--bg-nested)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            flex: "none",
            aspectRatio: "2.4 / 1",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <canvas ref={canvasRef} style={{ display: "block", height: "100%", width: "100%" }} />
          <div style={{
            background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)",
            inset: 0, pointerEvents: "none", position: "absolute", zIndex: 2,
          }} />
          <div style={{
            background: "radial-gradient(ellipse at 60% 30%, rgba(255,255,255,0.02) 0%, transparent 60%)",
            inset: 0, pointerEvents: "none", position: "absolute", zIndex: 3,
          }} />
          <span style={{ ...cornerBadgeStyle, left: 8, top: 6 }}>X-Y</span>
          <span style={{ ...cornerBadgeStyle, right: 8, top: 6 }}>
            {data?.isPlaying ? "LIVE" : "IDLE"}
          </span>
        </div>

        <div style={{ alignItems: "center", display: "flex", gap: showFooter ? 12 : 10, minHeight: 0 }}>
          <div style={{
            alignItems: "center",
            background: "var(--bg-nested)",
            border: "1.5px solid var(--border)",
            borderRadius: 6,
            display: "flex",
            flex: "none",
            height: showFooter ? 48 : 40,
            justifyContent: "center",
            overflow: "hidden",
            width: showFooter ? 48 : 40,
          }}>
            {albumArt}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: showFooter ? "0.85rem" : "0.75rem",
              fontWeight: 500,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {data?.trackName ?? "—"}
            </div>
            <div style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: "0.62rem",
              lineHeight: 1.3,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {data?.artist ?? "spotify idle"}
              {data && !data.isPlaying && data.playedAt && (
                <span style={{ color: "var(--text-muted-dim)" }}>
                  {" · "}last played
                </span>
              )}
            </div>
          </div>
          {showFooter && (
            <div style={{ alignItems: "center", display: "flex", flex: "none", gap: 6 }}>
              {controlErr && (
                <span style={{ color: "var(--accent-orange)", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "0.5rem", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {controlErr}
                </span>
              )}
              <button
                type="button"
                aria-label="previous track"
                disabled={!data}
                onClick={() => control("previous")}
                style={{
                  background: "var(--bg-nested)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 8,
                  color: data ? "var(--text-primary)" : "var(--text-muted-dim)",
                  cursor: data ? "pointer" : "default",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  opacity: data ? 1 : 0.55,
                  padding: 0,
                  width: 34,
                }}
              >
                <ChevronLeft size={16} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                aria-label={data?.isPlaying ? "pause" : "play"}
                disabled={!data}
                onClick={() => control(data?.isPlaying ? "pause" : "play")}
                style={{
                  background: "var(--bg-nested)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 8,
                  color: data ? "var(--text-primary)" : "var(--text-muted-dim)",
                  cursor: data ? "pointer" : "default",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  opacity: data ? 1 : 0.55,
                  padding: 0,
                  width: 34,
                }}
              >
                {data?.isPlaying ? <Pause size={16} strokeWidth={2.25} /> : <Play size={16} strokeWidth={2.25} />}
              </button>
              <button
                type="button"
                aria-label="next track"
                disabled={!data}
                onClick={() => control("next")}
                style={{
                  background: "var(--bg-nested)",
                  border: "1.5px solid var(--border)",
                  borderRadius: 8,
                  color: data ? "var(--text-primary)" : "var(--text-muted-dim)",
                  cursor: data ? "pointer" : "default",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 34,
                  opacity: data ? 1 : 0.55,
                  padding: 0,
                  width: 34,
                }}
              >
                <ChevronRight size={16} strokeWidth={2.25} />
              </button>
            </div>
          )}
        </div>

        {showFooter && (
          <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <span style={{
              color: "var(--text-muted-dim)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: "0.55rem",
              flex: "none",
            }}>
              {elapsed}
            </span>
            <div style={{
              background: "var(--bg-nested)",
              border: "1px solid var(--border)",
              borderRadius: 99,
              flex: 1,
              height: 6,
              overflow: "hidden",
            }}>
              <div style={{
                background: data?.isPlaying
                  ? "linear-gradient(90deg, var(--accent-cyan), var(--accent-orange))"
                  : "var(--accent-cyan)",
                borderRadius: 99,
                height: "100%",
                transition: "width 0.3s ease",
                width: `${data ? progressPercent : 0}%`,
              }} />
            </div>
            <span style={{
              color: "var(--text-muted-dim)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: "0.55rem",
              flex: "none",
            }}>
              {duration}
            </span>
          </div>
        )}
      </div>

      {showFooter && (
        <div style={{
          alignItems: "center",
          borderTop: "1px solid var(--border)",
          color: "var(--text-muted-dim)",
          display: "flex",
          flex: "none",
          fontFamily: "var(--font-dot-gothic), monospace",
          fontSize: "0.65rem",
          justifyContent: "space-between",
          letterSpacing: "0.12em",
          padding: "7px 16px 9px",
        }}>
          <span>VISUALIZER · {data?.isPlaying ? "LIVE" : "IDLE"}</span>
          <span>{data ? `${data.trackName}` : "—"}</span>
        </div>
      )}
    </div>
  );
}
