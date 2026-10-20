# Changelog

All notable changes to AVN Hub are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Add entries under `## [Unreleased]` as you work, grouped Added / Changed / Fixed / Removed. On release, rename it to the version and date, and bump `version` in `package.json`.

## [Unreleased]

## [2.4.0] — 2026-10-20

### Added
- **Control deck.** Hub Core is now one horizontal bar at the bottom of the canvas (canvas pills, view | edit switch, settings, widget manager, snapshot) that auto-hides into a three-dot stub. Settings are a section rail instead of one long accordion.
- **Command palette** (`Ctrl/Cmd+K`) over every Hub Core action: canvases, edit mode, settings sections, themes, palettes, layout export and reset.
- **Size presets.** Widgets pick a layout from a small catalog (badge, strip, column, card, panel, hero) with cell ranges; resizing snaps to allowed footprints. The Widget Creator plans, builds and verifies per preset, and pinning a widget's layout size is available from its gear.
- **Widget Creator.** Builds run in a private workbench, never the live tree. Plan, Ideate and Build now share projects through the hub database, with a live step tracker, question cards, function-call cards, image attachments, per-widget `SPEC.md`, and model/effort pickers with a usage view. Imports use the same pipeline.
- **NutBot.** A more expressive face (new expressions, speaking, themed colours, idles like something alive), chat wake-up animation, starter prompts, code blocks with copy buttons, prompt recall, scroll-lock, and chill | work modes. Work mode drives a CLI agent on the host.
- **Personalisation.** Auto palette generated from the canvas wallpaper; per-widget name and icon dial; centred widget settings dialog.
- Widget Manager multi-select, minimum sizes for Slot Layout resizing (`minPx`), a copy button in Notes, and the NutBot face as the site icon.
- Windows `install.bat` / `run.bat` launcher scripts, and new Gym Ledger and Mini Ping-Pong custom widgets.
- Accessibility: every palette passes contrast checks, reduced-motion support, ARIA labels on search and prompt inputs.

### Changed
- **Lower always-on cost.** A shared `startAnimationLoop` caps frame rates and stops when off-screen or backgrounded, NutBot's terminal and creator are lazy-loaded, shared polling pauses in background tabs, and `npm run dev` disables server source maps (`npm run dev:debug` keeps them). Idle PTY sessions are reaped after five minutes and reconnect scrollback is bounded.
- The Widget Creator's agent skills are generated on `npm install` from `lib/widget-creator/prompts/` instead of being committed.
- Homelab-specific settings moved to env vars: `ALLOWED_DEV_ORIGINS` for extra dev origins, `UPTIME_KUMA_DB` for Kuma's database path.
- Documentation consolidated into `README`, `docs/SETUP.md`, `docs/WIDGETS.md`, `docs/WIDGET_CREATOR.md` and `docs/NUTBOT.md`. Design notes moved to `docs/design/`.
- Slot Layout picks S/M/L from the cell's measured pixel size. Moving and resizing widgets is smoother, and cards clip instead of overflowing.

### Fixed
- A failed or interrupted widget build can no longer break the running dashboard; a broken custom widget can no longer take the whole page down.
- Harness failures (rate limits, nonzero exits, broken sandboxes, stale sessions) are reported accurately instead of as success or as quota errors.
- Clipboard and UUID helpers work over plain HTTP on a LAN.
- Lint errors 36 -> 0; assorted layout, focus and transition glitches in NutBot and the creator.

### Removed
- The right-edge Hub Core tab column and the pulsing glyph strip.

## [2.3.0] — 2026-07-02
- Shared hub data in SQLite (Prisma) so canvases, theme, layout and preferences sync across browsers and devices; wallpapers stored on disk; automatic database setup on `npm run dev`.
- Widget Creator harness skills for `claude`, `codex` and `opencode`, and a live widget catalog for Plan mode.
- NutBot terminal readability and motion pass.

## [2.2.0] — 2026-07-01
- Alpha starter layout; Notes, Dictionary and Dot Matrix promoted to bundled widgets; per-widget credentials.
- NutBot real shell sessions and chat with Bonfire local LLM or CLI fallback.
- Wallpaper Engine build (`wallpaper/`); `npm run stop:*` helpers.

## [2.1.0] — 2026-06-24
- AVN Hub runs the Next.js dev server as its runtime so the Widget Creator can write widgets live.
- Hardened per-widget error boundary.

Earlier releases: the manifest-driven widget framework, configurable grid, canvases, Spotify / Steam / GitHub / homelab widgets, and the "Chunky Blocks + Accent Border" design system.
