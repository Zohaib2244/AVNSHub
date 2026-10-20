"use client";

// Compact ambient indicator for the Wallpaper Engine build — a single glow
// dot that pulses with system-wide audio (window.wallpaperRegisterAudioListener,
// see lib/wallpaperEngineBridge.ts). Outside Wallpaper Engine the audio array
// stays all-zero, so this just idles at its baseline glow — never throws.
//
// Uses direct DOM mutation per animation frame via a ref, not React state, so
// the pulse never triggers a re-render.

import { useEffect, useRef } from "react";
import { AudioLines } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { subscribeWallpaperAudio, getWallpaperAudio, useWallpaperPaused } from "@/lib/wallpaperEngineBridge";
import { startAnimationLoop } from "@/lib/animationLoop";

const BASELINE_SCALE = 1;
const BASELINE_OPACITY = 0.35;

export function AudioPulse() {
  const { size } = useWidget();
  const paused = useWallpaperPaused();
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) {
      dotRef.current?.style.setProperty("transform", `scale(${BASELINE_SCALE})`);
      dotRef.current?.style.setProperty("opacity", String(BASELINE_OPACITY));
      return;
    }
    const dot = dotRef.current;
    if (!dot) return;

    function tick() {
      const samples = getWallpaperAudio();
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += Math.abs(samples[i] ?? 0);
      const level = Math.min(1, sum / samples.length);
      const scale = BASELINE_SCALE + level * 0.6;
      const opacity = Math.min(1, BASELINE_OPACITY + level * 0.65);
      dotRef.current?.style.setProperty("transform", `scale(${scale})`);
      dotRef.current?.style.setProperty("opacity", String(opacity));
    }
    const stopAnimation = startAnimationLoop({ element: dot, fps: 30, onFrame: tick });
    const unsubscribe = subscribeWallpaperAudio(() => {});

    return () => {
      stopAnimation();
      unsubscribe();
    };
  }, [paused]);

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: "100%",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <div
        ref={dotRef}
        style={{
          alignItems: "center",
          background: "var(--accent-orange)",
          borderRadius: "50%",
          display: "flex",
          height: size === "S" ? 28 : 36,
          justifyContent: "center",
          opacity: BASELINE_OPACITY,
          transform: `scale(${BASELINE_SCALE})`,
          transition: "transform 0.05s linear, opacity 0.05s linear",
          width: size === "S" ? 28 : 36,
        }}
      >
        <AudioLines size={size === "S" ? 14 : 18} strokeWidth={1.75} color="var(--bg-card)" />
      </div>
      {size !== "S" && (
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
          audio pulse
        </div>
      )}
    </div>
  );
}
