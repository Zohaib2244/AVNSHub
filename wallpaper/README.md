# AVN Hub — Wallpaper Engine build

A static-export, serverless build of AVN Hub for use as a [Wallpaper
Engine](https://www.wallpaperengine.io/) "Web" wallpaper. See the root
[`CLAUDE.md`](../CLAUDE.md) for the architecture/decisions behind this — short
version: no API routes, no secrets, no Node-only widgets (System Stats,
NutBot's real shell/chat/creator, Spotify/Steam/GitHub). NutBot is a plain
idle mascot here, and "Now Playing" reads Windows' OS-level media session via
Wallpaper Engine's own API instead of the Spotify Web API — works with
whatever's actually playing, no API key needed.

## Build

```bash
cd wallpaper
npm install
npm run build
```

Produces `out/` — a folder of static HTML/CSS/JS with no server dependency.

## Install as a wallpaper

1. Open Wallpaper Engine → **Create wallpaper** → **Web**.
2. Drag `wallpaper/out/index.html` onto the import dialog (it pulls in
   everything under `out/` alongside it).
3. Apply it. A **Color palette** property appears in Wallpaper Engine's own
   wallpaper settings panel (not in the wallpaper itself) — wired straight to
   the same palette packs the main dashboard uses.

## What's live vs. read-only

- **Clickable**: theme mode (light/auto/dark, in the clock card), the canvas
  pill row (top), Ambient Sound's play/pause.
- **Reactive, real data, no server**: Audio Pulse / Audio Visualizer (system
  audio via `wallpaperRegisterAudioListener`), Now Playing (OS media session
  via `wallpaperRegisterMediaPropertiesListener` and friends), pauses/dims
  when Wallpaper Engine reports the wallpaper isn't visible (`setPaused`).
- **Everything else** (identity, quicklinks, session tracker, uptime
  milestones, NutBot's idle face) is read-only display, same as the main
  dashboard's content just without edit mode around it.

## Local dev without Wallpaper Engine installed

`npm run dev` and open `http://localhost:3000` (or just open a built
`out/index.html` directly in a browser) — every Wallpaper Engine API in
[`lib/wallpaperEngineBridge.ts`](../lib/wallpaperEngineBridge.ts) no-ops
safely when `window.wallpaperPropertyListener` doesn't exist, so the page
renders its idle/fallback state instead of throwing.
