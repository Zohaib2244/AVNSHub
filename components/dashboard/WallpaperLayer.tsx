"use client";

// Renders the active canvas's wallpaper image (if any) as a fixed full-bleed
// layer behind everything. In "solid" backdrop mode (the default) it's
// invisible since body's opaque background fully covers it — see the
// data-backdrop CSS in globals.css for how blur/transparent modes reveal it.

import { useEffect, useSyncExternalStore } from "react";
import {
  applyBackdropModes,
  getServerWallpaperUrl,
  getWallpaperUrl,
  subscribeWallpaper,
} from "@/lib/wallpaper";

export function WallpaperLayer() {
  const url = useSyncExternalStore(subscribeWallpaper, getWallpaperUrl, getServerWallpaperUrl);

  useEffect(() => {
    applyBackdropModes();
  }, [url]);

  return (
    <div
      className="wallpaper-layer"
      style={url ? { backgroundImage: `url(${url})` } : undefined}
    />
  );
}
