"use client";

import { usePolling } from "@/lib/usePolling";
import { formatEta, type HomelabStatusV2 } from "@/lib/homelab";

const ARR_IDS = ["jellyseerr", "radarr", "sonarr", "qbittorrent"];

function useArrServices() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);
  return data?.services.filter((s) => ARR_IDS.includes(s.id)) ?? [];
}

function summarize(telemetry: HomelabStatusV2["services"][number]["telemetry"]): string {
  switch (telemetry.type) {
    case "request_queue":
      return `${telemetry.pending_count} pending`;
    case "download_queue":
      return `${telemetry.queue_size} in queue`;
    default:
      return "—";
  }
}

export function ArrStack() {
  const services = useArrServices();

  if (services.length === 0) return <div className="block-value">—</div>;

  return (
    <div className="sub-list">
      {services.map((s) => (
        <div className="sub-row" key={s.id}>
          <div className="sub-row-head">
            <span className="sub-row-label">
              <span className={`svc-dot${s.status === "down" ? " down" : ""}`} />
              {s.name}
            </span>
            <span className="sub-row-meta">{summarize(s.telemetry)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ArrStackMore() {
  const services = useArrServices();

  if (services.length === 0) return <div className="block-sub">no queue data</div>;

  return (
    <>
      <div className="more-head">queue detail</div>
      {services.map((s) => {
        if (s.telemetry.type === "request_queue") {
          return (
            <div className="more-row" key={s.id}>
              <span>{s.name}</span>
              <span className="more-meta">
                {s.telemetry.pending_count} pending · {s.telemetry.approved_count} approved ·{" "}
                {s.telemetry.available_count} available
              </span>
            </div>
          );
        }

        if (s.telemetry.type === "download_queue") {
          if (s.telemetry.items.length === 0) {
            return (
              <div className="more-row" key={s.id}>
                <span>{s.name}</span>
                <span className="more-meta">queue empty</span>
              </div>
            );
          }

          return s.telemetry.items.map((item, i) => (
            <div className="more-row" key={`${s.id}-${i}`}>
              <span>{item.title}</span>
              <span className="more-meta">
                {item.progress_pct.toFixed(0)}% · {formatEta(item.eta_seconds)}
              </span>
            </div>
          ));
        }

        return null;
      })}
    </>
  );
}
