"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";
import {
  updateProject,
  getWorkingProjectId,
  getServerWorkingProjectId,
  subscribeWorkingProjectId,
  legacyPlanSidKey,
  legacyIdeateSidKey,
  legacyBuildSidKey,
  legacyDoneKey,
  type WidgetProject,
  type ProjectMode,
  type WidgetBrief,
} from "@/lib/widget-creator/projectStore";
import { CreatorPipelineBar } from "./CreatorPipelineBar";
import { SettingsPane } from "./SettingsPane";
import { PlanCanvas } from "./PlanCanvas";
import { IdeateCanvas } from "./IdeateCanvas";
import { ChatCanvas } from "./ChatCanvas";
import { useLayout } from "@/components/dashboard/LayoutProvider";

const EMPTY_SETTINGS: GenerateSettings = {
  sizes: ["S", "M", "L"],
  orientations: ["h"],
  hoe: false,
};

const FOCUS_HINT_KEY = "nutmag-creator-focus-hint";

// pipeline-stage transition — plan → ideate → build reads as a vertical
// step progression, distinct from the horizontal drill-in used for
// list/picker/workspace navigation one level up
const PIB_ORDER: ProjectMode[] = ["plan", "ideate", "build"];
const PIB_INDEX: Record<ProjectMode, number> = { plan: 0, ideate: 1, build: 2 };

const PIB_VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, y: dir * 10 }),
  center: { opacity: 1, y: 0 },
  exit: (dir: number) => ({ opacity: 0, y: dir * -10 }),
};

type Props = {
  project: WidgetProject;
  onBack: () => void;
  activeHarness: HarnessId;
  harnessChain: HarnessId[];
};

export function CreatorWorkspace({ project, onBack, activeHarness, harnessChain }: Props) {
  const { focusWidgetId } = useLayout();
  const workingId = useSyncExternalStore(
    subscribeWorkingProjectId,
    getWorkingProjectId,
    getServerWorkingProjectId,
  );
  const isLocked = workingId === project.id;
  const isFocusMode = focusWidgetId === "nutbot";
  const [focusHintDismissed, setFocusHintDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try { return localStorage.getItem(FOCUS_HINT_KEY) === "dismissed"; } catch { return true; }
  });

  function dismissFocusHint() {
    setFocusHintDismissed(true);
    try { localStorage.setItem(FOCUS_HINT_KEY, "dismissed"); } catch {}
  }

  // editable project name
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.displayName);
  const nameRef = useRef<HTMLInputElement>(null);

  // keep name input in sync if project displayName changes externally
  // (e.g. plan mode sets it from the brief) — adjusted directly during
  // render (React-blessed pattern), not in a ref or effect
  const [prevDisplayName, setPrevDisplayName] = useState(project.displayName);
  if (project.displayName !== prevDisplayName && !editingName) {
    setNameValue(project.displayName);
    setPrevDisplayName(project.displayName);
  }

  function commitName() {
    setEditingName(false);
    const name = nameValue.trim() || "Untitled";
    setNameValue(name);
    if (name !== project.displayName) {
      updateProject(project.id, { displayName: name });
    }
  }

  function handleStage(mode: ProjectMode) {
    if (isLocked) return; // AI is generating — block mode switches
    if (PIB_INDEX[mode] > PIB_INDEX[project.workflowMode]) return; // future stages unlock only through handoff actions
    if (mode !== project.activeMode) {
      updateProject(project.id, { activeMode: mode });
    }
  }

  // plan → ideate bridge
  const [ideateInitialPrompt, setIdeateInitialPrompt] = useState<string | undefined>(undefined);
  const [ideateNonce, setIdeateNonce] = useState(0);

  function buildSettingsFromBrief(brief: WidgetBrief): Partial<GenerateSettings> {
    return {
      name: brief.title,
      slug: brief.slug,
      icon: brief.icon ?? project.buildSettings?.icon,
      sizes: brief.sizes ?? ["S", "M"],
      orientations: ["h"],
      sDescription: brief.sContent,
      mDescription: brief.mContent,
      lDescription: brief.lContent,
      dataShape: brief.dataShape,
    };
  }

  function handlePlanBuild(brief: WidgetBrief) {
    updateProject(project.id, {
      hasBrief: true,
      brief,
      displayName: brief.title,
      activeMode: "build",
      workflowMode: "build",
      buildSettings: {
        ...(project.buildSettings ?? EMPTY_SETTINGS),
        ...buildSettingsFromBrief(brief),
        editSlug: undefined,
        designReferenceHtml: undefined,
      },
    });
  }

  function handlePlanVisualize(brief: WidgetBrief) {
    updateProject(project.id, { hasBrief: true, brief, displayName: brief.title, activeMode: "ideate", workflowMode: "ideate" });
    setIdeateInitialPrompt(brief.concept || brief.title);
    setIdeateNonce((n) => n + 1);
  }

  function handleFinalize(html: string) {
    const briefPatch = project.brief ? buildSettingsFromBrief(project.brief) : {};
    updateProject(project.id, {
      designReferenceHtml: html,
      hasIdeateRounds: true,
      activeMode: "build",
      workflowMode: "build",
      buildSettings: {
        ...(project.buildSettings ?? EMPTY_SETTINGS),
        ...briefPatch,
        designReferenceHtml: html,
        editSlug: undefined,
      },
    });
  }

  function patchBuildSettings(patch: Partial<GenerateSettings>) {
    updateProject(project.id, {
      buildSettings: { ...(project.buildSettings ?? EMPTY_SETTINGS), ...patch },
    });
  }

  const mode = project.activeMode;
  const workflowMode = project.workflowMode;
  const isReviewMode = PIB_INDEX[mode] < PIB_INDEX[workflowMode];
  const legacyBuildTarget = (project.buildSettings?.editSlug || project.buildSettings?.slug || project.slug || "").trim() || null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (project.planSessionId || project.ideateSessionId || project.buildSession || project.pendingInstall) return;

    const patch: Partial<WidgetProject> = {};
    try {
      const planSid = sessionStorage.getItem(legacyPlanSidKey(project.id));
      const ideateSid = sessionStorage.getItem(legacyIdeateSidKey(project.id));
      const buildSid = sessionStorage.getItem(legacyBuildSidKey(project.id));
      const doneRaw = sessionStorage.getItem(legacyDoneKey(project.id));

      if (planSid) patch.planSessionId = planSid;
      if (ideateSid) patch.ideateSessionId = ideateSid;
      if (buildSid) patch.buildSession = { id: buildSid, forSlug: legacyBuildTarget };
      if (doneRaw) {
        const parsed = JSON.parse(doneRaw) as Partial<{ slug: string; registered: boolean }>;
        if (typeof parsed.slug === "string") {
          patch.pendingInstall = { slug: parsed.slug, registered: Boolean(parsed.registered) };
        }
      }

      sessionStorage.removeItem(legacyPlanSidKey(project.id));
      sessionStorage.removeItem(legacyIdeateSidKey(project.id));
      sessionStorage.removeItem(legacyBuildSidKey(project.id));
      sessionStorage.removeItem(legacyDoneKey(project.id));
    } catch {}

    if (Object.keys(patch).length > 0) updateProject(project.id, patch);
  }, [
    legacyBuildTarget,
    project.id,
    project.planSessionId,
    project.ideateSessionId,
    project.buildSession,
    project.pendingInstall,
  ]);

  // track PIB step direction for the transition — adjusted directly during
  // render (React-blessed pattern for deriving state from a state change)
  const [prevMode, setPrevMode] = useState<ProjectMode>(mode);
  const [pibDir, setPibDir] = useState(0);
  if (prevMode !== mode) {
    const prevIdx = PIB_ORDER.indexOf(prevMode);
    const nextIdx = PIB_ORDER.indexOf(mode);
    setPibDir(nextIdx > prevIdx ? 1 : -1);
    setPrevMode(mode);
  }

  const isEditBuild = mode === "build" && project.hasBuildOutput && !!project.slug;
  const settingsPaneMode: "create" | "edit" = isEditBuild ? "edit" : "create";
  const buildModeLabel = isEditBuild ? "edit" : "build";

  // ensure editSlug is set correctly for edit mode
  const effectiveBuildSettings: GenerateSettings = (() => {
    const base = project.buildSettings ?? EMPTY_SETTINGS;
    if (isEditBuild && project.slug && base.editSlug !== project.slug) {
      return { ...base, editSlug: project.slug };
    }
    return base;
  })();

  return (
    <div className="cr-workspace">
      {/* top bar */}
      <div className="cr-workspace-topbar">
        <button
          type="button"
          className={`cr-back-btn${isLocked ? " locked" : ""}`}
          onClick={isLocked ? undefined : onBack}
          disabled={isLocked}
          title={isLocked ? "AI is working — wait for it to finish before leaving" : "back to projects"}
        >
          <ArrowLeft size={12} strokeWidth={2} />
          projects
        </button>

        <div className="cr-workspace-name">
          {editingName ? (
            <input
              ref={nameRef}
              className="cr-name-input"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") { setEditingName(false); setNameValue(project.displayName); }
              }}
              autoFocus
            />
          ) : (
            <span
              className="cr-name-display"
              onClick={() => setEditingName(true)}
              title="click to rename"
            >
              {nameValue}
            </span>
          )}
        </div>

        <CreatorPipelineBar
          entryMode={project.entryMode}
          activeMode={mode}
          workflowMode={workflowMode}
          hasBrief={project.hasBrief}
          hasIdeateRounds={project.hasIdeateRounds || !!project.designReferenceHtml}
          hasBuildOutput={project.hasBuildOutput}
          onStage={handleStage}
          locked={isLocked}
        />

        {!isFocusMode && !focusHintDismissed && (
          <div className="cr-focus-hint">
            <span>tip: the ⤢ button gives the creator the whole frame</span>
            <button type="button" className="cr-focus-hint-close" onClick={dismissFocusHint} aria-label="dismiss focus hint">
              <X size={10} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {/* workspace body */}
      <div className="cr-workspace-body">
        {/* left sidebar */}
        <div className="cr-workspace-left">
          <AnimatePresence mode="wait" initial={false} custom={pibDir}>
            <motion.div
              key={mode}
              className="cr-pib-panel"
              custom={pibDir}
              variants={PIB_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            >
              {mode === "plan" && (
                <div className="wc-settings">
                  <div className="wc-section">
                    <div className="wc-section-body" style={{ padding: "8px 4px" }}>
                      <p className="wc-ideate-help">
                        Chat with AI to figure out what to build. Describe a use case or vague
                        idea — get concept suggestions, then a structured brief.
                      </p>
                      <p className="wc-stage-lock-note">
                        Moving to Ideate or Build locks Plan for edits. You can still come back to review this chat.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {mode === "ideate" && (
                <div className="wc-settings">
                  <div className="wc-section">
                    <div className="wc-section-body" style={{ padding: "8px 4px" }}>
                      <p className="wc-ideate-help">
                        Describe a widget concept and how many variations to brainstorm. Each
                        variation renders live as an HTML/CSS mockup — no real component yet.
                        Regenerate a variation in place, or finalize a design to switch into
                        {` ${buildModeLabel}`} mode with it as the reference.
                      </p>
                      <p className="wc-stage-lock-note">
                        Moving to {buildModeLabel} locks Ideate for edits. You can still come back to review the mockups.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {mode === "build" && (
                <SettingsPane
                  settings={effectiveBuildSettings}
                  onChange={patchBuildSettings}
                  mode={settingsPaneMode}
                  onModeChange={() => {}}
                  showModeToggle={false}
                  disabled={isLocked}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="wc-divider" />

        {/* right canvas */}
        <div className="cr-workspace-right">
          <AnimatePresence mode="wait" initial={false} custom={pibDir}>
            <motion.div
              key={mode}
              className="cr-pib-panel"
              custom={pibDir}
              variants={PIB_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            >
              {mode === "plan" && (
                <PlanCanvas
                  projectId={project.id}
                  activeHarness={activeHarness}
                  onBuild={handlePlanBuild}
                  onVisualize={handlePlanVisualize}
                  planSessionId={project.planSessionId}
                  readOnly={isReviewMode}
                />
              )}

              {mode === "ideate" && (
                <IdeateCanvas
                  key={`ideate-${project.id}-${ideateNonce}`}
                  projectId={project.id}
                  activeHarness={activeHarness}
                  harnessChain={harnessChain}
                  onFinalize={handleFinalize}
                  initialPrompt={ideateNonce > 0 ? ideateInitialPrompt : undefined}
                  brief={project.brief}
                  ideateSessionId={project.ideateSessionId}
                  readOnly={isReviewMode}
                />
              )}

              {mode === "build" && (
                <ChatCanvas
                  key={`build-${project.id}`}
                  projectId={project.id}
                  settings={effectiveBuildSettings}
                  onSettingsChange={patchBuildSettings}
                  activeHarness={activeHarness}
                  harnessChain={harnessChain}
                  brief={project.brief}
                  entryMode={project.entryMode}
                  buildSession={project.buildSession}
                  pendingInstall={project.pendingInstall}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
