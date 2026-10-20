"use client";

// Dev-only harness for the Widget Creator's verify step
// (docs/design/WIDGET_SIZE_PRESETS.md §10): renders the widget in ./target.ts alone,
// in a Slot Layout cell of exactly ?w=×?h= px, at ?preset=. The verifier
// (scripts/verify-widget-frame.mjs) waits for data-verify-ready, then checks
// the cell for content that doesn't fit. The target is a static import on
// purpose: Turbopack can't import() a path built at runtime, and registering
// a new widget in customComponentMap.tsx would full-reload the dashboard.

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Box } from "lucide-react";
import { LayoutProvider } from "@/components/dashboard/LayoutProvider";
import { WidgetShell } from "@/components/framework/WidgetShell";
import { SIZE_PRESETS, isPresetId } from "@/config/sizePresets";
import type { WidgetManifest, WidgetSize } from "@/config/widgets";
import { VERIFY_TARGET } from "./target";

/** nearest S/M/L the widget has, as SlotWidgetCell does */
function supportedSize(size: WidgetSize, sizes: WidgetSize[]): WidgetSize {
  if (sizes.includes(size)) return size;
  const order: WidgetSize[] = ["S", "M", "L"];
  const wanted = order.indexOf(size);
  return [...sizes].sort((a, b) => Math.abs(order.indexOf(a) - wanted) - Math.abs(order.indexOf(b) - wanted))[0];
}

const noopSubscribe = () => () => {};

function Frame() {
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  // client-only: a widget showing the time can differ between the server
  // render and hydration, and that mismatch isn't a layout problem
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // after fonts load and the shell's 0.3s entrance scale-in has finished —
  // measuring mid-animation would read scaled rects
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      setTimeout(() => { if (!cancelled) setReady(true); }, 800);
    });
    return () => { cancelled = true; };
  }, []);

  if (!isClient) return null;
  if (!VERIFY_TARGET) return <p>no widget under test</p>;

  const width = Number(params.get("w")) || 481;
  const height = Number(params.get("h")) || 236;
  const presetParam = params.get("preset");
  const preset = isPresetId(presetParam) ? presetParam : "card";
  const { id, entry, Component } = VERIFY_TARGET;

  const manifest: WidgetManifest = { id, icon: Box, component: Component, ...entry };
  const legacy = SIZE_PRESETS[preset].legacy;
  const size = supportedSize(legacy.size, manifest.sizes);
  const orientation = manifest.orientations.includes(legacy.orientation) ? legacy.orientation : manifest.defaults.orientation;

  return (
    <div style={{ padding: 24 }} data-verify-ready={ready ? id : undefined}>
      <div className="slot-cell" style={{ width, height }}>
        <WidgetShell
          manifest={manifest}
          config={{
            size,
            orientation,
            preset,
            box: { width, height },
            slot: { region: "left", colSpan: 1, rowSpan: 1 },
          }}
        />
      </div>
    </div>
  );
}

export default function WidgetFramePage() {
  return (
    <main className="relative min-h-screen w-full">
      <LayoutProvider>
        <Suspense>
          <Frame />
        </Suspense>
      </LayoutProvider>
    </main>
  );
}
