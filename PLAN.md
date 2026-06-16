# Pending Items â€” Phase 10 Wrap-up

Implementation of Phase 10 (GitHub Activity module, Quicklinks, removal of
Currently Building/Stack Chips, live uptime stat, Homelab v2 host telemetry
types) is done and verified. The items below are the loose ends that need
real values from the user before things are fully live.

## 1. Real GitHub username (blocking â€” GitHub Activity is currently broken)

`https://api.github.com/users/AVN Hub/events/public` returns `404` â€”
`AVN Hub` is not a real GitHub account, so `/api/github-activity` returns
`null` and the block always shows "â€”".

Fix once the real username is known:

- `lib/github.ts` â†’ update `GITHUB_USERNAME` constant
- `components/IdentityBlock.tsx` â†’ update the `https://github.com/AVN Hub`
  link href

## 2. GitHub PAT for higher rate limit

- `GITHUB_TOKEN` in `.env.local` is empty.
- Works unauthenticated at 60 requests/hr; create a token at
  github.com/settings/tokens (no special scopes needed for public activity)
  to raise this to 5000/hr.

## 3. Quicklink URLs are placeholders

`config/links.ts` currently has invented URLs:

- `https://youtube.com/@AVN Hub`
- `https://linkedin.com/in/avn-hub`
- `https://chatgpt.com/g/avn-hub`

Replace with real URLs (or remove entries that don't apply).

## 4. GlyphStrip vs. "no neon glow" rule

`components/GlyphStrip.tsx` has a glow/box-shadow pulse animation that may
conflict with the Chunky Blocks design rule of "no neon glow, no CRT
scanlines/grain". Re-check against `DESIGN_VARIATIONS.md` and restyle or
remove if needed.

---

## Phase 11 â€” Homelab Telemetry Capsule Breakdown (implemented)

Status: all 8 capsules below are scaffolded and live in `app/page.tsx`. Each
new capsule reads from `/api/homelab-v2` and renders "â€”" placeholders until
the real homelab v2 aggregator starts returning `overall`/`host`/per-service
`id`+`telemetry` (see Dependencies/blockers below â€” unchanged, still the
only remaining blocker).

The single `HomelabStatus` block (services dots + average uptime) splits into
several dedicated capsules, one per telemetry concern, using the v2 types
already defined in `lib/homelab.ts`. Quicklinks also moves out of the
Identity Block into its own capsule.

### New capsules

| # | Capsule | Data source (`lib/homelab.ts` v2) | Notes |
|---|---|---|---|
| 1 | **Quicklinks** | `config/links.ts` (existing) | Pulled out of `IdentityBlock`; own standalone capsule |
| 2 | **Homelab Overview** | `HomelabStatusV2.services[]` status dots + `overall` | Existing v1 `HomelabStatus.tsx` content, kept as the `#homelab` anchor. Jackett lives here as a status-dot-only entry (no telemetry). Capsule title becomes **"A Very Nutty Home Server"** |
| 3 | **Server Stats** | `HostTelemetry.cpu` + `.memory` (new fields, see below) + `.drives[]` + `.network` | Headline 4-up overview â€” CPU / Memory / Storage / Network â€” hover reveals a per-metric detail panel |
| 4 | **Disk Storage** | `HostTelemetry.drives[]` | Per-drive breakdown (deeper than Server Stats' "Storage" headline) |
| 5 | **Network Stats** | `HostTelemetry.network` (rx/tx bytes + rates) | Per-interface breakdown (deeper than Server Stats' "Network" headline) |
| 6 | **Jellyfin** | `ServiceStatusV2` where `telemetry.type === "media_sessions"` | Standalone hero-style capsule, similar treatment to GitHub Activity |
| 7 | **Arr Stack** | Jellyseerr (`request_queue`) + Radarr/Sonarr/qBittorrent (`download_queue`) | Standalone, grouped â€” per-service rows |
| 8 | **Storage Apps** | Immich + Nextcloud (`storage`) | Standalone, grouped â€” per-service rows |

### `HostTelemetry` additions needed for Server Stats

```ts
export type HostTelemetry = {
  cpu: { used_pct: number; load_avg: [number, number, number] };       // new
  memory: { used_bytes: number; total_bytes: number; used_pct: number }; // new
  drives: DriveInfo[];   // existing â€” also feeds capsule #4
  network: { rx_bytes: number; tx_bytes: number; rx_rate_bps: number; tx_rate_bps: number }; // existing â€” also feeds capsule #5
  uptime_seconds: number; // existing
};
```

`drives` / `network` are reused for Server Stats' headline numbers (e.g.
aggregate %-used across drives, current combined rx+tx rate) â€” `cpu` /
`memory` are net-new fields the aggregator needs to start producing.

### Proposed layout

```text
IdentityBlock                       (slimmed â€” quicklinks removed)
Quicklinks capsule
[Now Playing | Currently Playing]   (existing pair, unchanged)
GitHub Activity                     (existing standalone, unchanged)

â€” "A Very Nutty Home Server" section header â€”
Homelab Overview                    (existing #homelab anchor; capsule title becomes "A Very Nutty Home Server")
Server Stats                        (standalone â€” CPU/Memory/Storage/Network headline + hover detail panel)
[Disk Storage | Network Stats]      (pair â€” per-drive / per-interface detail)
Jellyfin                            (standalone, hero-style)
Arr Stack                           (standalone)
Storage Apps                        (standalone)
```

### Decisions

- The homelab capsule cluster (Homelab Overview â†’ Storage Apps) is
  introduced by a section header reading **"A Very Nutty Home Server"** (the
  server's real name) â€” the Homelab Overview capsule's own title also
  changes from "homelab" to **"A Very Nutty Home Server"**.
- qBittorrent folds into the **Arr Stack** capsule; Jackett is a
  status-dot-only entry in **Homelab Overview**.
- **Server Stats** is a 4-up CPU/Memory/Storage/Network vitals capsule with a
  hover-to-expand detail panel, sitting above the Disk Storage / Network
  Stats pair (headline â†’ detail).
- **Arr Stack** and **Storage Apps** are standalone full-width capsules, not
  paired with each other.
- **Disk Storage** + **Network Stats** stay paired as originally proposed.

### Dependencies / blockers

- Capsules 3â€“8 all need real data from the **homelab v2 aggregator**, which
  per `CLAUDE.md` is "a separate homelab-side project, not yet built." Until
  it exists, `getHomelabStatus()` only parses v1 fields (services +
  last_checked) â€” see `lib/homelab.ts:98-132`.
- `getHomelabStatus()` needs a v2 parse path (additive, per the comment block
  at `lib/homelab.ts:36-39`) before any of these capsules can show
  non-placeholder data.
- `HostTelemetry` needs new `cpu` and `memory` fields for Server Stats â€” the
  aggregator must produce them.
- Each new capsule can still be scaffolded now against the existing v2
  *types* with placeholder/"â€”" states, same pattern used for GitHub Activity
  and Homelab Status before their data sources went live.

### Open questions

None remaining â€” Quicklinks shipped as a standalone full-width capsule
(`components/QuickLinks.tsx`) directly under Identity Block, rendering the
icon+label row from `config/links.ts`.
