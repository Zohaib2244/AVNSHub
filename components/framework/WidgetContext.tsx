"use client";

// Context the WidgetShell provides to widget content components. Content code
// reads its placement + settings through useWidget() instead of props, so the
// registry signature stays a bare ComponentType and deeply nested pieces can
// reach the widget state without prop drilling.

import { createContext, useContext } from "react";
import type { Orientation, SettingsValues, WidgetSize } from "@/config/widgets";

export type WidgetCtx = {
  id: string;
  /** the instance's current size tier — branch on this to render distinct
      S/M/L layouts (the framework's primary per-widget customization lever) */
  size: WidgetSize;
  orientation: Orientation;
  /** manifest schema defaults merged with the user's stored values */
  settings: SettingsValues;
};

export const WidgetContext = createContext<WidgetCtx | null>(null);

export function useWidget(): WidgetCtx {
  const ctx = useContext(WidgetContext);
  if (!ctx) throw new Error("useWidget must be used inside a <WidgetShell>");
  return ctx;
}
