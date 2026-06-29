# Changelog

All notable changes to AVN Hub are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Maintaining this file:** add an `## [Unreleased]` entry as you work, grouped
> under **Added / Changed / Fixed / Removed**. On release, rename `Unreleased` to
> the new version with a date, bump `version` in `package.json` and the
> `BootSequence` header string, and start a fresh `Unreleased` block.

## [Unreleased]

### Added
- **Per-widget credentials in settings.** The Now Playing (Spotify), Currently Playing (Steam), and GitHub widgets now take their credentials from their own gear/settings popover instead of requiring server env vars. A new masked `password` settings field type ([`config/widgets.tsx`](config/widgets.tsx), [`components/framework/WidgetSettingsPopover.tsx`](components/framework/WidgetSettingsPopover.tsx)) hides secrets/tokens in the form. Values are stored client-side and POSTed to each widget's own API route; the server lib clients ([`lib/spotify.ts`](lib/spotify.ts), [`lib/steam.ts`](lib/steam.ts), [`lib/github.ts`](lib/github.ts)) fall back to the existing `SPOTIFY_*` / `STEAM_*` / `GITHUB_TOKEN` env vars when a field is blank, so existing `.env.local` setups keep working. Module caches are keyed by credentials so switching accounts refetches.
- **NutBot real cross-platform shell.** NutBot's terminal shell tabs are now live pseudo-terminals on the host (PowerShell on Windows, `$SHELL` on macOS/Linux) via node-pty, replacing the mock command interpreter. The pty is integrated directly into the Next app — a new SSE + POST route ([`app/api/nutbot-shell/route.ts`](app/api/nutbot-shell/route.ts)) + session hub ([`lib/nutbot/ptyHub.ts`](lib/nutbot/ptyHub.ts)) — so **no separate `npm run nutbot:shell` process or `NEXT_PUBLIC_NUTBOT_SHELL_URL` is needed**. The "+" tab opens additional independent shells; shell tabs stay mounted across tab switches so their session + scrollback persist. Set `NUTBOT_SHELL_DISABLED=true` to turn the route off (it gives anyone who can reach the UI a shell on the host — intended for the single-user/self-hosted/full-trust model).
- **NutBot chat.** A new `chat` tab in NutBot's terminal gives it an actual conversational personality, backed by a self-hosted [Bonfire](https://github.com/shahwaizse/bonfire) instance running Dolphin 3.0 Llama 3.1 8B GGUF behind llama.cpp. A new proxy route ([`app/api/nutbot-chat/route.ts`](app/api/nutbot-chat/route.ts), `NUTBOT_CHAT_URL` env var) hides the Bonfire URL and streams its NDJSON `/chat` response straight to the client. Personality and an NSFW toggle are both just system prompts ([`lib/nutbot/persona.ts`](lib/nutbot/persona.ts)), pushed into Bonfire as find-or-create presets. Web search is on by default (toggle in the chat footer); NutBot's face reacts via two new signals (`speaking`, `browsing`) in [`lib/nutbotSignal.ts`](lib/nutbotSignal.ts). Shows a graceful offline state when Bonfire isn't reachable.
- **NutBot chat backend fallback.** NutBot chat now has a shared backend preference (`chatBackend` in [`lib/prefs.ts`](lib/prefs.ts)): `auto` prefers Bonfire, then falls back through the Widget Creator's existing `claude` / `codex` / `opencode` harness chain via [`lib/nutbot/chatHarness.ts`](lib/nutbot/chatHarness.ts). Chat can also be pinned to a concrete backend or turned off. Setup lives in [`docs/NUTBOT_CHAT_SETUP.md`](docs/NUTBOT_CHAT_SETUP.md).
- **Stop helpers.** Added `npm run stop:hub`, `npm run stop:nutbot-llm`, and `npm run stop:all` to stop AVN Hub, Bonfire, and llama.cpp by their local ports without hunting through Task Manager.
- **WhatsApp bridge helper.** Added `npm run whatsapp:bridge` plus `npm run stop:whatsapp` for a local Baileys WhatsApp Web bridge with QR login, `/groups`, `/messages`, and `/send` endpoints for the WhatsApp widget.
- **Split documentation.** The root README is now a short project entry point, with focused docs for setup ([`docs/SETUP.md`](docs/SETUP.md)), feature tour ([`docs/FEATURES.md`](docs/FEATURES.md)), docs navigation ([`docs/README.md`](docs/README.md)), and NutBot local/custom LLM setup ([`docs/NUTBOT_CHAT_SETUP.md`](docs/NUTBOT_CHAT_SETUP.md)).
- **Local LLM tuning guide.** [`docs/NUTBOT_CHAT_SETUP.md`](docs/NUTBOT_CHAT_SETUP.md) now includes a repeatable workflow for finding per-machine llama.cpp settings (`--gpu-layers`, `--ctx-size`, `--parallel`) instead of copying one fixed GPU configuration.
- **Wallpaper Engine build.** A second, standalone Next.js app at [`wallpaper/`](wallpaper/) (`output: "export"`, its own `package.json`/`next.config.ts`, no `app/api`) builds AVN Hub into a static, serverless bundle for use as a [Wallpaper Engine](https://www.wallpaperengine.io/) "Web" wallpaper — `npm run build` there produces `out/`, packaged with [`wallpaper/project.json`](wallpaper/project.json). Drops every server/secret-dependent widget (Spotify/Steam/GitHub, System Stats/Disk/Network, homelab v2, NutBot's real shell/chat/creator — NutBot becomes a plain idle mascot, [`NutBotMascot.tsx`](components/widgets/default/nutbot/NutBotMascot.tsx)) in favor of new widgets built on real Wallpaper Engine JS APIs via [`lib/wallpaperEngineBridge.ts`](lib/wallpaperEngineBridge.ts): **Audio Pulse** + **Audio Visualizer** (system-wide audio via `wallpaperRegisterAudioListener`) and **Media Now Playing** (Windows' OS-level Global Media Session via WE's media-integration listeners — works with anything playing on the system, zero API keys). Theme mode, the canvas switcher, and Ambient Sound's play/pause stay clickable directly on the desktop; everything else is read-only. The bridge no-ops safely outside actual Wallpaper Engine, so the same build renders its idle state in a normal browser tab.

### Changed
- `usePolling` ([`lib/usePolling.ts`](lib/usePolling.ts)) gained an optional `body` argument: when provided the poll becomes a POST carrying that JSON (used to send per-widget credentials without putting secrets in the URL/query string/logs), and it namespaces the shared per-URL cache so widgets with different credentials don't collide.
- `node-pty` moved from devDependencies to dependencies (now used at runtime by the shell route); `next.config.ts` marks it as a `serverExternalPackages` entry so its native binary is required at runtime rather than bundled.
- The Widget Creator can now be disabled independently with `creatorEnabled`, exposed through the existing harness picker; turning it off prevents `WidgetCreatorPanel` from mounting.
- NutBot's visible widget label and idle ticker now read `v2.1`, marking the custom/local LLM chat support.

## [2.1.0] — 2026-06-24

### Changed
- **AVN Hub now runs the Next.js dev server (`next dev`, Turbopack) as its actual runtime**, instead of a compiled `next build` / `next start` standalone image. This is required for the NutBot widget creator: generated widgets are written as real `.tsx` into the source tree and need the dev server's file-watcher/HMR to load with no rebuild, the TypeScript toolchain for validation, and the source tree + an agent CLI present at runtime. Safe because AVN Hub is single-user / self-hosted / full-trust. See [`docs/AVN_HUB.md`](docs/AVN_HUB.md) › Runtime model.
  - `Dockerfile` rewritten to a single-stage dev image that runs `npm run dev` (bound to `0.0.0.0`).
  - `docker-compose.yml` now bind-mounts the project (so agent-written widgets persist to the host and HMR sees edits) with an anonymous `node_modules` volume to avoid shadowing the image's native bindings.
  - README, `CLAUDE.md`, and `docs/AVN_HUB.md` updated with the runtime model and a recommended "run directly on the host" path (`npm run dev`) alongside the Docker path.

### Fixed
- **Per-widget error boundary hardened** ([`components/framework/WidgetShell.tsx`](components/framework/WidgetShell.tsx)). It now uses the in-palette `--status-down` token (was an undefined `--accent-red`), logs failures to the console with the widget id via `componentDidCatch`, and **resets on change** — resizing a widget, changing its settings, or an HMR module swap after an edit clears a prior error so a fixed widget recovers without a manual reload. A runtime throw in one widget still renders an inline error instead of white-screening the whole hub.

### Added
- This `CHANGELOG.md`, and a documented practice of maintaining it going forward.

---

[Unreleased]: https://github.com/Zohaib2244/AVN-Hub/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/Zohaib2244/AVN-Hub/releases/tag/v2.1.0
