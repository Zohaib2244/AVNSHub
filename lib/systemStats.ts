// Live CPU/memory/disk/network telemetry for the machine AVN Hub's server
// process is actually running on — distinct from lib/homelab.ts's `host`
// field, which (until the separate homelab aggregator project ships) stays
// mock data describing a *different* machine (the homelab server). This
// module reuses the same HostTelemetry shape so the existing widgets don't
// need a new type, just a different data source.
//
// Node has no built-in cross-platform way to get disk usage or network
// throughput, so this uses `systeminformation` (works on Linux — the
// homelab/Docker target — as well as macOS and Windows for local dev).

import { loadavg, uptime } from "os";
import si from "systeminformation";
import type { HostTelemetry } from "@/lib/homelab";

const CACHE_TTL_MS = 10_000;
let cache: { data: HostTelemetry; expiresAt: number } | null = null;
let inFlight: Promise<HostTelemetry> | null = null;

// pseudo/virtual filesystems that clutter `si.fsSize()` inside containers —
// not real storage, never worth showing
const VIRTUAL_FS_TYPES = new Set([
  "tmpfs", "devtmpfs", "devfs", "overlay", "squashfs", "proc", "sysfs", "cgroup", "cgroup2", "autofs",
]);

// macOS reports a handful of internal APFS volumes (Preboot/VM/Update/Data,
// asset-cache mounts under /System/Library/...) that all share the same
// underlying physical container as "/" — not separate drives a user would
// recognize. /private is the same story (firmlink target for /tmp, /var,
// etc). Neither prefix exists on Linux, so this is a no-op on the homelab/
// Docker target; it only cleans up local macOS dev.
function isRelevantMount(mount: string): boolean {
  return mount === "/" || (!mount.startsWith("/System/") && !mount.startsWith("/private/"));
}

async function readDrives(): Promise<HostTelemetry["drives"]> {
  const disks = await si.fsSize();
  return disks
    .filter(
      (d) => d.size > 0 && !VIRTUAL_FS_TYPES.has((d.type ?? "").toLowerCase()) && isRelevantMount(d.mount),
    )
    .map((d) => ({
      name: d.mount,
      mount: d.mount,
      used_bytes: d.used,
      total_bytes: d.size,
      used_pct: d.use,
    }));
}

async function readNetwork(): Promise<HostTelemetry["network"]> {
  const interfaces = await si.networkStats("*");
  const active = interfaces.filter((i) => i.iface !== "lo" && !i.iface.startsWith("lo"));
  return active.reduce(
    (sum, i) => ({
      rx_bytes: sum.rx_bytes + (i.rx_bytes ?? 0),
      tx_bytes: sum.tx_bytes + (i.tx_bytes ?? 0),
      rx_rate_bps: sum.rx_rate_bps + (i.rx_sec ?? 0),
      tx_rate_bps: sum.tx_rate_bps + (i.tx_sec ?? 0),
    }),
    { rx_bytes: 0, tx_bytes: 0, rx_rate_bps: 0, tx_rate_bps: 0 },
  );
}

async function readHostTelemetry(): Promise<HostTelemetry> {
  const [load, mem, drives, network] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    readDrives(),
    readNetwork(),
  ]);

  const usedMem = mem.total - mem.available;

  return {
    cpu: {
      used_pct: load.currentLoad,
      // os.loadavg() is Unix-only — returns [0, 0, 0] on Windows, which is
      // the platform's own behavior, not a bug here
      load_avg: loadavg() as [number, number, number],
    },
    memory: {
      used_bytes: usedMem,
      total_bytes: mem.total,
      used_pct: (usedMem / mem.total) * 100,
    },
    drives,
    network,
    uptime_seconds: uptime(),
  };
}

export async function getSystemStats(): Promise<HostTelemetry> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;
  if (inFlight) return inFlight;
  inFlight = readHostTelemetry()
    .then((data) => {
      cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
