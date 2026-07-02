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
- **Per-widget SPEC.md.** After every successful build turn the Widget Creator writes a `SPEC.md` into the widget's own folder ([`lib/widget-creator/projectSpec.ts`](lib/widget-creator/projectSpec.ts)) capturing its intent, per-size content, data shape, and pipeline origin; edit-mode prompts read it back as authoritative context so the harness (or a fresh session on another device) never has to re-derive what the widget is for.
- **Name/icon/slug at project creation.** The Widget Creator's "new widget" step now has an identity form (with auto-derived slug and a "decide later" toggle); decided values seed Build mode's settings and survive Plan-mode handoffs that don't supply their own icon.
- **Pipeline handoff indicators.** Ideate and Build now show a "carried over from plan" chip (with the brief's title) when a brief exists, and Build shows a "mockup reference attached" chip that expands into a live preview of the finalized Ideate mockup — what each stage feeds the next is visible instead of implicit.
- **Canvas-widget worked example in the `avn-widget-build` skill** (and `docs/CREATING_WIDGETS.md`): a complete strict-null-safe refs + ResizeObserver + DPR + RAF pattern, so canvas/animation widgets no longer send the harness exploring other widgets' source for conventions.
- **Widget Creator server-side generation mutex.** "One generation at a time" is now enforced on the server ([`lib/widget-creator/generationLock.ts`](lib/widget-creator/generationLock.ts)) instead of only in one browser tab's memory — a second tab or device starting a build/ideate run while one is in flight gets a clear "already running" error instead of two harnesses racing on `customComponentMap.tsx`, the registry JSON, and each other's tsc checks. Lock lives on `globalThis` (survives dev-server HMR), stale takeover after 30 min, always released on completion or client abort.
- **Post-run write audit.** After every build turn the generate route diffs `git status --porcelain` from before the run ([`lib/widget-creator/gitAudit.ts`](lib/widget-creator/gitAudit.ts)); the harness runs with `bypassPermissions`, so any file it touched outside the widget's own folders (`components/widgets/custom/<slug>/`, `app/api/<slug>/`, the registry files) now surfaces as a warning card in the build chat instead of silently landing in the working tree. Skipped gracefully when git is unavailable.
- **Generated API routes are now tracked and cleaned up.** Registration records from disk whether a widget shipped its own `app/api/<slug>` route (`flags.hasApiRoute` — never trusted from the LLM-authored manifest); deleting the widget now removes that route too instead of orphaning it forever. Creating a widget whose slug collides with an existing `app/api` route (e.g. `uptime`) is rejected up front so a generated route can never overwrite a core one.
- **Widget Creator projects now sync through the shared KV store.** Project list state, per-project transcripts/ideate rounds, Plan/Ideate/Build session ids, and pending install records now use the same localStorage-first/server-reconciled pattern as hub prefs, so creator work survives browser/device switches instead of living only in one tab.

### Fixed
- **Plan/Ideate/Build no longer show their idle placeholder text while generating** — an empty transcript now shows a live "thinking… / cooking up N variations… / writing the widget…" status instead of "describe a widget concept below".
- **Harness exit codes are no longer ignored.** A CLI that crashed with a nonzero exit (without tripping a rate-limit pattern) used to resolve as "done" — a crashed edit that still typechecked could be committed with zero signal. Crashes now fall forward through the harness chain with an "exited with code N" switch notice, and an exhausted chain reports an error instead of ending silently. A user pressing stop is now a distinct "aborted" outcome that never spawns the fallback harness.
- **Generated `app/api/<slug>` routes now count against the TypeScript gate.** The post-generation tsc check filtered errors to the widget component tree only, so a type-broken generated API route sailed through and 500'd at runtime.
- **Orphan pruning can no longer eat a generated-but-not-yet-installed widget.** `pruneOrphanCustomWidgetFiles` (run on every widget delete) treated any folder without a registry entry as garbage — which described exactly a widget awaiting its "install" click. Folders touched within the last 48 h are now skipped.
- **Pending Widget Creator builds survive remounts and tab closes.** Build sessions are tagged with the slug they belong to in the project record, fixing a remount bug that discarded valid resumed sessions; finished-but-uninstalled widgets also keep their install button after reload, and the orphan pruner protects synced pending-install slugs.
- **NutBot tabs stay alive while switching.** The terminal now lazy-mounts visited Log/Chat/Shells/Creator tabs and hides inactive panels instead of remounting them, so shell ptys, Widget Creator streams, and chat state survive tab switches.
- **Ideate mode aborts cleanly on unmount** and clears NutBot's working indicator, preventing orphaned ideation requests when switching stages or canvases mid-generation.
- **Plan mode replays persisted transcript history** when continuing a conversation after remount, instead of losing harness context to an in-memory history array.
- **Widget Creator handoffs are now editable and less brittle.** Plan-mode briefs live inline in the transcript with edit/build/visualize actions; finalized Ideate mockups can be built with an empty Build prompt; placement failures can reload or open Widget Manager directly; and the Build "new" action keeps the widget identity instead of wiping name/slug/edit target.
- **`slug`/`editSlug` are validated server-side** in the generate route before being joined into filesystem paths (previously client-side only).
- **`customComponentMap.tsx` marker comments are verified before registration** — a hand-edit that removed them used to make `addToComponentMap` silently no-op, "registering" a widget that never loads; now every registration path (generate, register, import, rename) reports an actionable error instead.
- **Deleting a custom widget from the Widget Manager now resets its creator project** back to In Progress (`syncDeletedWidget` existed but was never wired up).

## [2.3.0-alpha.2] — 2026-07-02

### Changed
- **NutBot terminal readability pass.** Every screen (log / chat / shells / creator) gets bigger, bolder type: font sizes bumped across the board (the smallest chips go from ~7px to ~9px), mono content runs at JetBrains Mono weight 500 (with `font-synthesis: none` so DotGothic16 labels don't get smeared synthetic bold), and all secondary text uses a new `--nb-muted` color — `--text-muted` pulled 48% toward `--text-primary` — so it stays legible on palettes like raspberry/plum where the stock muted tone merges with the card background.
- **Focus mode now scales NutBot's content.** All terminal font sizes and key control dimensions are written as `calc(<base> * var(--nb-scale))`; the ⤢ focus mode sets `--nb-scale: 1.3`, so text, tabs, buttons, the shells sidebar, ideate preview cards — and the real pty (xterm reads its font size from `.term-xterm`'s computed CSS and refits on resize) — all grow with the widget instead of stretching tiny text across the full frame.
- **NutBot motion polish.** Log-tab `[ok]`/`[info]` prefixes are color-coded with a blinking block caret at the end; creator project rows get a staggered entrance and a hover slide; the in-progress pipeline chip's dot pulses; chat/creator messages fade-slide in on arrival.
- **NutBot navigation transitions.** Three distinct, direction-aware transitions replace instant snaps: the main terminal tabs (log/chat/shells/creator) crossfade+slide horizontally; the Widget Creator's project list ↔ picker/workspace navigation gets a deeper horizontal drill-in/out slide; and switching Plan/Ideate/Build pipeline stages within a project gets its own vertical fade-slide, so each navigation depth reads as visually distinct.

## [2.3.0-alpha.1] — 2026-07-02

### Added
- **Shared hub data (multi-device sync).** Canvases, theme/palette, Slot Layout, preferences, and backdrop/parallax settings now live in a SQLite database (via Prisma) instead of only `localStorage` — opening AVN Hub from a different browser or device shows the same state instead of each one being stuck with its own copy. New generic `KV` table + [`app/api/hub-data/route.ts`](app/api/hub-data/route.ts); every store keeps `localStorage` as an instant-read/offline cache and reconciles with the server on load, on a 15s poll, and on write ([`lib/serverSync.ts`](lib/serverSync.ts)).
- **Server-side wallpaper storage.** Wallpaper images/videos now live on disk (`data/uploads/`, a `FileBlob` Prisma row for content-type) behind [`app/api/hub-files/route.ts`](app/api/hub-files/route.ts) instead of only IndexedDB — the server is the source of truth, so a wallpaper set on one device shows up on every other one. Replaces `lib/idb.ts`, now removed.
- **Automatic database setup.** `npm run db:setup` (Prisma generate + migrate deploy) runs automatically via a `predev` hook on every `npm run dev` — including inside Docker, since its `CMD` is the same command — so a fresh clone just works without a manual migration step.
- **Widget Creator harness skills.** `avn-widget-build` and `avn-widget-plan`, discoverable by `claude`, `codex`, and `opencode` and generated by `npm run sync:widget-skill` from dedicated AI-optimized source files under `lib/widget-creator/prompts/` — deliberately separate from the human-facing [`docs/CREATING_WIDGETS.md`](docs/CREATING_WIDGETS.md), since a harness pays real tokens for every word of a loaded skill and a human doesn't.
- **Live widget catalog for Plan mode.** [`lib/widget-creator/widgetCatalog.ts`](lib/widget-creator/widgetCatalog.ts) injects the current widget list into Plan-mode prompts so suggestions never duplicate something that already exists, with no codebase exploration needed.
- **`docs/WIDGET_CREATOR_GUIDE.md`.** A full, screenshot-illustrated, non-technical walkthrough of the Plan → Ideate → Build pipeline.

### Changed
- Ideate mode's mockup style reference now reads its color tokens live from [`styles/globals.css`](styles/globals.css) instead of a hand-maintained duplicate copy, so they can no longer drift apart.
- The Widget Creator's Build-mode prompt no longer embeds the full authoring guide on every turn — it references the `avn-widget-build` skill instead, cutting the guidance actually loaded per generation from ~27KB to ~9KB and removing the Windows `--append-system-prompt` `ARG_MAX` workaround entirely.
- NutBot chat / Plan mode's `claude` invocation no longer resends its full system prompt on every resumed turn — only on the first turn of a session, same as Build mode already did.
- [`docs/SETUP.md`](docs/SETUP.md) and [`docs/CREATING_WIDGETS.md`](docs/CREATING_WIDGETS.md) updated for the database and the skills architecture.

### Fixed
- A Windows-specific bug where a wallpaper file key containing `:` was silently written into an NTFS Alternate Data Stream instead of a real file.
- Widget generation now fails immediately with an actionable error if a required harness skill is missing, instead of silently proceeding with a harness that has no framework rules to follow.
- Broken `Zohaib2244/AVN-Hub` repo links (404) throughout `README.md`/`docs/SETUP.md`/`CHANGELOG.md` corrected to the actual repo, `Zohaib2244/AVNSHub`.

### Removed
- Stray root-level scratch/prototype files: `PLAN.md`, `uxdesign.excalidraw`, `WIDGET_CREATOR_UX.html`, `nutbot-v3-prototype.html`, `widget-ideas-proto.html`, `docs/BUG_REPORT.md`, `docs/HTML_WIDGET_IMPORT_PLAN.md`.
- `lib/idb.ts` — unused after wallpaper storage moved server-side.

## [2.2.0-alpha.1] — 2026-07-01

### Added
- **Alpha starter layout.** The default Slot Layout now ships with the curated AVN Hub alpha canvas: identity, clock, NutBot, Spotify, GitHub, host telemetry, notes, dictionary, dot matrix, glyph matrix, ambient data, and verlet sim arranged across the left/right/base/center regions.
- **Bundled examples promoted from custom widgets.** Notes, Dictionary, and Dot Matrix now live in the default widget registry so they ship as first-party examples instead of generated custom widgets.
- **Per-widget credentials in settings.** Spotify Now Playing and GitHub Activity can take credentials from their own gear/settings popover instead of requiring server env vars. A new masked `password` settings field type ([`config/widgets.tsx`](config/widgets.tsx), [`components/framework/WidgetSettingsPopover.tsx`](components/framework/WidgetSettingsPopover.tsx)) hides secrets/tokens in the form. Values are stored client-side and POSTed to each widget's own API route; server env vars remain available as fallbacks.
- **NutBot real cross-platform shell.** NutBot's terminal shell tabs are now live pseudo-terminals on the host (PowerShell on Windows, `$SHELL` on macOS/Linux) via node-pty, replacing the mock command interpreter. The pty is integrated directly into the Next app — a new SSE + POST route ([`app/api/nutbot-shell/route.ts`](app/api/nutbot-shell/route.ts)) + session hub ([`lib/nutbot/ptyHub.ts`](lib/nutbot/ptyHub.ts)) — so **no separate `npm run nutbot:shell` process or `NEXT_PUBLIC_NUTBOT_SHELL_URL` is needed**. The "+" tab opens additional independent shells; shell tabs stay mounted across tab switches so their session + scrollback persist. Set `NUTBOT_SHELL_DISABLED=true` to turn the route off (it gives anyone who can reach the UI a shell on the host — intended for the single-user/self-hosted/full-trust model).
- **NutBot chat.** A new `chat` tab in NutBot's terminal gives it an actual conversational personality, backed by a self-hosted [Bonfire](https://github.com/shahwaizse/bonfire) instance running Dolphin 3.0 Llama 3.1 8B GGUF behind llama.cpp. A new proxy route ([`app/api/nutbot-chat/route.ts`](app/api/nutbot-chat/route.ts), `NUTBOT_CHAT_URL` env var) hides the Bonfire URL and streams its NDJSON `/chat` response straight to the client. Personality and an NSFW toggle are both just system prompts ([`lib/nutbot/persona.ts`](lib/nutbot/persona.ts)), pushed into Bonfire as find-or-create presets. Web search is on by default (toggle in the chat footer); NutBot's face reacts via two new signals (`speaking`, `browsing`) in [`lib/nutbotSignal.ts`](lib/nutbotSignal.ts). Shows a graceful offline state when Bonfire isn't reachable.
- **NutBot chat backend fallback.** NutBot chat now has a shared backend preference (`chatBackend` in [`lib/prefs.ts`](lib/prefs.ts)): `auto` prefers Bonfire, then falls back through the Widget Creator's existing `claude` / `codex` / `opencode` harness chain via [`lib/nutbot/chatHarness.ts`](lib/nutbot/chatHarness.ts). Chat can also be pinned to a concrete backend or turned off. Setup lives in [`docs/NUTBOT_CHAT_SETUP.md`](docs/NUTBOT_CHAT_SETUP.md).
- **Stop helpers.** Added `npm run stop:hub`, `npm run stop:nutbot-llm`, and `npm run stop:all` to stop AVN Hub, Bonfire, and llama.cpp by their local ports without hunting through Task Manager.
- **Split documentation.** The root README is now a short project entry point, with focused docs for setup ([`docs/SETUP.md`](docs/SETUP.md)), feature tour ([`docs/FEATURES.md`](docs/FEATURES.md)), docs navigation ([`docs/README.md`](docs/README.md)), and NutBot local/custom LLM setup ([`docs/NUTBOT_CHAT_SETUP.md`](docs/NUTBOT_CHAT_SETUP.md)).
- **Local LLM tuning guide.** [`docs/NUTBOT_CHAT_SETUP.md`](docs/NUTBOT_CHAT_SETUP.md) now includes a repeatable workflow for finding per-machine llama.cpp settings (`--gpu-layers`, `--ctx-size`, `--parallel`) instead of copying one fixed GPU configuration.
- **Wallpaper Engine build.** A second, standalone Next.js app at [`wallpaper/`](wallpaper/) builds AVN Hub into a static, serverless bundle for use as a Wallpaper Engine "Web" wallpaper. The build includes Audio Pulse, Audio Visualizer, and Media Now Playing integrations through Wallpaper Engine JS APIs, while NutBot becomes a plain idle mascot.

### Changed
- `usePolling` ([`lib/usePolling.ts`](lib/usePolling.ts)) gained an optional `body` argument: when provided the poll becomes a POST carrying that JSON (used to send per-widget credentials without putting secrets in the URL/query string/logs), and it namespaces the shared per-URL cache so widgets with different credentials don't collide.
- `node-pty` moved from devDependencies to dependencies (now used at runtime by the shell route); `next.config.ts` marks it as a `serverExternalPackages` entry so its native binary is required at runtime rather than bundled.
- The Widget Creator can now be disabled independently with `creatorEnabled`, exposed through the existing harness picker; turning it off prevents `WidgetCreatorPanel` from mounting.
- NutBot's visible widget label, boot sequence, docs, and package metadata now identify the alpha as `v2.2.0-alpha.1`.

### Removed
- Removed non-alpha custom widgets from the shipped registry: WhatsApp, Diss Glade, Atom Bomb, Monkey Type, and Claude Usage.
- Removed personal-config-heavy alpha cuts: Steam widgets/routes/client, WhatsApp bridge route/scripts/docs/dependencies, Ambient Sound, session tracker, uptime milestones, and the homelab v2 Jellyfin/Arr/storage widgets.
- Removed agent instructions, Codex/Claude config, design variation files, prototype HTML files, and other release-branch scratch artifacts.

## [2.1.0] — 2026-06-24

### Changed
- **AVN Hub now runs the Next.js dev server (`next dev`, Turbopack) as its actual runtime**, instead of a compiled `next build` / `next start` standalone image. This is required for the NutBot widget creator: generated widgets are written as real `.tsx` into the source tree and need the dev server's file-watcher/HMR to load with no rebuild, the TypeScript toolchain for validation, and the source tree + an agent CLI present at runtime. Safe because AVN Hub is single-user / self-hosted / full-trust. See [`docs/AVN_HUB.md`](docs/AVN_HUB.md) › Runtime model.
  - `Dockerfile` rewritten to a single-stage dev image that runs `npm run dev` (bound to `0.0.0.0`).
  - `docker-compose.yml` now bind-mounts the project (so agent-written widgets persist to the host and HMR sees edits) with an anonymous `node_modules` volume to avoid shadowing the image's native bindings.
  - README and `docs/AVN_HUB.md` updated with the runtime model and a recommended "run directly on the host" path (`npm run dev`) alongside the Docker path.

### Fixed
- **Per-widget error boundary hardened** ([`components/framework/WidgetShell.tsx`](components/framework/WidgetShell.tsx)). It now uses the in-palette `--status-down` token (was an undefined `--accent-red`), logs failures to the console with the widget id via `componentDidCatch`, and **resets on change** — resizing a widget, changing its settings, or an HMR module swap after an edit clears a prior error so a fixed widget recovers without a manual reload. A runtime throw in one widget still renders an inline error instead of white-screening the whole hub.

### Added
- This `CHANGELOG.md`, and a documented practice of maintaining it going forward.

---

[Unreleased]: https://github.com/Zohaib2244/AVNSHub/compare/v2.3.0-alpha.1...HEAD
[2.3.0-alpha.1]: https://github.com/Zohaib2244/AVNSHub/compare/v2.2.0-alpha.1...v2.3.0-alpha.1
[2.2.0-alpha.1]: https://github.com/Zohaib2244/AVNSHub/compare/v2.1.0...v2.2.0-alpha.1
[2.1.0]: https://github.com/Zohaib2244/AVNSHub/releases/tag/v2.1.0
