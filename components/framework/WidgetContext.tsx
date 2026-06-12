"use client";

// Context the WidgetShell provides to widget content components. Content code
// reads its placement + settings through useWidget() instead of props, so the
// registry signature stays a bare ComponentType and deeply nested pieces can
// reach the widget state without prop drilling.

import { createContext, useContext } from "react";
import type { Orientation, SettingsValues, WidgetSize } from "@/config/widgets";

export type WidgetCtx = {
  id: string;
  /** effective size — the persisted size, or the cascade-adjusted size while
      a "grow" widget (or one of its displaced neighbors) is hovered */
  size: WidgetSize;
  orientation: Orientation;
  /** flyout open, overlay open, or cascade-active (grown/shrunk) */
  expanded: boolean;
  /** true while rendering inside the centered overlay modal */
  inOverlay: boolean;
  /** squeezed to S-span without supporting "S" — render a MicroView instead */
  micro: boolean;
  /** manifest schema defaults merged with the user's stored values */
  settings: SettingsValues;
};

export const WidgetContext = createContext<WidgetCtx | null>(null);

export function useWidget(): WidgetCtx {
  const ctx = useContext(WidgetContext);
  if (!ctx) throw new Error("useWidget must be used inside a <WidgetShell>");
  return ctx;
}
