// Top-level layout mode — mirrors the lib/prefs.ts external-store pattern.
// A single enum gating which dashboard tree app/page.tsx mounts. "slots" is
// an internal label only — HubSettings is free to relabel the toggle later.

export type LayoutMode = "graph" | "slots";

export const DEFAULT_LAYOUT_MODE: LayoutMode = "slots";

const STORAGE_KEY = "nutmag-layout-mode";
const listeners = new Set<() => void>();

let layoutMode: LayoutMode | null = null;

function sanitize(raw: unknown): LayoutMode {
  return raw === "graph" || raw === "slots" ? raw : DEFAULT_LAYOUT_MODE;
}

export function getLayoutMode(): LayoutMode {
  if (layoutMode === null) {
    layoutMode = DEFAULT_LAYOUT_MODE;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) layoutMode = sanitize(raw);
    } catch {
      // corrupt/blocked storage — keep the default
    }
  }
  return layoutMode;
}

export function getServerLayoutMode(): LayoutMode {
  return DEFAULT_LAYOUT_MODE;
}

export function setLayoutMode(mode: LayoutMode) {
  layoutMode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // storage full/blocked — mode still applies for this session
  }
  listeners.forEach((listener) => listener());
}

export function subscribeLayoutMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
