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
- No separate database server — shared hub data lives in a bundled SQLite
  database (via Prisma), set up automatically the first time you run the app.
  See [Database](#database) below.
- Optional for Widget Creator: one authenticated CLI harness on the machine running AVN Hub:
  - Claude Code (`claude`)
  - Codex (`codex`)
  - OpenCode (`opencode`)
  - All three can also discover pre-built "skills" that speed up widget
    generation — see [CREATING_WIDGETS.md](CREATING_WIDGETS.md#optional-turn-this-guide-into-a-harness-skill).
    They ship with the repo; there's nothing extra to install.
- Optional for NutBot chat: Bonfire plus llama.cpp only if you want a local-LLM chat backend; otherwise leave chat disabled or use the CLI fallback. See [NUTBOT_CHAT_SETUP.md](NUTBOT_CHAT_SETUP.md).
- Optional for private HTTPS: Tailscale
- Optional for containerized runtime: Docker and Docker Compose

## Install

```bash
git clone https://github.com/Zohaib2244/AVN-Hub.git
cd AVN-Hub
npm install
cp .env.example .env.local
```

`.env.example` already sets `DATABASE_URL` to a sane default — that's the one
variable AVN Hub actually needs to start (see [Database](#database)).
Everything else in `.env.local` is optional: fill in server-side credentials
for bundled integration widgets if you want them, or leave them blank and
supply the same credentials per-widget through each widget's own
gear/settings UI instead. Spotify and GitHub credentials are now typically
entered in the widget settings rather than in `.env.local`.

## Database

AVN Hub keeps canvases, theme, layout, preferences, and wallpaper/backdrop
settings in a small SQLite database (via Prisma) instead of only the
browser's `localStorage` — this is what lets you open the same hub from
different browsers or devices and see the same state, instead of each one
being stuck with its own copy. Wallpaper images/videos are stored as files
under `data/uploads/`, referenced from the database.

- Lives at `prisma/hub.db` by default (path comes from `DATABASE_URL`),
  gitignored — it's host state, not source, same as `data/uploads/`.
- **Set up automatically.** `npm run dev` runs `npm run db:setup` first every
  time (via a `predev` hook) — generates the Prisma client and applies any
  pending migrations. In normal use you never touch this yourself, and it's
  fast/idempotent when there's nothing to do.
- Docker Compose gets this for free too, since its `CMD` is the same
  `npm run dev`.
- To run it by hand — troubleshooting, or right after cloning before your
  first `npm run dev`:
  ```bash
  npm run db:setup
  ```
- If `DATABASE_URL` isn't set, this fails immediately with a clear error
  (`The datasource.url property is required...`) instead of a confusing
  crash later when a route tries to use the database.

## Environment Variables

```env
# Shared hub database (see Database above) - the one variable AVN Hub
# actually requires; .env.example already sets this default for you.
DATABASE_URL="file:./prisma/hub.db"


# Homelab
HOMELAB_STATUS_URL=
HOMELAB_MOCK_DATA=true

# Optional: disable the integrated real host shell route
NUTBOT_SHELL_DISABLED=

# Optional: NutBot chat local LLM backend; leave unset to keep chat disabled/offline
NUTBOT_CHAT_URL=http://127.0.0.1:8000

```

Notes:

- `HOMELAB_MOCK_DATA=true` is dev-only and serves realistic mock telemetry.
- `NUTBOT_SHELL_DISABLED=true` disables the integrated real host shell route.
- `NUTBOT_CHAT_URL` is optional. If Bonfire is not reachable, chat can fall back to the shared CLI harness chain or be turned off, and the chat tab stays disabled/offline if you do not enable it.

## Run Directly On The Host

This is the recommended path when your CLI harness is already installed and authenticated on the host.

```bash
npm run dev
```

The first run sets up the database automatically (see [Database](#database)
above) before the server starts. Open `http://localhost:3000`.

## Run With Docker Compose

The Docker setup runs the dev server and bind-mounts the project so generated widgets — and the SQLite database, and any uploaded wallpapers — persist on the host and HMR sees file changes.

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
