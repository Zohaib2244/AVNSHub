"use client";

import { usePolling } from "@/lib/usePolling";
import { formatBytes, type HomelabStatusV2 } from "@/lib/homelab";

export function DiskStorage() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);

  const drives = data?.host.drives ?? [];
  const usedBytes = drives.reduce((sum, d) => sum + d.used_bytes, 0);
  const totalBytes = drives.reduce((sum, d) => sum + d.total_bytes, 0);

  return (
    <>
      <div className="block-value">{drives.length > 0 ? formatBytes(usedBytes) : "—"}</div>
      <div className="block-sub">{drives.length > 0 ? `of ${formatBytes(totalBytes)} total` : "no data"}</div>
    </>
  );
}

export function DiskStorageMore() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);

  const drives = data?.host.drives ?? [];
  if (drives.length === 0) return <div className="block-sub">no drive data</div>;

  return (
    <>
      <div className="more-head">drives</div>
      <div className="sub-list">
        {drives.map((d) => (
          <div className="sub-row" key={d.name}>
            <div className="sub-row-head">
              <span className="sub-row-label">{d.name}</span>
              <span className="sub-row-meta">
                {formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)}
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${d.used_pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
