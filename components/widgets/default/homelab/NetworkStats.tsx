"use client";

import { usePolling } from "@/lib/usePolling";
import { formatBytes, formatRate, type HomelabStatusV2 } from "@/lib/homelab";

export function NetworkStats() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);

  const net = data?.host.network ?? null;

  return (
    <>
      <div className="block-value">{net ? formatRate(net.rx_rate_bps + net.tx_rate_bps) : "—"}</div>
      <div className="block-sub">combined rx + tx</div>
    </>
  );
}

export function NetworkStatsMore() {
  const { data } = usePolling<HomelabStatusV2>("/api/homelab-v2", 60_000);

  const net = data?.host.network ?? null;
  if (!net) return <div className="block-sub">no network data</div>;

  return (
    <>
      <div className="more-head">interfaces</div>
      <div className="more-row">
        <span>download</span>
        <span className="more-meta">{formatRate(net.rx_rate_bps)}</span>
      </div>
      <div className="more-row">
        <span>upload</span>
        <span className="more-meta">{formatRate(net.tx_rate_bps)}</span>
      </div>
      <div className="more-row">
        <span>total received</span>
        <span className="more-meta">{formatBytes(net.rx_bytes)}</span>
      </div>
      <div className="more-row">
        <span>total sent</span>
        <span className="more-meta">{formatBytes(net.tx_bytes)}</span>
      </div>
    </>
  );
}
