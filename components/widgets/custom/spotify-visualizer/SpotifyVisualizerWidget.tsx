"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Music, Pause, Play } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";
import type { NowPlaying as NowPlayingData } from "@/lib/spotify";

const POLL_URL = "/api/now-playing";
const POLL_MS = 30_000;

type Style = "bars" | "wave" | "pulse";
type Scheme = "orange" | "cyan" | "duotone";
type Intensity = "low" | "medium" | "high";

const INTENSITY_AMP: Record<Intensity, number> = {
  low: 0.35,
  medium: 0.62,
  high: 0.9,
};

const INTENSITY_SPEED: Record<Intensity, number> = {
  low: 0.7,
  medium: 1.1,
  high: 1.6,
};

function colorForBar(scheme: Scheme, ratio: number) {
  if (scheme === "orange") return "var(--accent-orange)";
  if (scheme === "cyan") return "var(--accent-cyan)";
  return ratio < 0.5 ? "var(--accent-cyan)" : "var(--accent-orange)";
}

function useAnimatedSeed(active: boolean, speed: number) {
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const loop = (t: number) => {
      const last = lastRef.current || t;
      const delta = (t - last) / 1000;
      lastRef.current = t;
      setTick((prev) => prev + delta * speed);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = 0;
    };
  }, [active, speed]);

  return tick;
}

function barHeight(index: number, count: number, tick: number, amp: number, isPlaying: boolean) {
  if (!isPlaying) return 0.08;
  const phase = index * 0.45;
  const w1 = Math.sin(tick * 2 + phase) * 0.5 + 0.5;
  const w2 = Math.sin(tick * 3.7 + phase * 1.5 + index) * 0.5 + 0.5;
  const w3 = Math.sin(tick * 5.3 + phase * 0.6) * 0.5 + 0.5;
  const center = 1 - Math.abs(index / Math.max(count - 1, 1) - 0.5) * 0.7;
  const value = (w1 * 0.5 + w2 * 0.3 + w3 * 0.2) * center;
  return Math.max(0.05, Math.min(1, 0.1 + value * amp));
}

function Visualizer({
  data,
  style,
  scheme,
  intensity,
  bars,
  height,
}: {
  data: NowPlayingData | undefined;
  style: Style;
  scheme: Scheme;
  intensity: Intensity;
  bars: number;
  height: number;
}) {
  const isPlaying = !!data?.isPlaying;
  const tick = useAnimatedSeed(isPlaying, INTENSITY_SPEED[intensity]);
  const amp = INTENSITY_AMP[intensity];

  const items = useMemo(() => Array.from({ length: bars }, (_, i) => i), [bars]);

  if (style === "pulse") {
    const scale = isPlaying
      ? 0.85 + (Math.sin(tick * 2.5) * 0.5 + 0.5) * 0.25 * amp
      : 0.92;
    const opacity = isPlaying ? 0.75 + (Math.sin(tick * 4) * 0.5 + 0.5) * 0.25 : 0.5;
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            width: height * 0.85,
            height: height * 0.85,
            borderRadius: "50%",
            background: "var(--bg-nested)",
            border: `1.5px solid ${colorForBar(scheme, 0.2)}`,
            transform: `scale(${scale})`,
            opacity,
            transition: isPlaying ? "none" : "all 0.4s ease",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: height * 0.55,
            height: height * 0.55,
            borderRadius: "50%",
            border: "1.5px solid var(--border)",
            background: "var(--bg-nested)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colorForBar(scheme, 0.8),
          }}
        >
          {isPlaying ? <Play size={height * 0.18} strokeWidth={1.75} /> : <Pause size={height * 0.18} strokeWidth={1.75} />}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        padding: "0 2px",
      }}
    >
      {items.map((i) => {
        const ratio = bars > 1 ? i / (bars - 1) : 0.5;
        const h = barHeight(i, bars, tick, amp, isPlaying);
        const color = colorForBar(scheme, ratio);
        if (style === "wave") {
          const dotSize = Math.max(3, height * 0.08);
          return (
            <span
              key={i}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: color,
                transform: `translateY(${(0.5 - h) * (height - dotSize)}px)`,
                opacity: isPlaying ? 0.9 : 0.35,
                transition: isPlaying ? "none" : "all 0.3s ease",
              }}
            />
          );
        }
        return (
          <span
            key={i}
            style={{
              flex: 1,
              height: `${h * 100}%`,
              minHeight: 2,
              background: color,
              borderRadius: 2,
              opacity: isPlaying ? 0.95 : 0.35,
              transition: isPlaying ? "none" : "height 0.3s ease, opacity 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
}

export function SpotifyVisualizerWidget() {
  const { size, settings } = useWidget();
  const { data } = usePolling<NowPlayingData>(POLL_URL, POLL_MS);

  const style: Style = (["bars", "wave", "pulse"] as const).includes(settings.style as Style)
    ? (settings.style as Style)
    : "bars";
  const scheme: Scheme = (["orange", "cyan", "duotone"] as const).includes(settings.scheme as Scheme)
    ? (settings.scheme as Scheme)
    : "duotone";
  const intensity: Intensity = (["low", "medium", "high"] as const).includes(settings.intensity as Intensity)
    ? (settings.intensity as Intensity)
    : "medium";
  const rawBars = Number(settings.bars);
  const bars = Number.isFinite(rawBars) ? Math.min(64, Math.max(6, Math.round(rawBars))) : 24;

  const trackLine = data ? `${data.trackName} - ${data.artist}` : "spotify idle";

  if (size === "S") {
    const sBars = Math.min(bars, 14);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
        <div
          className="block-label"
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <Music size={11} strokeWidth={1.75} />
          visualizer
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Visualizer
            data={data}
            style={style}
            scheme={scheme}
            intensity={intensity}
            bars={sBars}
            height={48}
          />
        </div>
        <div
          className="block-sub"
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: "0.65rem",
          }}
        >
          {data?.isPlaying ? data?.trackName ?? "--" : data?.trackName ?? "idle"}
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <div
          className="block-label"
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <Music size={12} strokeWidth={1.75} />
          spotify visualizer
        </div>
        <div style={{ flex: 1, minHeight: 60 }}>
          <Visualizer
            data={data}
            style={style}
            scheme={scheme}
            intensity={intensity}
            bars={bars}
            height={72}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            className="block-value"
            style={{
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data?.trackName ?? "--"}
          </div>
          <div
            className="block-sub"
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data?.isPlaying ? data?.artist : trackLine}
          </div>
        </div>
      </div>
    );
  }

  const progressPercent =
    data?.progressMs != null && data.durationMs
      ? Math.min(100, Math.max(0, (data.progressMs / data.durationMs) * 100))
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <div
        className="block-label"
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        <Music size={12} strokeWidth={1.75} />
        spotify visualizer
        {data?.isPlaying && (
          <span
            style={{
              marginLeft: 6,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent-orange)",
              display: "inline-block",
            }}
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 12,
            border: "1.5px solid var(--border)",
            background: "var(--bg-nested)",
            overflow: "hidden",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
          }}
        >
          {data?.albumArtUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.albumArtUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Music size={26} strokeWidth={1.75} />
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div
            className="block-value accent"
            style={{
              fontSize: "1.05rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data?.trackName ?? "--"}
          </div>
          <div
            className="block-sub"
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {data?.artist ?? "spotify idle"}
          </div>
          <div
            style={{
              marginTop: "auto",
              height: 4,
              borderRadius: 2,
              background: "var(--bg-nested)",
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: "100%",
                background: "var(--accent-orange)",
                transition: "width 0.3s linear",
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 80 }}>
        <Visualizer
          data={data}
          style={style}
          scheme={scheme}
          intensity={intensity}
          bars={bars}
          height={110}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          borderTop: "1.5px solid var(--border)",
          paddingTop: 8,
        }}
      >
        <span className="block-sub" style={{ fontSize: "0.6rem" }}>
          style - <span style={{ color: "var(--text-primary)" }}>{style}</span>
        </span>
        <span className="block-sub" style={{ fontSize: "0.6rem" }}>
          bars - <span style={{ color: "var(--text-primary)" }}>{bars}</span>
        </span>
        <span className="block-sub" style={{ fontSize: "0.6rem" }}>
          intensity - <span style={{ color: "var(--text-primary)" }}>{intensity}</span>
        </span>
      </div>
    </div>
  );
}
