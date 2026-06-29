# Setup And Deployment

AVN Hub is designed for a single-user, self-hosted, full-trust environment. The usual path is to run it on your own machine or homelab host, then expose it privately through Tailscale.

## Runtime Model

AVN Hub runs the Next.js dev server (`next dev`, Turbopack) as its actual runtime. This is deliberate.

NutBot's Widget Creator writes real `.tsx` files into the source tree at runtime and depends on:

1. The dev server file watcher and HMR, so generated widgets appear without rebuilding.
2. The TypeScript toolchain, so generated widgets can be validated before registration.
3. The full source tree plus an authenticated CLI harness (`claude`, `codex`, or `opencode`).

A slim `next build` / `next start` production image does not have those properties. AVN Hub is not meant to be a multi-tenant public service; it is a trusted personal dashboard, so the dev-server runtime is the practical fit.

## Requirements

- Node.js 20+
- npm
- Optional for Widget Creator: one authenticated CLI harness on the machine running AVN Hub:
  - Claude Code (`claude`)
  - Codex (`codex`)
  - OpenCode (`opencode`)
- Optional for NutBot chat local LLM: Bonfire plus llama.cpp. See [NUTBOT_CHAT_SETUP.md](NUTBOT_CHAT_SETUP.md).
- Optional for WhatsApp group widgets: local WhatsApp bridge. See [WHATSAPP_BRIDGE_SETUP.md](WHATSAPP_BRIDGE_SETUP.md).
- Optional for private HTTPS: Tailscale
- Optional for containerized runtime: Docker and Docker Compose

## Install

```bash
git clone https://github.com/Zohaib2244/AVN-Hub.git
cd AVN-Hub
npm install
```

Create `.env.local` if you want bundled integration widgets to use server-side credentials. Many widgets can also take credentials through their own gear/settings UI.

## Environment Variables

```env
# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=

# Steam
STEAM_API_KEY=
STEAM_PROFILE_ID=

# Homelab
HOMELAB_STATUS_URL=
HOMELAB_MOCK_DATA=true

# GitHub
GITHUB_TOKEN=

# NutBot shell
NUTBOT_SHELL_DISABLED=

# NutBot chat local LLM backend
NUTBOT_CHAT_URL=http://127.0.0.1:8000

# Optional WhatsApp widget defaults
WHATSAPP_BRIDGE_URL=
WHATSAPP_GROUP_ID=
WHATSAPP_BRIDGE_PORT=3333
```

Notes:

- `HOMELAB_MOCK_DATA=true` is dev-only and serves realistic mock telemetry.
- `NUTBOT_SHELL_DISABLED=true` disables the integrated real host shell route.
- `NUTBOT_CHAT_URL` is optional. If Bonfire is not reachable, chat can fall back to the shared CLI harness chain or be turned off.
- `WHATSAPP_BRIDGE_URL` and `WHATSAPP_GROUP_ID` are optional defaults only. The WhatsApp widget can provide both through widget settings so no code editor is required after setup.

## Run Directly On The Host

This is the recommended path when your CLI harness is already installed and authenticated on the host.

```bash
npm run dev
```

Open `http://localhost:3000`.

## Run With Docker Compose

The Docker setup runs the dev server and bind-mounts the project so generated widgets persist on the host and HMR sees file changes.

```bash
docker compose up -d --build
```

If you want Widget Creator support inside Docker, the CLI harness must also be available and authenticated inside the container. The same applies to any CLI-backed NutBot chat fallback.

## Stop Services

If AVN Hub is running in your current terminal, press `Ctrl+C`.

If it is running in the background or you forgot which terminal owns it:

```bash
npm run stop:hub
```

To stop only the optional Bonfire/local LLM stack:

```bash
npm run stop:nutbot-llm
```

To stop only the optional WhatsApp bridge:

```bash
npm run stop:whatsapp
```

That stops the process listening on `NUTBOT_CHAT_URL`'s port (Bonfire, default `8000`) and the llama.cpp port (default `8080`). Override the llama.cpp port with `NUTBOT_LLAMA_PORT` or `LLAMA_SERVER_PORT` if your setup uses something else.

To stop both AVN Hub and the local LLM stack:

```bash
npm run stop:all
```

If you run AVN Hub through Docker Compose:

```bash
docker compose down
```

## Expose Over Tailscale

Tailscale gives private HTTPS without buying a public domain or managing Let's Encrypt.

```bash
tailscale serve https / http://localhost:3000
```

Then open the generated `https://<host>.<tailnet>.ts.net` URL from devices in your tailnet.

## Optional NutBot Chat Backends

NutBot chat does not have to be configured for AVN Hub to work.

- Local/custom LLM: run Bonfire against a llama.cpp GGUF model and point `NUTBOT_CHAT_URL` at it.
- CLI fallback: install and authenticate `claude`, `codex`, or `opencode`.
- Neither: chat shows an offline/disabled state; the rest of the dashboard is unaffected.

Full details live in [NUTBOT_CHAT_SETUP.md](NUTBOT_CHAT_SETUP.md).

## Optional WhatsApp Bridge

WhatsApp group widgets need a local bridge service:

```bash
npm run whatsapp:bridge
```

Scan the QR code printed in the terminal from WhatsApp's linked devices screen. Then use `http://127.0.0.1:3333/groups` to find your group ID.

Full details live in [WHATSAPP_BRIDGE_SETUP.md](WHATSAPP_BRIDGE_SETUP.md).

## Useful Checks

```bash
npx tsc --noEmit
npm run build
npx eslint <touched files>
```

On Windows PowerShell, if script execution policy blocks `npx.ps1`, run the same command through `cmd /c`:

```bash
cmd /c npx tsc --noEmit
```
