// The Hub Core settings sections — shared by the settings panel's rail
// (components/dashboard/HubCorePanel.tsx) and the command palette, which can
// jump straight to one. Lives here rather than in HubCorePanel so
// LayoutProvider can hold the selected section without importing the panel
// that reads it back out of the provider.

export type CanvasSettingsSection = "theme" | "canvas" | "widgets" | "layout" | "canvases" | "system";

export const SETTINGS_SECTIONS: { id: CanvasSettingsSection; label: string }[] = [
  { id: "theme", label: "theme" },
  { id: "canvas", label: "canvas" },
  { id: "widgets", label: "widget style" },
  { id: "layout", label: "layout" },
  { id: "canvases", label: "canvases" },
  { id: "system", label: "system" },
];
