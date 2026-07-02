"use client";

import { useSyncExternalStore } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import customRegistryRaw from "@/config/customRegistry.json";
import {
  getStoredProjects,
  getServerProjects,
  subscribeProjects,
  deleteProject,
  buildProjectView,
  type WidgetProject,
  type ProjectMode,
  type RegistryLike,
} from "@/lib/widget-creator/projectStore";

const REGISTRY = customRegistryRaw as RegistryLike;

type Props = {
  onNewWidget: () => void;
  onOpenProject: (project: WidgetProject) => void;
};

function timeAgo(ms: number): string {
  if (ms === 0) return "pre-existing";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STAGE_ALL: ProjectMode[] = ["plan", "ideate", "build"];

function PipelineChips({ project }: { project: WidgetProject }) {
  const fromIdx = STAGE_ALL.indexOf(project.entryMode);
  const stages = STAGE_ALL.slice(fromIdx);

  function hasData(mode: ProjectMode): boolean {
    if (mode === "plan")   return project.hasBrief;
    if (mode === "ideate") return project.hasIdeateRounds || !!project.designReferenceHtml;
    if (mode === "build")  return project.hasBuildOutput;
    return false;
  }

  return (
    <div className="cr-proj-pipe">
      {stages.map((mode, i) => {
        const isCurrent = mode === project.activeMode;
        const isDone    = hasData(mode);
        return (
          <span key={mode} className="cr-pipe-group">
            <span className={`cr-pipe-chip${isCurrent ? " active" : isDone ? " done" : ""}`}>
              {isCurrent && <span className="cr-pipe-dot" />}
              {mode}
            </span>
            {i < stages.length - 1 && <span className="cr-pipe-sep">›</span>}
          </span>
        );
      })}
    </div>
  );
}

function ProjectRow({
  project,
  onOpen,
  canDelete,
}: {
  project: WidgetProject;
  onOpen: () => void;
  canDelete: boolean;
}) {
  const [hover, setHover] = useState(false);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    deleteProject(project.id);
  }

  const isCreated = project.hasBuildOutput;

  return (
    <div
      className={`cr-proj-row${hover ? " hovered" : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
    >
      <span className={`cr-proj-stripe${isCreated ? " created" : ""}`} />

      <div className="cr-proj-info">
        <div className="cr-proj-name-row">
          <span className="cr-proj-name">{project.displayName}</span>
          {project.slug && isCreated && (
            <span className="cr-proj-slug">#{project.slug}</span>
          )}
        </div>
        <PipelineChips project={project} />
      </div>

      <div className="cr-proj-right">
        <span className="cr-proj-meta">{timeAgo(project.updatedAt)}</span>
        <div className="cr-proj-actions">
          {canDelete && hover && (
            <button
              type="button"
              className="cr-proj-delete"
              onClick={handleDelete}
              title="delete project"
              aria-label="delete project"
            >
              <Trash2 size={10} strokeWidth={2} />
            </button>
          )}
          <ArrowRight size={11} strokeWidth={1.75} className="cr-proj-arrow" />
        </div>
      </div>
    </div>
  );
}

export function CreatorProjectList({ onNewWidget, onOpenProject }: Props) {
  const storedProjects = useSyncExternalStore(
    subscribeProjects,
    getStoredProjects,
    getServerProjects,
  );

  const allProjects = buildProjectView(storedProjects, REGISTRY);

  const inProgress = allProjects
    .filter((p) => !p.hasBuildOutput)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const created = allProjects
    .filter((p) => p.hasBuildOutput)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="cr-list">
      {/* hero new-widget banner */}
      <div className="cr-hero">
        <button type="button" className="cr-hero-btn" onClick={onNewWidget}>
          <div className="cr-hero-left">
            <span className="cr-hero-icon">
              <Plus size={14} strokeWidth={2.5} />
            </span>
            <div className="cr-hero-text">
              <span className="cr-hero-label">new widget</span>
              <span className="cr-hero-sub">plan · ideate · build — pick where to start</span>
            </div>
          </div>
          <ArrowRight size={14} strokeWidth={1.75} className="cr-hero-arrow" />
        </button>
      </div>

      <div className="cr-list-body">
        {inProgress.length > 0 && (
          <div className="cr-list-section">
            <div className="cr-section-row">
              <span className="cr-section-label">in progress</span>
              <span className="cr-section-count">{inProgress.length}</span>
            </div>
            {inProgress.map((p) => (
              <ProjectRow key={p.id} project={p} onOpen={() => onOpenProject(p)} canDelete />
            ))}
          </div>
        )}

        {created.length > 0 && (
          <div className="cr-list-section">
            <div className="cr-section-row">
              <span className="cr-section-label">created</span>
              <span className="cr-section-count">{created.length}</span>
            </div>
            {created.map((p) => (
              <ProjectRow key={p.id} project={p} onOpen={() => onOpenProject(p)} canDelete={false} />
            ))}
          </div>
        )}

        {allProjects.length === 0 && (
          <div className="cr-list-empty">
            <p>no widgets yet — start with the button above</p>
          </div>
        )}
      </div>
    </div>
  );
}
