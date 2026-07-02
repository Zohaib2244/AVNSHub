"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import customRegistryRaw from "@/config/customRegistry.json";
import { getPrefs, getServerPrefs, subscribePrefs } from "@/lib/prefs";
import {
  getStoredProjects,
  getServerProjects,
  subscribeProjects,
  createProject,
  ensureProject,
  updateProject,
  buildProjectView,
  CREATOR_RESTORE_PROJECT_KEY,
  type WidgetProject,
  type ProjectMode,
  type ProjectIdentity,
  type RegistryLike,
} from "@/lib/widget-creator/projectStore";
import { CreatorProjectList } from "./CreatorProjectList";
import { CreatorEntryPicker } from "./CreatorEntryPicker";
import { CreatorWorkspace } from "./CreatorWorkspace";

// kept for SettingsPane import compatibility (it imports PanelMode from here)
export type PanelMode = "create" | "edit" | "ideate" | "plan";

type View = "list" | "picker" | "workspace";
type RestoreProjectRequest = { projectId: string };

// drill-in/out navigation — deeper views (picker, workspace) slide in from
// the right over the outgoing view; returning to the list reverses it
const VIEW_ORDER: View[] = ["list", "picker", "workspace"];

const VIEW_VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28, scale: dir === 0 ? 1 : 0.98 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -28, scale: dir === 0 ? 1 : 0.98 }),
};

function readRestoreProjectRequest(): RestoreProjectRequest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CREATOR_RESTORE_PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RestoreProjectRequest>;
    return typeof parsed.projectId === "string" ? { projectId: parsed.projectId } : null;
  } catch {
    return null;
  }
}

export function WidgetCreatorPanel() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [restoreProjectId] = useState(() => readRestoreProjectRequest()?.projectId ?? null);
  const restoreAppliedRef = useRef(false);
  const [view, setView] = useState<View>(() => restoreProjectId ? "workspace" : "list");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => restoreProjectId);

  // getStoredProjects() returns the stable module-level reference — never a
  // new array unless a mutation ran. This satisfies useSyncExternalStore's
  // requirement that consecutive getSnapshot calls return the same reference
  // when nothing has changed (prevents the "infinite loop" warning).
  const storedProjects = useSyncExternalStore(
    subscribeProjects,
    getStoredProjects,
    getServerProjects,
  );

  // Merge logic in render body (not in getSnapshot) so the snapshot stays
  // stable — buildProjectView corrects Created status against the registry
  // and appends virtual entries for pre-existing widgets.
  const allProjects = buildProjectView(storedProjects, customRegistryRaw as RegistryLike);
  const activeProject = allProjects.find((p) => p.id === activeProjectId) ?? null;

  useEffect(() => {
    if (!restoreProjectId || restoreAppliedRef.current) return;
    const project = allProjects.find((p) => p.id === restoreProjectId);
    if (!project) return;
    restoreAppliedRef.current = true;
    try { sessionStorage.removeItem(CREATOR_RESTORE_PROJECT_KEY); } catch {}
    ensureProject(project);
    updateProject(project.id, { activeMode: "build", workflowMode: "build" });
  }, [allProjects, restoreProjectId]);

  // track drill direction for the transition — adjusted directly during
  // render (React-blessed pattern for deriving state from a state change)
  const [prevView, setPrevView] = useState<View>(view);
  const [viewDir, setViewDir] = useState(0);
  if (prevView !== view) {
    const prevIdx = VIEW_ORDER.indexOf(prevView);
    const nextIdx = VIEW_ORDER.indexOf(view);
    setViewDir(nextIdx > prevIdx ? 1 : -1);
    setPrevView(view);
  }

  function handleNewWidget() {
    setView("picker");
  }

  function handlePick(mode: ProjectMode, identity?: ProjectIdentity) {
    const project = createProject(mode, "Untitled", identity);
    setActiveProjectId(project.id);
    setView("workspace");
  }

  function handleOpenProject(project: WidgetProject) {
    // promote virtual entry to a real stored entry on first open
    ensureProject(project);
    const targetMode = project.workflowMode;
    if (project.activeMode !== targetMode) {
      updateProject(project.id, { activeMode: targetMode });
    }
    setActiveProjectId(project.id);
    setView("workspace");
  }

  function handleBack() {
    setActiveProjectId(null);
    setView("list");
  }

  return (
    <div className="wc-panel">
      <AnimatePresence mode="wait" initial={false} custom={viewDir}>
        <motion.div
          key={view}
          className="wc-view"
          custom={viewDir}
          variants={VIEW_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
