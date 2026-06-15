"use client";

import { useSyncExternalStore } from "react";
import { GlyphStrip } from "@/components/GlyphStrip";
import { BootSequence } from "@/components/BootSequence";
import { LayoutProvider } from "@/components/LayoutProvider";
import { Dashboard } from "@/components/Dashboard";
import { SlotDashboard } from "@/components/SlotDashboard";
import { HubCorePanel } from "@/components/HubCorePanel";
import { getLayoutMode, getServerLayoutMode, subscribeLayoutMode } from "@/lib/layoutMode";

export default function Home() {
  const mode = useSyncExternalStore(subscribeLayoutMode, getLayoutMode, getServerLayoutMode);

  return (
    <main className="relative min-h-screen w-full">
      <BootSequence />
      <GlyphStrip />

      {/* columns + widget arrangement render from layout state — defaults in
          config/widgets.tsx, user overrides in localStorage["nutmag-layout"]
          (graph) / localStorage["nutmag-slot-layout"] (slots). Mode itself
          comes from lib/layoutMode.ts, toggled via the AVN Hub widget. */}
      <LayoutProvider>
        <HubCorePanel />
        {mode === "slots" ? <SlotDashboard /> : <Dashboard />}
      </LayoutProvider>
    </main>
  );
}
