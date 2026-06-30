"use client";

// The Wallpaper Engine build's entire UI — deliberately not the Slot Layout
// dashboard (no edit mode, no drag/resize, no Hub Core panel, no per-widget
// gear settings). A short, fixed list of read-only cards plus exactly three
// live controls (theme toggle — built into ClockWidget already; the canvas
// pill row below; Ambient Sound's own play/pause), per the plan's decisions.
//
// Renders widget content components directly (bypassing config/widgets.tsx's
// registry entirely — these widgets aren't registered there since most of
// them only make sense inside actual Wallpaper Engine).

import { useEffect, useSyncExternalStore } from "react";
import { WidgetContext } from "@/components/framework/WidgetContext";
import { ClockWidget } from "@/components/widgets/default/identity/ClockWidget";
import { IdentityBlock } from "@/components/widgets/default/identity/IdentityBlock";
import { SessionTracker } from "@/components/widgets/default/identity/SessionTracker";
import { UptimeMilestonesStatic } from "@/components/widgets/default/identity/UptimeMilestonesStatic";
import { AmbientSoundWidget } from "@/components/widgets/default/ambient/AmbientSoundWidget";
import { AudioPulse } from "@/components/widgets/default/audio/AudioPulse";
import { AudioVisualizer } from "@/components/widgets/default/audio/AudioVisualizer";
import { MediaNowPlaying } from "@/components/widgets/default/audio/MediaNowPlaying";
import { NutBotMascot } from "@/components/widgets/default/nutbot/NutBotMascot";
import { CANVAS_ICONS } from "@/config/canvasIcons";
import { getCanvases, getServerCanvases, subscribeCanvases, switchCanvas, type Canvas } from "@/lib/canvases";
import { setPalette } from "@/lib/theme";
import { isPaletteId } from "@/config/themes";
import { hookWallpaperProperties } from "@/lib/wallpaperEngineBridge";
import type { WidgetSize } from "@/config/widgets";

// inlined rather than importing CanvasSwitcher.tsx's CanvasGlyph, which would
// drag in components/dashboard/LayoutProvider for no reason — this build has
// no edit mode, no LayoutProvider, and no need for it.
function CanvasGlyph({ canvas }: { canvas: Canvas }) {
  const Icon = canvas.icon ? CANVAS_ICONS[canvas.icon] : undefined;
  if (Icon) return <Icon size={14} strokeWidth={1.75} />;
  return <span>{canvas.name.trim() ? canvas.name.trim()[0].toUpperCase() : "?"}</span>;
}

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
  boxShadow: "4px 4px 0 var(--shadow)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
  padding: 14,
};

function Card({ id, size, span, children }: { id: string; size: WidgetSize; span: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ ...cardStyle, gridColumn: span }}>
      <WidgetContext.Provider value={{ id, size, orientation: "h", settings: {} }}>{children}</WidgetContext.Provider>
    </div>
  );
}

function CanvasPills() {
  const { canvases, activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);
  if (canvases.length < 2) return null;
  return (
    <div style={{ display: "flex", gap: 6, padding: "0 4px" }}>
      {canvases.map((canvas) => (
        <button
          key={canvas.id}
          type="button"
          onClick={() => switchCanvas(canvas.id)}
          aria-label={`switch to ${canvas.name}`}
          title={canvas.name}
          style={{
            alignItems: "center",
            background: canvas.id === activeId ? "var(--accent-orange)" : "var(--bg-nested)",
            border: "1.5px solid var(--border)",
            borderRadius: "50%",
            color: canvas.id === activeId ? "var(--bg-card)" : "var(--text-primary)",
            cursor: "pointer",
            display: "flex",
            height: 26,
            justifyContent: "center",
            width: 26,
          }}
        >
          <CanvasGlyph canvas={canvas} />
        </button>
      ))}
    </div>
  );
}

export function WallpaperDashboard() {
  // wires project.json's "palette" combo (rendered in Wallpaper Engine's own
  // settings panel, outside this DOM) to the same setPalette() the in-app
  // theme settings use — a no-op outside actual Wallpaper Engine.
  useEffect(() => {
    hookWallpaperProperties((id) => {
      if (isPaletteId(id)) setPalette(id);
    });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <CanvasPills />

      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(6, 1fr)",
          gridAutoRows: "minmax(120px, auto)",
        }}
      >
        <Card id="identity" size="M" span="span 2">
          <IdentityBlock />
        </Card>
        <Card id="clock" size="M" span="span 2">
          <ClockWidget />
        </Card>
        <Card id="nutbot-mascot" size="S" span="span 1">
          <NutBotMascot />
        </Card>
        <Card id="audio-pulse" size="S" span="span 1">
          <AudioPulse />
        </Card>

        <Card id="media-now-playing" size="M" span="span 2">
          <MediaNowPlaying />
        </Card>
        <Card id="audio-visualizer" size="M" span="span 2">
          <AudioVisualizer />
        </Card>
        <Card id="ambient-sound" size="M" span="span 2">
          <AmbientSoundWidget />
        </Card>

        <Card id="milestones" size="M" span="span 3">
          <UptimeMilestonesStatic />
        </Card>
        <Card id="tracker" size="M" span="span 2">
          <SessionTracker />
        </Card>
      </div>
    </div>
  );
}
