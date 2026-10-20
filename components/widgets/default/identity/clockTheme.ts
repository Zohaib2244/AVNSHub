// Shared prop contract every clock theme component renders from, plus the
// controls (lofi playback, theme mode) that live once in the dispatcher
// (ClockWidget.tsx) and get threaded down instead of each theme reaching
// into lib/theme.ts or owning its own <audio> element.

import type { WidgetSize } from "@/config/widgets";
import type { ThemeMode } from "@/lib/theme";
import type { ClockData } from "./clockData";

export type ClockChrome = {
  showCalendar: boolean;
  showLofi: boolean;
  lofiPlaying: boolean;
  lofiLabel: string;
  toggleLofi: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
};

export type ClockThemeProps = {
  size: WidgetSize;
  d: ClockData;
  chrome: ClockChrome;
};
