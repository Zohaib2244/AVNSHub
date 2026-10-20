"use client";
import "./ClockWidget.css";
import "./ClockThemes.css";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  applyTheme,
  getServerThemeMode,
  getThemeMode,
  setThemeMode,
  subscribeTheme,
} from "@/lib/theme";
import { useWidget } from "@/components/framework/WidgetContext";
import { useClockData } from "./clockData";
import type { ClockChrome } from "./clockTheme";
import { MinimalTheme } from "./clock-themes/MinimalTheme";
import { ArcDialTheme } from "./clock-themes/ArcDialTheme";
import { LedgerTheme } from "./clock-themes/LedgerTheme";
import { SplitCardTheme } from "./clock-themes/SplitCardTheme";
import { SplitSkyTheme } from "./clock-themes/SplitSkyTheme";
import { SplitPulseTheme } from "./clock-themes/SplitPulseTheme";
import { HorizonTheme } from "./clock-themes/HorizonTheme";
import { FlapTheme } from "./clock-themes/FlapTheme";
import { TerminalTheme } from "./clock-themes/TerminalTheme";
import { MatrixTheme } from "./clock-themes/MatrixTheme";

const LOFI_STREAM = "https://streams.ilovemusic.de/iloveradio17.mp3";

const THEMES = {
  minimal: MinimalTheme,
  arc: ArcDialTheme,
  ledger: LedgerTheme,
  split: SplitCardTheme,
  "split-sky": SplitSkyTheme,
  "split-pulse": SplitPulseTheme,
  horizon: HorizonTheme,
  flap: FlapTheme,
  terminal: TerminalTheme,
  matrix: MatrixTheme,
} as const;

function isThemeKey(v: unknown): v is keyof typeof THEMES {
  return typeof v === "string" && v in THEMES;
}

export function ClockWidget() {
  const { size, settings } = useWidget();
  const d = useClockData();
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, getServerThemeMode);

  const [lofiPlaying, setLofiPlaying] = useState(false);
  const [lofiLabel, setLofiLabel] = useState("lofi hip-hop radio");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // keeps auto theme mode flipping at 06:00/20:00 in step with the clock's
  // own 1s tick - a no-op the rest of the time
  useEffect(() => {
    applyTheme();
  }, [d.now]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function toggleLofi() {
    if (lofiPlaying) {
      audioRef.current?.pause();
      setLofiPlaying(false);
      setLofiLabel("lofi hip-hop radio");
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio(LOFI_STREAM);
      audioRef.current.volume = 0.4;
    }
    audioRef.current
      .play()
      .then(() => setLofiLabel("lofi hip-hop radio — live"))
      .catch(() => setLofiLabel("autoplay blocked — allow audio"));
    setLofiPlaying(true);
  }

  const chrome: ClockChrome = {
    showCalendar: settings.showCalendar !== false,
    showLofi: settings.showLofi !== false,
    lofiPlaying,
    lofiLabel,
    toggleLofi,
    themeMode: mode,
    setThemeMode,
  };

  const Theme = isThemeKey(settings.theme) ? THEMES[settings.theme] : MinimalTheme;

  return <Theme chrome={chrome} d={d} size={size} />;
}
