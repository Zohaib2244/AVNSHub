"use client";

import { useState, useSyncExternalStore } from "react";
import { SettingsPane } from "./SettingsPane";
import { ChatCanvas } from "./ChatCanvas";
import { IdeateCanvas } from "./IdeateCanvas";
import { PlanCanvas, type WidgetBrief } from "./PlanCanvas";
import { getPrefs, getServerPrefs, subscribePrefs } from "@/lib/prefs";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";

export type PanelMode = "create" | "edit" | "ideate" | "plan";

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

// Build prompt pre-filled when a user finalizes an Ideate-mode mockup —
// editable before send, same as every other generate call.
const FINALIZE_PROMPT =
  "Build this widget to match the finalized mockup exactly — recreate the layout, spacing, colors, and animations using the framework's real CSS variables and per-size (useWidget().size) branching instead of the mockup's static hardcoded boxes.";

export function WidgetCreatorPanel() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [settings, setSettings] = useState<GenerateSettings>(loadSettings);
  const [panelMode, setPanelMode] = useState<PanelMode>(() => (loadSettings().editSlug ? "edit" : "create"));
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(undefined);
  // bumped on every finalize so ChatCanvas remounts (re-running its lazy
  // prompt initializer) even if FINALIZE_PROMPT's text is identical to the
  // previous finalize — a plain string key would collide and silently no-op
  const [finalizeNonce, setFinalizeNonce] = useState(0);
  // plan → ideate bridge: concept string pre-fills IdeateCanvas's prompt textarea
  const [planIdeatePrompt, setPlanIdeatePrompt] = useState<string | undefined>(undefined);
  const [planIdeateNonce, setPlanIdeateNonce] = useState(0);

  function patchSettings(patch: Partial<GenerateSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function changeMode(mode: PanelMode) {
    setPanelMode(mode);
    if (mode === "create") patchSettings({ editSlug: undefined });
    else if (mode === "edit" && !settings.editSlug) {
      // SettingsPane's mode toggle already picks the first custom widget id
      // when switching to edit — nothing to do here.
    }
  }

  function handleFinalize(html: string) {
    patchSettings({ designReferenceHtml: html, editSlug: undefined });
    setPendingPrompt(FINALIZE_PROMPT);
    setFinalizeNonce((n) => n + 1);
    setPanelMode("create");
  }

  function handlePlanBuild(brief: WidgetBrief) {
    patchSettings({
      name: brief.title,
      slug: brief.slug,
      icon: brief.icon,
      sizes: brief.sizes ?? ["S", "M"],
      orientations: ["h"],
      sDescription: brief.sContent,
      mDescription: brief.mContent,
      lDescription: brief.lContent,
      dataShape: brief.dataShape || undefined,
      editSlug: undefined,
      designReferenceHtml: undefined,
    });
    setPanelMode("create");
  }

  function handlePlanVisualize(brief: WidgetBrief) {
    setPlanIdeatePrompt(brief.concept || brief.title);
    setPlanIdeateNonce((n) => n + 1);
    setPanelMode("ideate");
  }

  return (
    <div className="wc-panel">
      <div className="wc-left">
        <SettingsPane settings={settings} onChange={patchSettings} mode={panelMode} onModeChange={changeMode} />
      </div>
      <div className="wc-divider" />
      <div className="wc-right">
        {panelMode === "plan" ? (
          <PlanCanvas
            activeHarness={prefs.activeHarness}
            onBuild={handlePlanBuild}
            onVisualize={handlePlanVisualize}
          />
        ) : panelMode === "ideate" ? (
          <IdeateCanvas
            key={`ideate-${planIdeateNonce}`}
            activeHarness={prefs.activeHarness}
            harnessChain={prefs.harnessChain}
            onFinalize={handleFinalize}
            initialPrompt={planIdeatePrompt}
          />
        ) : (
          <ChatCanvas
            key={pendingPrompt ? `prefill-${finalizeNonce}` : "chat"}
            settings={settings}
            onSettingsChange={patchSettings}
            activeHarness={prefs.activeHarness}
            harnessChain={prefs.harnessChain}
            initialPrompt={pendingPrompt}
          />
        )}
      </div>
    </div>
  );
}
