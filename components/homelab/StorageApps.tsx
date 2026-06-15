"use client";

import { usePolling } from "@/lib/usePolling";
import { formatBytes, type HomelabStatusV2 } from "@/lib/homelab";

const STORAGE_IDS = ["immich", "nextcloud"];

export function StorageApps() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);

  const services = data?.services.filter((s) => STORAGE_IDS.includes(s.id)) ?? [];

  if (services.length === 0) return <div className="block-value">—</div>;

  return (
    <div className="sub-list">
      {services.map((s) =>
        s.telemetry.type === "storage" ? (
          <div className="sub-row" key={s.id}>
            <div className="sub-row-head">
              <span className="sub-row-label">
                <span className={`svc-dot${s.status === "down" ? " down" : ""}`} />
                {s.name}
              </span>
              <span className="sub-row-meta">
                {formatBytes(s.telemetry.used_bytes)} / {formatBytes(s.telemetry.total_bytes)}
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${s.telemetry.used_pct}%` }} />
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}
