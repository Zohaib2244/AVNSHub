const CACHE_TTL_MS = 60_000;

// ─── v1 shape (current MVP) ───────────────────────────────────────────
// What HOMELAB_STATUS_URL returns today (simple dots + uptime %).

export type ServiceStatus = {
  name: string;
  status: "up" | "down";
  uptime: string;
};

export type HomelabStatus = {
  services: ServiceStatus[];
  last_checked: string;
} | null;

export function averageUptime(services: ServiceStatus[]): string | null {
  const values = services.map((s) => parseFloat(s.uptime)).filter((n) => !Number.isNaN(n));
  if (values.length === 0) return null;

  const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
  return `${avg.toFixed(1)}%`;
}

// Host-level telemetry — not tied to any single service, describes the
// machine the stack runs on.
export type DriveInfo = {
  name: string;
  mount: string;
  used_bytes: number;
  total_bytes: number;
  used_pct: number;
};

export type HostTelemetry = {
  cpu: { used_pct: number; load_avg: [number, number, number] };
  memory: { used_bytes: number; total_bytes: number; used_pct: number };
  drives: DriveInfo[];
  network: {
    rx_bytes: number;
    tx_bytes: number;
    rx_rate_bps: number;
    tx_rate_bps: number;
  };
  uptime_seconds: number;
};

type RawService = {
  name: string;
  status: string;
  uptime: string;
};

type RawResponse = {
  services?: RawService[];
  last_checked?: string;
  host?: HostTelemetry;
};

function isValidStatus(s: string): s is "up" | "down" {
  return s === "up" || s === "down";
}

// Realistic stand-in for the homelab response, used for local dev/
// testing on machines that can't reach the real homelab (e.g. a Mac with
// HOMELAB_STATUS_URL unset or unreachable). Enable with HOMELAB_MOCK_DATA=true.
function mockRawResponse(): RawResponse {
  return {
    last_checked: new Date().toISOString(),
    host: {
      cpu: { used_pct: 28, load_avg: [0.84, 0.91, 1.05] },
      memory: { used_bytes: 18_400_000_000, total_bytes: 34_359_738_368, used_pct: 53.6 },
      drives: [
        { name: "system (nvme0)", mount: "/", used_bytes: 182_000_000_000, total_bytes: 512_000_000_000, used_pct: 35.5 },
        { name: "media array", mount: "/mnt/media", used_bytes: 8_400_000_000_000, total_bytes: 16_000_000_000_000, used_pct: 52.5 },
      ],
      network: { rx_bytes: 1_280_000_000_000, tx_bytes: 340_000_000_000, rx_rate_bps: 4_500_000, tx_rate_bps: 850_000 },
      uptime_seconds: 1_036_800,
    },
    services: [
      {
        name: "immich",
        status: "up",
        uptime: "99.9%",
      },
      {
        name: "jellyfin",
        status: "up",
        uptime: "99.8%",
      },
      {
        name: "jellyseerr",
        status: "up",
        uptime: "99.7%",
      },
      {
        name: "radarr",
        status: "up",
        uptime: "99.6%",
      },
      {
        name: "sonarr",
        status: "up",
        uptime: "99.9%",
      },
      {
        name: "jackett",
        status: "down",
        uptime: "94.2%",
      },
      {
        name: "qbittorrent",
        status: "up",
        uptime: "99.4%",
      },
      {
        name: "nextcloud",
        status: "up",
        uptime: "99.9%",
      },
    ],
  };
}

let rawCache: { data: RawResponse | null; expiresAt: number } | null = null;

async function fetchRaw(): Promise<RawResponse | null> {
  if (rawCache && rawCache.expiresAt > Date.now()) {
    return rawCache.data;
  }

  if (process.env.HOMELAB_MOCK_DATA === "true") {
    const data = mockRawResponse();
    rawCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  }

  const url = process.env.HOMELAB_STATUS_URL;
  if (!url) {
    rawCache = { data: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }

  let data: RawResponse | null = null;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      data = (await response.json()) as RawResponse;
    }
  } catch {
    // Return stale cache rather than crash if the homelab is unreachable
    if (rawCache) return rawCache.data;
  }

  rawCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 || value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number): string {
  if (seconds <= 0) return "done";
  const hours = Math.floor(seconds / 3_600);
  const mins = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export async function getHomelabStatus(): Promise<HomelabStatus> {
  const raw = await fetchRaw();
  if (!raw || !raw.services || !raw.last_checked) return null;

  return {
    last_checked: raw.last_checked,
    services: raw.services
      .filter((s) => isValidStatus(s.status))
      .map((s) => ({ name: s.name, status: s.status as "up" | "down", uptime: s.uptime })),
  };
}
