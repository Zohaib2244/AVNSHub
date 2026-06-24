"use client";

import { GlyphStrip } from "@/components/dashboard/GlyphStrip";
import { BootSequence } from "@/components/dashboard/BootSequence";
import { LayoutProvider } from "@/components/dashboard/LayoutProvider";
import { SlotDashboard } from "@/components/dashboard/SlotDashboard";
import { ThemeRuntimeSync } from "@/components/dashboard/ThemeRuntimeSync";
import { WallpaperLayer } from "@/components/dashboard/WallpaperLayer";

export default function Home() {
  return (
    <main className="relative min-h-screen w-full">
      <ThemeRuntimeSync />
      <WallpaperLayer />
      <BootSequence />
      <GlyphStrip />

      <LayoutProvider>
        <SlotDashboard />
      </LayoutProvider>
    </main>
  );
}
