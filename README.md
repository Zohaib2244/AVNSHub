# AVN Hub

> A blank canvas. Fill it with whatever you want.

AVN Hub starts empty. There are no fixed widgets, no preset layouts, nothing telling you what your dashboard should be. You fill it — and the AI widget creator is how you do it.

Open NutBot's creator tab, describe what you want — a cube timer, a Wordle clone, a live price feed, a rope physics toy, a notes board, a visualizer — and it generates a real, running component. Not a template. Not a config file. An actual `.tsx` widget that drops straight into the canvas. Then arrange it, resize it, and put it in whichever named canvas makes sense: one for work, one for your homelab, one just because you like the way it looks.

The bundled widgets (Spotify, homelab stats, GitHub activity, system stats, notes, dictionary, and dot matrix) are examples of what the framework can hold — not the point of it. The point is the empty canvas, and the tool to make it yours.

![AVN Hub dark mode canvas](<docs/screenshots/display dark mode.png>)

![AVN Hub light mode canvas](<docs/screenshots/display light mode.png>)

## Quick Start

AVN Hub intentionally runs the Next.js dev server as its runtime. NutBot can generate real `.tsx` widgets into the source tree, so the running app needs HMR, TypeScript, the source tree, and at least one authenticated CLI harness if you want AI widget creation.

```bash
git clone https://github.com/Zohaib2244/AVN-Hub.git
cd AVN-Hub
npm install
npm run dev
```

Then open `http://localhost:3000`.

On Windows, you can instead double-click `install.bat` once, then use
`run.bat` to start AVN Hub. The installer checks Node/npm, installs packages,
creates `.env.local`, and prepares the SQLite database.

Stop helpers:

```bash
npm run stop:hub         # stop AVN Hub on port 3000
npm run stop:nutbot-llm  # stop Bonfire + llama.cpp local LLM ports
npm run stop:all         # stop all local services
```

For Docker, Tailscale, environment variables, and the dev-server runtime explanation, see [docs/SETUP.md](docs/SETUP.md).

## What You Get

- **Widget creator** — describe a widget in plain language; NutBot generates the component, type-checks it, and registers it. Anything: games, tools, visualizations, live data, timers, toys.
- **Named canvases** — multiple layouts each with their own theme, palette, wallpaper, and widget arrangement. Switch contexts, switch vibes.
- **Slot grid** — draggable, resizable widget slots. S / M / L sizes, horizontal and vertical orientations, Hover On Expand previews.
- **Hub Core** — edit mode, appearance (theme / palette / wallpaper / backdrop), widget manager, layout import/export, canvas management.
- **NutBot** — log ticker, conversational chat (local LLM or CLI harness), real host shell sessions, and the widget creator — all in one terminal.
- **Bundled starters** — identity card, clock, Spotify, homelab status, system stats, GitHub activity, notes, dictionary, dot matrix, and more — as reference implementations and to make the canvas useful immediately.

## Docs

The README is only the doorway. The actual docs are split by job:

| Doc | Use it for |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation map |
| [docs/SETUP.md](docs/SETUP.md) | Install, env vars, Docker, Tailscale, runtime model |
| [docs/FEATURES.md](docs/FEATURES.md) | Product tour and screenshots |
| [docs/AVN_HUB.md](docs/AVN_HUB.md) | Hub Core, layout, theme, preferences, persistence |
| [docs/CREATING_WIDGETS.md](docs/CREATING_WIDGETS.md) | Hand-writing or LLM-authoring widgets |
| [docs/NUTBOT_CHAT_SETUP.md](docs/NUTBOT_CHAT_SETUP.md) | Local LLM via Bonfire plus CLI chat fallback |
| [wallpaper/README.md](wallpaper/README.md) | Wallpaper Engine export build |

## Custom Widgets

Open the `✦ creator` tab in NutBot and describe what you want. The creator walks you through three stages — plan (figure out the concept), ideate (see HTML mockups of variations), build (generate the real component). Once built, the widget is type-checked, registered, and immediately available in the Widget Manager alongside every bundled widget.

To write one manually instead:

```text
components/widgets/custom/<slug>/
  <Name>Widget.tsx
  manifest.json
```

See [docs/CREATING_WIDGETS.md](docs/CREATING_WIDGETS.md) for the full authoring contract.

## NutBot Chat

NutBot chat is optional. In `auto` mode it tries a self-hosted Bonfire local LLM first, then falls back through the same CLI harness chain used by the Widget Creator. You can also pin a backend or turn chat off from the chat tab.

See [docs/NUTBOT_CHAT_SETUP.md](docs/NUTBOT_CHAT_SETUP.md) for local GGUF/model setup, GPU-layer tuning, Bonfire wiring, and the no-GPU CLI fallback.

## Tech Stack

| Area | Stack |
| --- | --- |
| App | Next.js App Router, React, TypeScript |
| Styling | Tailwind CSS plus CSS custom properties |
| Motion | Framer Motion |
| Drag/resize | dnd-kit plus custom slot resize handles |
| Host telemetry | `systeminformation` |
| AI harnesses | Claude Code, Codex, OpenCode CLI |
| Local chat LLM | Optional Bonfire + llama.cpp |
| Deployment | Direct host runtime or Docker, usually exposed through Tailscale |
