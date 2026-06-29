"use client";
import "./NutBotFaceWidget.css";

// NutBot for the Wallpaper Engine build — just the idle/ambient animated face
// in a corner, nothing else. Deliberately does NOT import NutBotTerminal (or
// anything it pulls in — real shell, chat, widget creator) so none of that
// server-dependent code ends up in the static wallpaper bundle at all.

import { NutBotFaceV2 } from "@/components/widgets/default/nutbot/NutBotFaceV2";

export function NutBotMascot() {
  return (
    <div className="nutbot-mini">
      <div className="nutbot-v2-scale nutbot-v2-scale-m">
        <NutBotFaceV2 compact />
      </div>
    </div>
  );
}
