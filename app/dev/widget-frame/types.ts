import type { ComponentType } from "react";
import type { WidgetManifest } from "@/config/widgets";

/** the registry-entry fields the frame needs to build a manifest */
export type VerifyEntry = Pick<
  WidgetManifest,
  "title" | "sizes" | "orientations" | "defaults" | "minPx" | "presets" | "defaultPreset" | "fill" | "settings" | "flags"
>;

export type VerifyTarget = { id: string; entry: VerifyEntry; Component: ComponentType };
