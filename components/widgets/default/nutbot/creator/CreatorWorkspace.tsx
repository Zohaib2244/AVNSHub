"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";
import {
  updateProject,
  getWorkingProjectId,
  getServerWorkingProjectId,
  subscribeWorkingProjectId,
  type WidgetProject,
  type ProjectMode,
  type WidgetBrief,
} from "@/lib/widget-creator/projectStore";
import { CreatorPipelineBar } from "./CreatorPipelineBar";
import { SettingsPane } from "./SettingsPane";
import { PlanCanvas } from "./PlanCanvas";
import { IdeateCanvas } from "./IdeateCanvas";
import { ChatCanvas } from "./ChatCanvas";

const EMPTY_SETTINGS: GenerateSettings = {
  sizes: ["S", "M", "L"],
  orientations: ["h"],
  hoe: false,
};

const FINALIZE_PROMPT =
  "Build this widget to match the finalized mockup exactly — recreate the layout, spacing, colors, and animations using the framework's real CSS variables and per-size (useWidget().size) branching instead of the mockup's static hardcoded boxes.";

type Props = {
  project: WidgetProject;
  onBack: () => void;
  activeHarness: HarnessId;
  harnessChain: HarnessId[];
};

export function CreatorWorkspace({ project, onBack, activeHarness, harnessChain }: Props) {
  const workingId = useSyncExternalStore(
    subscribeWorkingProjectId,
    getWorkingProjectId,
    getServerWorkingProjectId,
  );
  const isLocked = workingId === project.id;

  // editable project name
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.displayName);
  const nameRef = useRef<HTMLInputElement>(null);

  // keep name input in sync if project displayName changes externally
  // (e.g. plan mode sets it from the brief)
  const prevDisplayName = useRef(project.displayName);
  if (project.displayName !== prevDisplayName.current && !editingName) {
    setNameValue(project.displayName);
    prevDisplayName.current = project.displayName;
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
    if (mode !== project.activeMode) {
      updateProject(project.id, { activeMode: mode });
    }
  }

  // plan → ideate bridge
  const [ideateInitialPrompt, setIdeateInitialPrompt] = useState<string | undefined>(undefined);
  const [ideateNonce, setIdeateNonce] = useState(0);

  // ideate → build bridge
  const [buildInitialPrompt, setBuildInitialPrompt] = useState<string | undefined>(undefined);
  const [finalizeNonce, setFinalizeNonce] = useState(0);

  function handlePlanBuild(brief: WidgetBrief) {
    const patch: Partial<GenerateSettings> = {
      name: brief.title,
      slug: brief.slug,
      icon: brief.icon,
      sizes: brief.sizes ?? ["S", "M"],
      orientations: ["h"],
      sDescription: brief.sContent,
      mDescription: brief.mContent,
      lDescription: brief.lContent,
      dataShape: brief.dataShape,
      editSlug: undefined,
      designReferenceHtml: undefined,
    };
    updateProject(project.id, {
      hasBrief: true,
      brief,
      displayName: brief.title,
      activeMode: "build",
      buildSettings: { ...(project.buildSettings ?? EMPTY_SETTINGS), ...patch },
    });
  }

  function handlePlanVisualize(brief: WidgetBrief) {
    updateProject(project.id, { hasBrief: true, brief, displayName: brief.title, activeMode: "ideate" });
    setIdeateInitialPrompt(brief.concept || brief.title);
    setIdeateNonce((n) => n + 1);
  }

  function handleFinalize(html: string) {
    updateProject(project.id, {
      designReferenceHtml: html,
      hasIdeateRounds: true,
      activeMode: "build",
      buildSettings: {
        ...(project.buildSettings ?? EMPTY_SETTINGS),
        designReferenceHtml: html,
        editSlug: undefined,
      },
    });
    setBuildInitialPrompt(FINALIZE_PROMPT);
    setFinalizeNonce((n) => n + 1);
  }

  function patchBuildSettings(patch: Partial<GenerateSettings>) {
    updateProject(project.id, {
      buildSettings: { ...(project.buildSettings ?? EMPTY_SETTINGS), ...patch },
    });
  }

  const mode = project.activeMode;
  const isEditBuild = mode === "build" && project.hasBuildOutput && !!project.slug;
  const settingsPaneMode: "create" | "edit" = isEditBuild ? "edit" : "create";

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
          hasBrief={project.hasBrief}
          hasIdeateRounds={project.hasIdeateRounds || !!project.designReferenceHtml}
          hasBuildOutput={project.hasBuildOutput}
          onStage={handleStage}
          locked={isLocked}
        />
      </div>

      {/* workspace body */}
      <div className="cr-workspace-body">
        {/* left sidebar */}
        <div className="cr-workspace-left">
          {mode === "plan" && (
            <div className="wc-settings">
              <div className="wc-section">
                <div className="wc-section-body" style={{ padding: "8px 4px" }}>
                  <p className="wc-ideate-help">
                    Chat with AI to figure out what to build. Describe a use case or vague
                    idea — get concept suggestions, then a structured brief. Click
                    &ldquo;Build this&rdquo; to jump into build mode with the settings
                    pre-filled, or &ldquo;Visualize first&rdquo; to generate mockups in
                    ideate mode before committing.
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
                    build mode with it as the reference.
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
        </div>

        <div className="wc-divider" />

        {/* right canvas */}
        <div className="cr-workspace-right">
          {mode === "plan" && (
            <PlanCanvas
              projectId={project.id}
              activeHarness={activeHarness}
              onBuild={handlePlanBuild}
              onVisualize={handlePlanVisualize}
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
            />
          )}

          {mode === "build" && (
            <ChatCanvas
              key={finalizeNonce > 0 ? `build-${project.id}-${finalizeNonce}` : `build-${project.id}`}
              projectId={project.id}
              settings={effectiveBuildSettings}
              onSettingsChange={patchBuildSettings}
              activeHarness={activeHarness}
              harnessChain={harnessChain}
              initialPrompt={finalizeNonce > 0 ? buildInitialPrompt : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
