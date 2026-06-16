"use client";

import { motion } from "framer-motion";
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
      <motion.div
        className="absolute inset-0"
        animate={
          anyDown
            ? { opacity: [1, 0.3, 1, 0.6, 1, 0.2, 1] }
            : { opacity: [0.6, 1, 0.6] }
        }
        transition={{
          duration: anyDown ? 1.2 : 2.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ background: color }}
      />
    </div>
  );
}
