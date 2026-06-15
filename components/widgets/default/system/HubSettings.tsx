"use client";

// The hub's own control surface — itself a widget. Per size:
//   S → theme mode toggle only
//   M → theme mode + palette picker
//   L → the full panel: theme, palette, global prefs, layout reset
// (Adding/removing widgets lives in the separate widget manager.)

import { useSyncExternalStore } from "react";
import { Moon, RotateCcw, Sun, SunMoon } from "lucide-react";
import { THEME_PACKS } from "@/config/themes";
import {
  getPalette,
  getServerPalette,
  getServerThemeMode,
  getThemeMode,
  setPalette,
  setThemeMode,
  subscribeTheme,
  type ThemeMode,
} from "@/lib/theme";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs } from "@/lib/prefs";
import { DEFAULT_LAYOUT_MODE, setLayoutMode } from "@/lib/layoutMode";
import { resetSlotLayout } from "@/lib/slotLayout";
import { useWidget } from "@/components/framework/WidgetContext";
import { useLayout } from "@/components/dashboard/LayoutProvider";

const THEME_OPTIONS: { mode: ThemeMode; Icon: typeof Sun }[] = [
  { mode: "light", Icon: Sun },
  { mode: "auto", Icon: SunMoon },
  { mode: "dark", Icon: Moon },
];

function ThemeModeRow() {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, getServerThemeMode);
  return (
    <div className="seg-row">
      {THEME_OPTIONS.map(({ mode: m, Icon }) => (
        <button
          key={m}
          type="button"
          className={`seg-btn${mode === m ? " active" : ""}`}
          onClick={() => setThemeMode(m)}
        >
          <Icon size={12} strokeWidth={1.75} />
          {m}
        </button>
      ))}
    </div>
  );
}

function PaletteRow() {
  const palette = useSyncExternalStore(subscribeTheme, getPalette, getServerPalette);
  return (
    <div className="palette-row">
      {THEME_PACKS.map((pack) => (
        <button
          key={pack.id}
          type="button"
          className={`palette-btn${palette === pack.id ? " active" : ""}`}
          onClick={() => setPalette(pack.id)}
          title={`${pack.label} palette`}
        >
          <span className="palette-swatch" style={{ background: pack.swatch[0] }}>
            <span style={{ background: pack.swatch[1] }} />
            <span style={{ background: pack.swatch[2] }} />
          </span>
          {pack.label}
        </button>
      ))}
    </div>
  );
}

function GeneralPrefs() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const { resetLayout } = useLayout();

  function resetAll() {
    resetLayout();
    resetSlotLayout();
    setLayoutMode(DEFAULT_LAYOUT_MODE);
  }

  return (
    <>
      <div className="more-head">general</div>
      <label className="wset-row">
        <span>live data polling</span>
        <input
          type="checkbox"
          checked={prefs.pollingEnabled}
          onChange={(e) => setPrefs({ pollingEnabled: e.target.checked })}
        />
      </label>
      <label className="wset-row">
        <span>boot sequence intro</span>
        <input
          type="checkbox"
          checked={prefs.bootSequence}
          onChange={(e) => setPrefs({ bootSequence: e.target.checked })}
        />
      </label>
      <button type="button" className="wset-hide-btn hub-reset" onClick={resetAll}>
        <RotateCcw size={12} strokeWidth={1.75} />
        reset layout & widget config
      </button>
    </>
  );
}

export function HubSettings() {
  const { size } = useWidget();

  return (
    <>
      <div className="wset-row">
        <span>theme</span>
        <ThemeModeRow />
      </div>
      {size !== "S" && <PaletteRow />}
      {size === "L" && <GeneralPrefs />}
    </>
  );
}
