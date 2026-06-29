"use client";

// "Now playing" for the Wallpaper Engine build — reads Windows' OS-level
// Global Media Session via Wallpaper Engine's media integration API
// (lib/wallpaperEngineBridge.ts's useWallpaperMedia()) instead of the Spotify
// Web API. Works for whatever is actually playing on the system (Spotify
// desktop app, a browser tab, anything), with zero API keys and no server —
// the wallpaper-mode replacement for the main app's now-playing widget.
// Outside Wallpaper Engine this just shows the idle state.

import { Music, Pause, Play } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { useWallpaperMedia } from "@/lib/wallpaperEngineBridge";

export function MediaNowPlaying() {
  const { size } = useWidget();
  const media = useWallpaperMedia();
  const isPlaying = media.state === "playing";
  const progressPercent =
    media.positionSec != null && media.durationSec ? Math.min(100, Math.max(0, (media.positionSec / media.durationSec) * 100)) : 0;

  const artFrame = (
    <div
      style={{
        alignItems: "center",
        background: "var(--bg-nested)",
        border: "1.5px solid var(--border)",
        borderRadius: 10,
        display: "flex",
        flexShrink: 0,
        height: size === "S" ? 32 : 44,
        justifyContent: "center",
        overflow: "hidden",
        width: size === "S" ? 32 : 44,
      }}
    >
      {media.artBase64 ? (
        // eslint-disable-next-line @next/next/no-img-element -- base64 data URI from WE's media API, not an optimizable remote image
        <img src={`data:image/png;base64,${media.artBase64}`} alt="" style={{ height: "100%", objectFit: "cover", width: "100%" }} />
      ) : (
        <Music size={size === "S" ? 14 : 18} strokeWidth={1.75} color="var(--text-muted)" />
      )}
    </div>
  );

  if (size === "S") {
    return (
      <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 6, height: "100%", justifyContent: "center", textAlign: "center" }}>
        {artFrame}
        <div
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: "0.68rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
        >
          {media.title ?? "—"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 }}>
      <div
        className="block-label"
        style={{
          alignItems: "center",
          color: "var(--text-muted)",
          display: "flex",
          fontFamily: "var(--font-dot-gothic), monospace",
          fontSize: "0.6rem",
          gap: 5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <Music size={12} strokeWidth={1.75} />
        now playing
      </div>

      <div style={{ alignItems: "center", display: "flex", gap: 10, minWidth: 0 }}>
        {artFrame}
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: "0.85rem",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {media.title ?? "—"}
          </div>
          <div
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: "0.7rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {media.artist ?? (isPlaying ? "" : "nothing playing")}
          </div>
        </div>
        {isPlaying ? <Pause size={14} strokeWidth={1.75} color="var(--accent-orange)" /> : <Play size={14} strokeWidth={1.75} color="var(--text-muted)" />}
      </div>

      {media.durationSec != null && (
        <div style={{ background: "var(--bg-nested)", borderRadius: 4, height: 4, overflow: "hidden", width: "100%" }}>
          <div style={{ background: "var(--accent-orange)", height: "100%", width: `${progressPercent}%` }} />
        </div>
      )}
    </div>
  );
}
