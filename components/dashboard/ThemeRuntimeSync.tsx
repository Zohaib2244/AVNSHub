"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  applyThemeSettings,
  getPalette,
  getServerPalette,
  getServerThemeMode,
  getThemeMode,
  subscribeTheme,
} from "@/lib/theme";

export function ThemeRuntimeSync() {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, getServerThemeMode);
  const palette = useSyncExternalStore(subscribeTheme, getPalette, getServerPalette);

  useEffect(() => {
    applyThemeSettings();
    const id = window.setInterval(applyThemeSettings, 60_000);
    return () => window.clearInterval(id);
  }, [mode, palette]);

  return null;
}
