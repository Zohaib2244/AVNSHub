"use client";

// Renders the active canvas's wallpaper (image or short looping video, if
// any) as a fixed full-bleed layer behind everything. In "solid" canvas
// backdrop mode (the default) it's invisible since .frame's opaque
// background fully covers it — see the data-backdrop CSS in globals.css for
// how blur/transparent modes reveal it.
//
// Parallax (opt-in, lib/wallpaper.ts's getParallax) nudges this layer's
// transform toward the mouse position. Applied via a direct ref mutation in
// the mousemove handler rather than React state, so cursor movement never
// triggers a re-render — CSS handles the smoothing (see .wallpaper-layer's
// transition in globals.css).

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  applyBackdropModes,
  getParallax,
  getServerParallax,
  getServerWallpaperKind,
  getServerWallpaperUrl,
  getWallpaperKind,
  getWallpaperUrl,
  subscribeWallpaper,
} from "@/lib/wallpaper";

const PARALLAX_MAX_SHIFT_PX = 22;
// scaled up while parallax is active so panning never reveals the edge of
// the image/video underneath the viewport
const PARALLAX_SCALE = 1.08;

export function WallpaperLayer() {
  const url = useSyncExternalStore(subscribeWallpaper, getWallpaperUrl, getServerWallpaperUrl);
  const kind = useSyncExternalStore(subscribeWallpaper, getWallpaperKind, getServerWallpaperKind);
  const parallax = useSyncExternalStore(subscribeWallpaper, getParallax, getServerParallax);
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    applyBackdropModes();
  }, [url]);

  useEffect(() => {
    if (!parallax) {
      elRef.current?.style.removeProperty("transform");
      return;
    }

    elRef.current?.style.setProperty("transform", `translate(0, 0) scale(${PARALLAX_SCALE})`);

    function onMouseMove(e: MouseEvent) {
      const fracX = e.clientX / window.innerWidth - 0.5;
      const fracY = e.clientY / window.innerHeight - 0.5;
      const x = (-fracX * PARALLAX_MAX_SHIFT_PX * 2).toFixed(1);
      const y = (-fracY * PARALLAX_MAX_SHIFT_PX * 2).toFixed(1);
      elRef.current?.style.setProperty("transform", `translate(${x}px, ${y}px) scale(${PARALLAX_SCALE})`);
    }

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [parallax]);

  if (url && kind === "video") {
    return (
      <video
        ref={(node) => { elRef.current = node; }}
        className="wallpaper-layer"
        src={url}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }

  return (
    <div
      ref={(node) => { elRef.current = node; }}
      className="wallpaper-layer"
      style={url ? { backgroundImage: `url(${url})` } : undefined}
    />
  );
}
