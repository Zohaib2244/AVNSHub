// Uptime Kuma as the homelab's status source.
//
// Kuma already watches every service (28 monitors on avns2), so the hub reads
// from it instead of a bespoke status endpoint. Two sources, in order:
//
//   1. A published status page — the documented, version-stable HTTP API
//      (`/api/status-page/<slug>` + `/api/status-page/heartbeat/<slug>`), no
//      auth. Set UPTIME_KUMA_STATUS_PAGE to the page's URL to use it.
//   2. Kuma's SQLite file, read-only. Zero setup (no API key, no status page
//      to publish) and fast — ~30ms for every monitor including 24h uptime —
//      but it does read another app's schema, so it is the fallback and any
//      error here just means "no data", never a crash.
//
// Both return the same v1 shape the Homelab Status widget already consumes.
import { existsSync } from "fs";
import type { HomelabStatus, ServiceStatus } from "@/lib/homelab";

/** where the uptime-kuma container's data volume is bind-mounted on avns2 */
const DEFAULT_DB = "/opt/docker/monitoring-stack/uptime-kuma/data/kuma.db";

/** Kuma heartbeat status codes */
const DOWN = 0;

export type KumaService = ServiceStatus & {
  /** the monitor's parent group in Kuma ("Media Stack", …), when it has one */
  group?: string;
  /** Kuma's own last message, e.g. "200 - OK" or "Request failed with status code 502" */
  message?: string;
  /** response time in ms for the last check */
  ping?: number | null;
};

export type KumaStatus = (HomelabStatus & { services: KumaService[] }) | null;

function dbPath(): string | null {
  const configured = process.env.UPTIME_KUMA_DB?.trim();
  const path = configured || DEFAULT_DB;
  return existsSync(path) ? path : null;
}

/** read straight from Kuma's SQLite (read-only); null when unavailable */
async function fromSqlite(): Promise<KumaStatus> {
  const path = dbPath();
  if (!path) return null;
  try {
    // node:sqlite is built in (Node 22+) — no dependency, and the import is
    // lazy so a Node build without it degrades to "no data" instead of
    // failing the whole route at module load.
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const rows = db.prepare(`
        SELECT m.name AS name, p.name AS parent,
               (SELECT status FROM heartbeat WHERE monitor_id = m.id ORDER BY time DESC LIMIT 1) AS status,
               (SELECT time   FROM heartbeat WHERE monitor_id = m.id ORDER BY time DESC LIMIT 1) AS last_time,
               (SELECT msg    FROM heartbeat WHERE monitor_id = m.id ORDER BY time DESC LIMIT 1) AS msg,
               (SELECT ping   FROM heartbeat WHERE monitor_id = m.id ORDER BY time DESC LIMIT 1) AS ping,
               (SELECT ROUND(100.0 * SUM(CASE WHEN status IN (1, 3) THEN 1 ELSE 0 END) / COUNT(*), 1)
                  FROM heartbeat WHERE monitor_id = m.id AND time > datetime('now', '-24 hours')) AS uptime24
        FROM monitor m
        LEFT JOIN monitor p ON p.id = m.parent
        WHERE m.active = 1 AND m.type != 'group'
        ORDER BY COALESCE(p.name, ''), m.name
      `).all() as Array<Record<string, string | number | null>>;

      const services: KumaService[] = rows.map((row) => ({
        name: String(row.name),
        // pending/maintenance count as up: neither means "the service is broken"
        status: Number(row.status) === DOWN ? "down" : "up",
        // uptime over the last 24h of heartbeats. Kuma's own number weights by
        // check duration; this counts heartbeats, which matches closely for
        // monitors on one interval and is the honest simple version.
        uptime: row.uptime24 === null ? "—" : `${row.uptime24}%`,
        group: row.parent ? String(row.parent) : undefined,
        message: row.msg ? String(row.msg) : undefined,
        ping: typeof row.ping === "number" ? row.ping : null,
      }));
      if (services.length === 0) return null;

      const latest = rows
        .map((row) => (row.last_time ? Date.parse(`${String(row.last_time).replace(" ", "T")}Z`) : 0))
        .reduce((max, time) => Math.max(max, time), 0);

      return { services, last_checked: new Date(latest || Date.now()).toISOString() };
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("uptime-kuma: could not read", path, error instanceof Error ? error.message : error);
    return null;
  }
}

type StatusPageMonitor = { name?: unknown };
type StatusPageGroup = { name?: unknown; monitorList?: StatusPageMonitor[] };
type HeartbeatEntry = { status?: unknown; time?: unknown; msg?: unknown; ping?: unknown };

/** read a published status page over HTTP — Kuma's documented public API */
async function fromStatusPage(pageUrl: string): Promise<KumaStatus> {
  const url = new URL(pageUrl);
  const slug = url.pathname.split("/").filter(Boolean).pop();
  if (!slug) return null;
  const base = `${url.origin}/api/status-page`;
  try {
    const [pageRes, beatRes] = await Promise.all([
      fetch(`${base}/${slug}`, { cache: "no-store" }),
      fetch(`${base}/heartbeat/${slug}`, { cache: "no-store" }),
    ]);
    if (!pageRes.ok || !beatRes.ok) return null;
    const page = (await pageRes.json()) as { publicGroupList?: StatusPageGroup[] };
    const beats = (await beatRes.json()) as {
      heartbeatList?: Record<string, HeartbeatEntry[]>;
      uptimeList?: Record<string, number>;
    };

    const services: KumaService[] = [];
    let latest = 0;
    for (const group of page.publicGroupList ?? []) {
      for (const monitor of group.monitorList ?? []) {
        const record = monitor as { id?: unknown; name?: unknown };
        const id = String(record.id ?? "");
        const beatList = beats.heartbeatList?.[id] ?? [];
        const last = beatList[beatList.length - 1];
        const uptime = beats.uptimeList?.[`${id}_24`];
        if (last?.time) latest = Math.max(latest, Date.parse(String(last.time).replace(" ", "T")));
        services.push({
          name: String(record.name ?? "unknown"),
          status: Number(last?.status) === DOWN ? "down" : "up",
          uptime: typeof uptime === "number" ? `${(uptime * 100).toFixed(1)}%` : "—",
          group: group.name ? String(group.name) : undefined,
          message: last?.msg ? String(last.msg) : undefined,
          ping: typeof last?.ping === "number" ? last.ping : null,
        });
      }
    }
    if (services.length === 0) return null;
    return { services, last_checked: new Date(latest || Date.now()).toISOString() };
  } catch (error) {
    console.warn("uptime-kuma: status page fetch failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Kuma's view of every monitored service, or null when Kuma isn't reachable */
export async function readUptimeKuma(): Promise<KumaStatus> {
  const page = process.env.UPTIME_KUMA_STATUS_PAGE?.trim();
  if (page) {
    const fromPage = await fromStatusPage(page);
    if (fromPage) return fromPage;
  }
  return fromSqlite();
}
