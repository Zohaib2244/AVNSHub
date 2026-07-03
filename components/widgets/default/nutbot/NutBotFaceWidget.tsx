"use client";
import "./NutBotFaceWidget.css";

// NutBot, per size:
//   S / M → animated SVG robot face + one-line status ticker
//   L     → full interactive terminal (NutBotTerminal)

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NutBotFaceV2 } from "@/components/widgets/default/nutbot/NutBotFaceV2";
import { LOG_MESSAGES, NutBotTerminal } from "@/components/widgets/default/nutbot/NutBotTerminal";
import { useWidget } from "@/components/framework/WidgetContext";
import { getSignal, getServerSignal, subscribeSignal } from "@/lib/nutbotSignal";

export function NutBotFaceWidget() {
  const { size } = useWidget();
  const [line, setLine] = useState(LOG_MESSAGES[LOG_MESSAGES.length - 1]);
  const index = useRef(0);
  const signal = useSyncExternalStore(subscribeSignal, getSignal, getServerSignal);
  // NutBotFaceV2's own "focused" expression already draws its own scrolling
  // terminal-line text inside the SVG while working/browsing — showing the
  // ticker at the same time doubled up the on-screen text.
  const svgShowsOwnText = signal?.type === "working" || signal?.type === "browsing";

  useEffect(() => {
    const id = setInterval(() => {
      setLine(LOG_MESSAGES[index.current % LOG_MESSAGES.length]);
      index.current += 1;
    }, 2600);
    return () => clearInterval(id);
  }, []);

  if (size === "L") {
    return <NutBotTerminal />;
  }

  return (
    <div className="nutbot-mini">
      <div className={`nutbot-v2-scale nutbot-v2-scale-${size.toLowerCase()}`}>
        <NutBotFaceV2 compact={size === "S"} />
      </div>
      {!svgShowsOwnText && (
        <div className="nutbot-mini-ticker" aria-live="off">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={line}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              {line}
            </motion.span>
          </AnimatePresence>
        </div>
      )}
      <div className="nutbot-mini-hint">resize to L for terminal</div>
    </div>
  );
}
