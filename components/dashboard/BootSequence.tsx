"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getPrefs } from "@/lib/prefs";

// Reading sessionStorage during render would diverge from the server's render
// (which always sees "not booted"), causing a hydration mismatch. Defer the
// check to a layout effect, which only runs on the client and fires before
// paint — so a returning-within-session visitor never sees the overlay flash.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const LINES = [
  { text: "NUTMAGCARD / v2.0  ——  IDENTITY RUNTIME", type: "header" },
  { text: "────────────────────────────────────────", type: "divider" },
  { text: "  init display drivers            OK", type: "ok" },
  { text: "  mount /dev/homelab              OK", type: "ok" },
  { text: "  spotify.auth.handshake          OK", type: "ok" },
  { text: "  steam.api.connect               OK", type: "ok" },
  { text: "  homelab.ping                    PARTIAL", type: "warn" },
  { text: "  rendering identity card...", type: "default" },
];

const colorFor = {
  header:  "var(--text-primary)",
  divider: "var(--text-muted)",
  ok:      "var(--accent-cyan)",
  warn:    "var(--accent-orange)",
  default: "var(--text-muted)",
};

export function BootSequence() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [done, setDone] = useState(false);

  useIsomorphicLayoutEffect(() => {
    if (sessionStorage.getItem("nutmag-booted") || !getPrefs().bootSequence) {
      setDone(true);
    }
  }, []);

  useEffect(() => {
    if (done) return;

    let i = 0;
    const tick = setInterval(() => {
      i++;
      setVisibleLines(i);
      if (i >= LINES.length) {
        clearInterval(tick);
        setTimeout(() => {
          setExiting(true);
          setTimeout(() => {
            setDone(true);
            sessionStorage.setItem("nutmag-booted", "1");
          }, 700);
        }, 500);
      }
    }, 180);

    return () => clearInterval(tick);
  }, [done]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-[var(--bg-page)] flex items-center justify-center"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div className="w-[26rem] font-[family-name:var(--font-display)] text-sm leading-7 select-none">
            {LINES.slice(0, visibleLines).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.12 }}
                style={{ color: colorFor[line.type as keyof typeof colorFor] }}
              >
                {line.text}
              </motion.div>
            ))}
            {!exiting && visibleLines < LINES.length && (
              <motion.span
                className="inline-block w-2 h-[1em] bg-[var(--accent-orange)] align-middle"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
