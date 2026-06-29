"use client";

// Full bar/spectrum visualizer for the Wallpaper Engine build — same idea as
// AudioPulse but a fuller display, driven by the same system-wide audio feed
// (window.wallpaperRegisterAudioListener via lib/wallpaperEngineBridge.ts).
// Buckets the 128-float left/right band array into N bars and mutates bar
// heights directly per animation frame (no React state), mirroring
// AmbientSoundWidget's VisualizerBars/startVisualizer technique.

import { useEffect, useRef } from "react";
import { useWidget } from "@/components/framework/WidgetContext";
import { subscribeWallpaperAudio, getWallpaperAudio, useWallpaperPaused } from "@/lib/wallpaperEngineBridge";

const BASELINE_PCT = 6;

function Bars({ count, barRefs }: { count: number; barRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  return (
    <div style={{ alignItems: "flex-end", display: "flex", gap: 3, height: "100%", minWidth: 0, width: "100%" }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          ref={(node) => {
            barRefs.current[i] = node;
          }}
          style={{
            background: "var(--accent-orange)",
            borderRadius: 2,
            flex: 1,
            height: `${BASELINE_PCT}%`,
            minWidth: 2,
          }}
        />
      ))}
    </div>
  );
}

export function AudioVisualizer() {
  const { size } = useWidget();
  const paused = useWallpaperPaused();
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const barCount = size === "L" ? 28 : size === "M" ? 18 : 10;

  useEffect(() => {
    if (paused) {
      barRefs.current.forEach((bar) => bar?.style.setProperty("height", `${BASELINE_PCT}%`));
      return;
    }

    function tick() {
      const samples = getWallpaperAudio();
      // left channel only (buckets 0-62) is plenty for a desktop visualizer
      const channel = samples.slice(0, 63);
      const binsPerBar = Math.max(1, Math.floor(channel.length / barCount));
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < binsPerBar; j++) sum += Math.abs(channel[i * binsPerBar + j] ?? 0);
        const pct = Math.max(BASELINE_PCT, Math.min(100, (sum / binsPerBar) * 100));
        barRefs.current[i]?.style.setProperty("height", `${pct}%`);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    const unsubscribe = subscribeWallpaperAudio(() => {});

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      unsubscribe();
    };
  }, [paused, barCount]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0 }}>
      <div
        className="block-label"
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-dot-gothic), monospace",
          fontSize: "0.6rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        audio visualizer
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Bars count={barCount} barRefs={barRefs} />
      </div>
    </div>
  );
}
