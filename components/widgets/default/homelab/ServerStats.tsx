"use client";

import { Cpu, MemoryStick, HardDrive, Network } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { formatBytes, formatRate, type HomelabStatusV2 } from "@/lib/homelab";

export function ServerStats() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);

  const host = data?.host ?? null;
  const drives = host?.drives ?? [];
  const storagePct = drives.length > 0 ? drives.reduce((sum, d) => sum + d.used_pct, 0) / drives.length : null;

  return (
    <div className="stat-grid">
      <div className="stat-cell">
        <div className="stat-cell-label">
          <Cpu size={12} strokeWidth={1.75} />
          cpu
        </div>
        <div className="stat-cell-value">{host ? `${host.cpu.used_pct.toFixed(0)}%` : "—"}</div>
      </div>
      <div className="stat-cell">
        <div className="stat-cell-label">
          <MemoryStick size={12} strokeWidth={1.75} />
          memory
        </div>
        <div className="stat-cell-value">{host ? `${host.memory.used_pct.toFixed(0)}%` : "—"}</div>
      </div>
      <div className="stat-cell">
        <div className="stat-cell-label">
          <HardDrive size={12} strokeWidth={1.75} />
          storage
        </div>
        <div className="stat-cell-value">{storagePct !== null ? `${storagePct.toFixed(0)}%` : "—"}</div>
      </div>
      <div className="stat-cell">
        <div className="stat-cell-label">
          <Network size={12} strokeWidth={1.75} />
          network
        </div>
        <div className="stat-cell-value">
          {host ? formatRate(host.network.rx_rate_bps + host.network.tx_rate_bps) : "—"}
        </div>
      </div>
    </div>
  );
}

export function ServerStatsMore() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);

  const host = data?.host ?? null;
  if (!host) return <div className="block-sub">no host data</div>;
  const drives = host.drives;

  return (
    <>
      <div className="more-head">detail</div>
      <div className="more-row">
        <span>cpu load avg (1/5/15m)</span>
        <span className="more-meta">{host.cpu.load_avg.map((n) => n.toFixed(2)).join(" / ")}</span>
      </div>
      <div className="more-row">
        <span>memory used</span>
        <span className="more-meta">
          {formatBytes(host.memory.used_bytes)} / {formatBytes(host.memory.total_bytes)}
        </span>
      </div>
      <div className="more-row">
        <span>storage used</span>
        <span className="more-meta">
          {formatBytes(drives.reduce((sum, d) => sum + d.used_bytes, 0))} /{" "}
          {formatBytes(drives.reduce((sum, d) => sum + d.total_bytes, 0))}
        </span>
      </div>
      <div className="more-row">
        <span>network rx / tx</span>
        <span className="more-meta">
          {formatRate(host.network.rx_rate_bps)} / {formatRate(host.network.tx_rate_bps)}
        </span>
      </div>
    </>
  );
}
