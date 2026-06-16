"use client";

import { useState, useSyncExternalStore } from "react";
import { SettingsPane } from "./SettingsPane";
import { ChatCanvas } from "./ChatCanvas";
import { getPrefs, getServerPrefs, subscribePrefs } from "@/lib/prefs";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";

const EMPTY_SETTINGS: GenerateSettings = {
  sizes: ["S", "M", "L"],
  orientations: ["h"],
  hoe: false,
};

export function WidgetCreatorPanel() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [settings, setSettings] = useState<GenerateSettings>(EMPTY_SETTINGS);

  function patchSettings(patch: Partial<GenerateSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="wc-panel">
      <div className="wc-left">
        <SettingsPane settings={settings} onChange={patchSettings} />
      </div>
      <div className="wc-divider" />
      <div className="wc-right">
        <ChatCanvas
          settings={settings}
          activeHarness={prefs.activeHarness}
          harnessChain={prefs.harnessChain}
        />
      </div>
    </div>
  );
}
