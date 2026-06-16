"use client";

import { useEffect, useState } from "react";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const mins = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function UptimeStat() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/uptime")
        .then((r) => r.json())
        .then((d) => setLabel(formatUptime(d.uptimeSeconds)))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return <span>{label ?? "—"} uptime</span>;
}
