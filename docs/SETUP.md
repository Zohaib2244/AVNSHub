# Setup

AVN Hub is built for one trusted user on their own machine or homelab. It has no login of its own, so keep it on localhost, a LAN, or a private network such as Tailscale.

## Why it runs `next dev`

The Widget Creator writes real `.tsx` files into the source tree while the app runs. That needs the dev server's file watcher (new widgets appear with no rebuild), the TypeScript toolchain (drafts are type-checked before they touch the live tree), the full source tree, and an authenticated agent CLI. A `next build` / `next start` image has none of those, so `npm run dev` is the runtime.

## Requirements

- Node.js 20+ and npm
- Optional, for the Widget Creator and NutBot chat: one signed-in agent CLI on the same machine - `claude`, `codex` or `opencode`
- Optional: Docker, Tailscale, a local LLM (see [NUTBOT.md](NUTBOT.md))

There is no database server to install. Hub state (canvases, layout, theme, wallpaper settings) lives in a SQLite file at `prisma/hub.db`, created and migrated automatically by `npm run dev`. Uploaded wallpapers go to `data/uploads/`. Both are gitignored.

## Install and run

```bash
git clone https://github.com/Zohaib2244/AVNSHub.git
cd AVNSHub
npm install            # also generates the Widget Creator's agent skills
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Stop it with `Ctrl+C`, or `npm run stop:hub` if it is running in the background.

### Docker

```bash
docker compose up -d --build
```

The project is bind-mounted so generated widgets and the database persist on the host. The agent CLI must also be installed and signed in inside the container.

## Configuration

Everything is optional. Copy `.env.example` to `.env.local` and fill in what you use.

| Variable | What it does |
| --- | --- |
| `DATABASE_URL` | SQLite path. Already set in `.env.example`; the only required value. |
| `ALLOWED_DEV_ORIGINS` | Comma-separated hosts (LAN IP, proxy hostname) allowed to load the dev server from another machine. Not needed on localhost. |
| `UPTIME_KUMA_DB` / `UPTIME_KUMA_STATUS_PAGE` | Data source for the Homelab Status widget: path to Kuma's `kuma.db`, or a published status page URL (preferred when set). |
| `HOMELAB_STATUS_URL` | Fallback status endpoint when Kuma is unavailable. |
| `HOMELAB_MOCK_DATA=true` | Dev only: serve realistic mock homelab telemetry. |
| `SPOTIFY_*`, `STEAM_*`, `GITHUB_TOKEN` | Fallback credentials for those widgets. You can enter them per widget in its gear popover instead. |
| `NUTBOT_SHELL_DISABLED=true` | Turn off NutBot's real host shell. |
| `NUTBOT_CHAT_URL` | Bonfire base URL for the local-LLM chat backend (default `http://127.0.0.1:8000`). |

Credentials entered in widget settings are stored in the layout and sent to that widget's own API route, which falls back to the env vars above when a field is blank.

## Running as a service

`deploy/avn-hub.service.example` is a systemd unit template. Replace `<USER>`, `<HOME>` and `<INSTALL_DIR>`, copy it to `/etc/systemd/system/avn-hub.service`, then `systemctl enable --now avn-hub`. Its `PATH` must include wherever your agent CLIs are installed, because systemd does not read your shell profile.

## Private HTTPS with Tailscale

```bash
tailscale serve https / http://localhost:3000
```

Then open `https://<host>.<tailnet>.ts.net` from any device on your tailnet.

## Security

The NutBot shell and Work-mode chat give anyone who can load the hub a shell on the host as the server's user. Do not expose the hub to the internet without a login layer in front of it, or set `NUTBOT_SHELL_DISABLED=true`.

## Checks

```bash
npx tsc --noEmit
npm run lint
npm run build
```
