# AVN Hub

> A self-hosted widget playground for building, placing, and remixing AI-generated dashboard cards.

AVN Hub is a living personal dashboard canvas. Start with bundled widgets, ask NutBot to generate new ones, write your own when you want finer control, and arrange everything in a resizable slot grid. It is not a fixed portfolio page. It is an environment you keep shaping into the interface you want.

![AVN Hub dark mode canvas with the slot grid, NutBot terminal, live widgets, and side control tabs](<docs/screenshots/display dark mode.png>)

![AVN Hub light mode canvas showing the same widget layout with a different palette](<docs/screenshots/display light mode.png>)

## Quick Start

AVN Hub intentionally runs the Next.js dev server as its runtime. NutBot can generate real `.tsx` widgets into the source tree, so the running app needs HMR, TypeScript, the source tree, and at least one authenticated CLI harness if you want AI widget creation.

```bash
git clone https://github.com/Zohaib2244/AVN-Hub.git
cd AVN-Hub
npm install
npm run dev
```

Then open `http://localhost:3000`.

Stop helpers:

```bash
npm run stop:hub         # stop AVN Hub on port 3000
npm run stop:nutbot-llm  # stop Bonfire + llama.cpp local LLM ports
npm run stop:whatsapp    # stop the local WhatsApp bridge
npm run stop:all         # stop all local services
```

For Docker, Tailscale, environment variables, and the dev-server runtime explanation, see [docs/SETUP.md](docs/SETUP.md).

## What You Get

- A Slot Layout canvas with draggable, resizable widgets.
- Hub Core controls for edit mode, appearance, layout, import/export, and widget management.
- Multiple named AVN Hub Canvases, each with its own layout, theme, palette, and wallpaper.
- Built-in widgets for identity, music, games, homelab status, system stats, GitHub activity, clock/date, quicklinks, ambient sound, and NutBot.
- NutBot terminal tabs for logs, chat, real host shells, and AI widget creation.
- Custom widgets generated from prompts or written by hand.
- Optional NutBot chat backed by either a local Bonfire/llama.cpp LLM or the shared `claude` / `codex` / `opencode` CLI harness chain.

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
| [docs/WHATSAPP_BRIDGE_SETUP.md](docs/WHATSAPP_BRIDGE_SETUP.md) | Local WhatsApp bridge for group-chat widgets |
| [wallpaper/README.md](wallpaper/README.md) | Wallpaper Engine export build |

## Custom Widgets

NutBot's `CREATOR` tab is the fastest path: describe the widget, choose its size/orientation options, and let the CLI harness generate the component and manifest. Generated widgets are type-checked before registration and then appear in the Widget Manager like any bundled widget.

You can also write one manually:

```text
components/widgets/custom/<slug>/
  <Name>Widget.tsx
  manifest.json
```

Follow [docs/CREATING_WIDGETS.md](docs/CREATING_WIDGETS.md) for the exact contract.

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
