"use client";

import { usePolling } from "@/lib/usePolling";
import type { HomelabStatusV2 } from "@/lib/homelab";

function useJellyfinTelemetry() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);
  const service = data?.services.find((s) => s.id === "jellyfin");
  return service && service.telemetry.type === "media_sessions" ? service.telemetry : null;
}

export function Jellyfin() {
  const telemetry = useJellyfinTelemetry();

  return (
    <div className="block-value accent">
      {telemetry ? `${telemetry.session_count} active session${telemetry.session_count === 1 ? "" : "s"}` : "—"}
    </div>
  );
}

export function JellyfinMore() {
  const telemetry = useJellyfinTelemetry();

  if (!telemetry || telemetry.active_sessions.length === 0) {
    return <div className="block-sub">nothing streaming</div>;
  }

  return (
    <>
      <div className="more-head">now streaming</div>
      {telemetry.active_sessions.map((session, i) => (
        <div className="more-row" key={i}>
          <span>
            {session.user} · {session.title}
          </span>
          <span className="more-meta">
            {session.progress_pct.toFixed(0)}% · {session.device}
          </span>
        </div>
      ))}
    </>
  );
}
