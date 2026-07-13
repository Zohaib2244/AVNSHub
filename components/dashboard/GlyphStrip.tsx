"use client";

import { usePolling } from "@/lib/usePolling";
import type { HomelabStatus } from "@/lib/homelab";

export function GlyphStrip() {
  const { data } = usePolling<HomelabStatus>("/api/homelab", 60_000);

  const anyDown = (data?.services ?? []).some((s) => s.status === "down");
  const color = anyDown ? "var(--accent-orange)" : "var(--accent-cyan)";

  return (
    <div
      className="absolute left-0 top-0 bottom-0 w-[3px]"
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{ background: color, opacity: anyDown ? 1 : 0.8 }}
      />
    </div>
  );
}
