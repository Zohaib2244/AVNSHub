"use client";

import { useState, useSyncExternalStore } from "react";
import customRegistryRaw from "@/config/customRegistry.json";
import { getPrefs, getServerPrefs, subscribePrefs } from "@/lib/prefs";
import {
  getStoredProjects,
  getServerProjects,
  subscribeProjects,
  createProject,
  ensureProject,
  type WidgetProject,
  type ProjectMode,
} from "@/lib/widget-creator/projectStore";
import { CreatorProjectList } from "./CreatorProjectList";
import { CreatorEntryPicker } from "./CreatorEntryPicker";
import { CreatorWorkspace } from "./CreatorWorkspace";

// kept for SettingsPane import compatibility (it imports PanelMode from here)
export type PanelMode = "create" | "edit" | "ideate" | "plan";

type View = "list" | "picker" | "workspace";

const REGISTRY_KEYS = Object.keys(customRegistryRaw as Record<string, unknown>);

export function WidgetCreatorPanel() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [view, setView] = useState<View>("list");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // getStoredProjects() returns the stable module-level reference — never a
  // new array unless a mutation ran. This satisfies useSyncExternalStore's
  // requirement that consecutive getSnapshot calls return the same reference
  // when nothing has changed (prevents the "infinite loop" warning).
  const storedProjects = useSyncExternalStore(
    subscribeProjects,
    getStoredProjects,
    getServerProjects,
  );

  // Merge logic in render body (not in getSnapshot) so the snapshot stays stable.
  // Auto-correct hasBuildOutput for any project whose slug left the registry.
  const registryKeySet = new Set(REGISTRY_KEYS);
  const correctedProjects = storedProjects.map((p) =>
    p.hasBuildOutput && p.slug && !registryKeySet.has(p.slug)
      ? { ...p, hasBuildOutput: false as const, slug: undefined }
      : p,
  );
  const storedSlugs = new Set(correctedProjects.map((p) => p.slug).filter(Boolean));
  const virtualCreated: WidgetProject[] = REGISTRY_KEYS.filter(
    (slug) => !storedSlugs.has(slug),
  ).map((slug) => {
    const entry = (customRegistryRaw as Record<string, { title?: string }>)[slug];
    return {
      id: slug,
      displayName: entry?.title ?? slug,
      slug,
      activeMode: "build" as ProjectMode,
      entryMode: "build" as ProjectMode,
      createdAt: 0,
      updatedAt: 0,
      hasBrief: false,
      hasIdeateRounds: false,
      hasBuildOutput: true,
    };
  });

  const allProjects = [...correctedProjects, ...virtualCreated];
  const activeProject = allProjects.find((p) => p.id === activeProjectId) ?? null;

  function handleNewWidget() {
    setView("picker");
  }

  function handlePick(mode: ProjectMode) {
    const project = createProject(mode);
    setActiveProjectId(project.id);
    setView("workspace");
  }

  function handleOpenProject(project: WidgetProject) {
    // promote virtual entry to a real stored entry on first open
    ensureProject(project);
    setActiveProjectId(project.id);
    setView("workspace");
  }

  function handleBack() {
    setActiveProjectId(null);
    setView("list");
  }

  return (
    <div className="wc-panel">
      {view === "list" && (
        <CreatorProjectList
          onNewWidget={handleNewWidget}
          onOpenProject={handleOpenProject}
        />
      )}

      {view === "picker" && (
        <CreatorEntryPicker
          onPick={handlePick}
          onBack={() => setView("list")}
        />
      )}

      {view === "workspace" && activeProject && (
        <CreatorWorkspace
          key={activeProject.id}
          project={activeProject}
          onBack={handleBack}
          activeHarness={prefs.activeHarness}
          harnessChain={prefs.harnessChain}
        />
      )}
    </div>
  );
}
