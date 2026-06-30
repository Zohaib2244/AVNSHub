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

// Persisted alongside ChatCanvas's own sessionStorage keys (messages, done
// state) so settings — most importantly `editSlug`, which is what lets a
// follow-up chat message naturally edit rather than re-create a widget — also
// survive a reload. This matters even for a routine dev-server HMR reload, and
// especially for the deliberate one ChatCanvas's "add to layout" triggers when
// committing a brand-new widget (registering it writes customComponentMap.tsx,
// which Fast Refresh can't hot-swap).
const SETTINGS_KEY = "nutmag-creator-settings";

function loadSettings(): GenerateSettings {
  if (typeof window !== "undefined") {
    try {
      const saved = sessionStorage.getItem(SETTINGS_KEY);
      if (saved) return { ...EMPTY_SETTINGS, ...(JSON.parse(saved) as GenerateSettings) };
    } catch {}
  }
  return EMPTY_SETTINGS;
}

export function WidgetCreatorPanel() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [settings, setSettings] = useState<GenerateSettings>(loadSettings);

  function patchSettings(patch: Partial<GenerateSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
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
          onSettingsChange={patchSettings}
          activeHarness={prefs.activeHarness}
          harnessChain={prefs.harnessChain}
        />
      </div>
    </div>
  );
}
