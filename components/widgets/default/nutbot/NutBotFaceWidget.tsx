"use client";
import "./NutBotFaceWidget.css";

// NutBot, per size:
//   S / M → the animated face plus a one-line status ticker
//   L     → the full interactive terminal (NutBotTerminal)
// Resize the widget up to reach the terminal; there's no overlay/expansion.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NutBotFace } from "@/components/widgets/default/nutbot/NutBotFace";
import { LOG_MESSAGES, NutBotTerminal } from "@/components/widgets/default/nutbot/NutBotTerminal";
import { useWidget } from "@/components/framework/WidgetContext";

export function NutBotFaceWidget() {
  const { size } = useWidget();
  const [line, setLine] = useState(LOG_MESSAGES[LOG_MESSAGES.length - 1]);
  const index = useRef(0);

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
      <NutBotFace />
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
      <div className="nutbot-mini-hint">resize to L for terminal</div>
    </div>
  );
}
