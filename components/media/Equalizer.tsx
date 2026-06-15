"use client";

import { motion } from "framer-motion";

const BARS = [
  { heights: [8, 18, 5, 14, 8],   duration: 0.7  },
  { heights: [14, 6, 20, 8, 14],  duration: 0.9  },
  { heights: [5, 16, 10, 20, 5],  duration: 0.65 },
  { heights: [18, 10, 6, 16, 18], duration: 0.8  },
];

export function Equalizer() {
  return (
    <span className="inline-flex items-end gap-px h-5" aria-hidden>
      {BARS.map((bar, i) => (
        <motion.span
          key={i}
          className="inline-block w-[3px] rounded-sm bg-[var(--accent-orange)]"
          animate={{ height: bar.heights.map((h) => `${h}px`) }}
          transition={{
            duration: bar.duration,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
          style={{ height: "8px" }}
        />
      ))}
    </span>
  );
}
