"use client";

import { usePolling } from "@/lib/usePolling";
import { useWidget } from "@/components/framework/WidgetContext";
import { averageUptime, type HomelabStatus as HomelabStatusData, type ServiceStatus } from "@/lib/homelab";

// /api/homelab serves Uptime Kuma's view when Kuma is reachable (see
// lib/uptimeKuma.ts), which carries more than the v1 shape: the monitor's
// group, Kuma's own last message, and the last response time. All optional —
// a plain HOMELAB_STATUS_URL install still renders.
type Service = ServiceStatus & { group?: string; message?: string; ping?: number | null };
type Data = (HomelabStatusData & { services: Service[] }) | null;

const POLL_URL = "/api/homelab";

function useServices(pollMs: number) {
  const { data } = usePolling<Data>(POLL_URL, pollMs);
  const services = (data?.services ?? []) as Service[];
  const down = services.filter((s) => s.status === "down");
  return { services, down };
}

/** services grouped by their Kuma group, ungrouped ones last */
function byGroup(services: Service[]): [string, Service[]][] {
  const groups = new Map<string, Service[]>();
  for (const service of services) {
    const key = service.group ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), service]);
  }
  return [...groups.entries()].sort((a, b) => (a[0] === "other" ? 1 : b[0] === "other" ? -1 : 0));
}

export function HomelabStatus() {
  const { size, settings } = useWidget();
  const { services, down } = useServices(Number(settings.pollSeconds ?? 60) * 1000);

  if (services.length === 0) {
    return <div className="block-sub">no service data</div>;
  }

  const up = services.length - down.length;

  // S: the one number that matters — how many services are healthy
  if (size === "S") {
    return (
      <>
        <div className={`block-stat${down.length > 0 ? " accent" : ""}`}>{up}/{services.length}</div>
        <div className="block-sub">{down.length === 0 ? "all services up" : `${down.length} down`}</div>
      </>
    );
  }

  return (
    <>
      <div className={`block-stat${down.length > 0 ? " accent" : ""}`}>{up}/{services.length}</div>
      <div className="block-sub">
        {down.length === 0
          ? `all up · ${averageUptime(services) ?? "—"} avg 24h`
          : `down: ${down.map((s) => s.name).join(", ")}`}
      </div>

      <div className="svc-row">
        {services.map((s) => (
          <div className="svc" key={s.name} title={`${s.name}${s.group ? ` · ${s.group}` : ""} · ${s.uptime} 24h${s.message ? ` · ${s.message}` : ""}`}>
            <span className={`svc-dot${s.status === "down" ? " down" : ""}`} />
            {s.name}
          </div>
        ))}
      </div>
    </>
  );
}

export function HomelabStatusMore() {
  const { services, down } = useServices(60_000);
  if (services.length === 0) return <div className="block-sub">no service data</div>;

  return (
    <>
      {down.length > 0 && (
        <>
          <div className="more-head">down now</div>
          {down.map((s) => (
            <div className="more-row" key={s.name}>
              <span>{s.name}</span>
              <span className="more-meta">{s.message ?? "no response"}</span>
            </div>
          ))}
        </>
      )}

      {byGroup(services).map(([group, list]) => (
        <div key={group}>
          <div className="more-head">{group}</div>
          {list.map((s) => (
            <div className="more-row" key={s.name}>
              <span>
                <span className={`svc-dot${s.status === "down" ? " down" : ""}`} /> {s.name}
              </span>
              <span className="more-meta">
                {s.uptime}
                {typeof s.ping === "number" ? ` · ${s.ping}ms` : ""}
              </span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
