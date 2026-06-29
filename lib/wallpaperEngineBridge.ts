"use client";

import { useSyncExternalStore } from "react";

// Thin typed wrapper around the globals Wallpaper Engine injects into a web
// wallpaper's page (docs.wallpaperengine.io/en/web/api/propertylistener.html,
// .../web/audio/visualizer.html, .../web/audio/media.html). Every subscribe
// function no-ops safely when the corresponding WE global isn't present —
// i.e. when this code runs in a normal browser tab (local dev of the
// `wallpaper/` app without Wallpaper Engine installed) — so widgets built on
// this module degrade to their idle state instead of throwing.
//
// Same external-store shape as lib/theme.ts / lib/nutbotSignal.ts: module
// cache + listener Set, read via useSyncExternalStore in consumer hooks.

declare global {
  interface Window {
    wallpaperPropertyListener?: {
      applyUserProperties?: (properties: Record<string, { value: unknown }>) => void;
      applyGeneralProperties?: (properties: Record<string, unknown>) => void;
      setPaused?: (isPaused: boolean) => void;
    };
    wallpaperRegisterAudioListener?: (cb: (audioArray: number[]) => void) => void;
    wallpaperRegisterMediaStatusListener?: (cb: (enabled: boolean) => void) => void;
    wallpaperRegisterMediaPropertiesListener?: (cb: (props: RawMediaProperties) => void) => void;
    wallpaperRegisterMediaThumbnailListener?: (cb: (thumbnailBase64: string) => void) => void;
    wallpaperRegisterMediaPlaybackListener?: (cb: (playback: { state?: string }) => void) => void;
    wallpaperRegisterMediaTimelineListener?: (cb: (timeline: { position?: number; duration?: number }) => void) => void;
  }
}

type RawMediaProperties = {
  title?: string;
  artist?: string;
  album?: string;
  subtitle?: string;
};

export type MediaPlaybackState = "playing" | "paused" | "stopped";

export type WallpaperMedia = {
  title: string | null;
  artist: string | null;
  album: string | null;
  artBase64: string | null;
  state: MediaPlaybackState;
  positionSec: number | null;
  durationSec: number | null;
};

const EMPTY_MEDIA: WallpaperMedia = {
  title: null,
  artist: null,
  album: null,
  artBase64: null,
  state: "stopped",
  positionSec: null,
  durationSec: null,
};

/** true once any code has asked for it — avoids paying the FFT-stream cost
    when nothing on the wallpaper actually uses audio data (WE only sends
    samples to wallpapers that register a listener). */
let audioHooked = false;
let audioData: number[] = new Array(128).fill(0);
const audioListeners = new Set<() => void>();

function hookAudio() {
  if (audioHooked) return;
  audioHooked = true;
  if (typeof window === "undefined" || !window.wallpaperRegisterAudioListener) return;
  // must register at top-level script load per WE docs — calling this lazily
  // (e.g. inside a React effect on first mount) is still "top-level enough"
  // since it happens long before window.onload in practice, but never defer
  // it behind a timeout.
  window.wallpaperRegisterAudioListener((samples) => {
    audioData = samples;
    audioListeners.forEach((listener) => listener());
  });
}

export function subscribeWallpaperAudio(listener: () => void) {
  hookAudio();
  audioListeners.add(listener);
  return () => {
    audioListeners.delete(listener);
  };
}

export function getWallpaperAudio(): number[] {
  return audioData;
}

const EMPTY_AUDIO: number[] = new Array(128).fill(0);

export function getServerWallpaperAudio(): number[] {
  return EMPTY_AUDIO;
}

let mediaHooked = false;
let media: WallpaperMedia = EMPTY_MEDIA;
const mediaListeners = new Set<() => void>();

function emitMedia(patch: Partial<WallpaperMedia>) {
  media = { ...media, ...patch };
  mediaListeners.forEach((listener) => listener());
}

function hookMedia() {
  if (mediaHooked) return;
  mediaHooked = true;
  if (typeof window === "undefined") return;

  window.wallpaperRegisterMediaStatusListener?.((enabled) => {
    if (!enabled) emitMedia(EMPTY_MEDIA);
  });
  window.wallpaperRegisterMediaPropertiesListener?.((props) => {
    emitMedia({ title: props.title ?? null, artist: props.artist ?? null, album: props.album ?? null });
  });
  window.wallpaperRegisterMediaThumbnailListener?.((thumbnailBase64) => {
    emitMedia({ artBase64: thumbnailBase64 || null });
  });
  window.wallpaperRegisterMediaPlaybackListener?.((playback) => {
    const state: MediaPlaybackState =
      playback.state === "playing" || playback.state === "paused" ? playback.state : "stopped";
    emitMedia({ state });
  });
  window.wallpaperRegisterMediaTimelineListener?.((timeline) => {
    emitMedia({ positionSec: timeline.position ?? null, durationSec: timeline.duration ?? null });
  });
}

export function subscribeWallpaperMedia(listener: () => void) {
  hookMedia();
  mediaListeners.add(listener);
  return () => {
    mediaListeners.delete(listener);
  };
}

export function getWallpaperMedia(): WallpaperMedia {
  return media;
}

export function getServerWallpaperMedia(): WallpaperMedia {
  return EMPTY_MEDIA;
}

let pausedHooked = false;
let paused = false;
const pausedListeners = new Set<() => void>();

function hookPaused() {
  if (pausedHooked) return;
  pausedHooked = true;
  if (typeof window === "undefined") return;
  window.wallpaperPropertyListener = {
    ...window.wallpaperPropertyListener,
    setPaused: (isPaused) => {
      paused = isPaused;
      pausedListeners.forEach((listener) => listener());
    },
  };
}

export function subscribeWallpaperPaused(listener: () => void) {
  hookPaused();
  pausedListeners.add(listener);
  return () => {
    pausedListeners.delete(listener);
  };
}

export function isWallpaperPaused(): boolean {
  return paused;
}

export function getServerWallpaperPaused(): boolean {
  return false;
}

/** true when actually running inside Wallpaper Engine's renderer, as opposed
    to a normal browser tab viewing the static export during local dev. */
export function isInsideWallpaperEngine(): boolean {
  return typeof window !== "undefined" && window.wallpaperPropertyListener !== undefined;
}

let propertiesHooked = false;

/** Wires project.json's user properties (the panel WE renders in its own UI,
    outside the wallpaper's DOM) to real behavior — currently just the
    `palette` combo → lib/theme.ts's setPalette(). Call once; safe to call
    from multiple components (idempotent), merges onto wallpaperPropertyListener
    the same way hookPaused() does so neither hook clobbers the other. */
export function hookWallpaperProperties(onPalette: (id: string) => void) {
  if (propertiesHooked) return;
  propertiesHooked = true;
  if (typeof window === "undefined") return;
  window.wallpaperPropertyListener = {
    ...window.wallpaperPropertyListener,
    applyUserProperties: (properties) => {
      const palette = properties.palette?.value;
      if (typeof palette === "string") onPalette(palette);
    },
  };
}

/** raw 128-float band (0–62 = left channel, 64–127 = right) — widgets reduce
    it themselves (average for a pulse, bucket it for a bar visualizer). */
export function useWallpaperAudio(): number[] {
  return useSyncExternalStore(subscribeWallpaperAudio, getWallpaperAudio, getServerWallpaperAudio);
}

export function useWallpaperMedia(): WallpaperMedia {
  return useSyncExternalStore(subscribeWallpaperMedia, getWallpaperMedia, getServerWallpaperMedia);
}

/** true while Wallpaper Engine has paused rendering (e.g. a fullscreen app has
    focus) — gate requestAnimationFrame loops and polling on this so the
    wallpaper doesn't burn CPU/GPU when nobody can see it. */
export function useWallpaperPaused(): boolean {
  return useSyncExternalStore(subscribeWallpaperPaused, isWallpaperPaused, getServerWallpaperPaused);
}
