// Client-side project store for Widget Creator.
// Each custom widget is a "project". Projects in In Progress = not yet built.
// Projects in Created = their widget exists in the registry.

import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";

export type WidgetBrief = {
  title: string;
  slug: string;
  icon?: string;
  sizes?: string[];
  sContent?: string;
  mContent?: string;
  lContent?: string;
  dataSource?: string;
  dataShape?: string;
  concept: string;
};

export type ProjectMode = "plan" | "ideate" | "build";

export type WidgetProject = {
  id: string;
  displayName: string;
  /** Set when the widget has been successfully built (= its id in the registry). */
  slug?: string;
  activeMode: ProjectMode;
  entryMode: ProjectMode;
  createdAt: number;
  updatedAt: number;
  hasBrief: boolean;
  hasIdeateRounds: boolean;
  /** true = widget exists in the registry = "Created" category */
  hasBuildOutput: boolean;
  brief?: WidgetBrief;
  designReferenceHtml?: string;
  buildSettings?: GenerateSettings;
};

// ── per-project storage key helpers ──────────────────────────────────────────

export const projectMessagesKey    = (id: string) => `nutmag-creator-msgs-${id}`;
export const projectPlanMessagesKey = (id: string) => `nutmag-plan-msgs-${id}`;
export const projectIdeateKey      = (id: string) => `nutmag-creator-ideate-${id}`;
export const projectDoneKey        = (id: string) => `nutmag-creator-done-${id}`;
export const projectPlanSidKey     = (id: string) => `nutmag-plan-sid-${id}`;
export const projectIdeateSidKey   = (id: string) => `nutmag-ideate-sid-${id}`;
export const projectBuildSidKey    = (id: string) => `nutmag-creator-sid-${id}`;

// ── internal state ────────────────────────────────────────────────────────────

const PROJECTS_KEY = "nutmag-creator-projects";

let projects: WidgetProject[] = [];
let workingProjectId: string | null = null;

const projectListeners = new Set<() => void>();
const workingListeners = new Set<() => void>();

function notifyProjects() { projectListeners.forEach((l) => l()); }
function notifyWorking()  { workingListeners.forEach((l) => l()); }

// ── persistence ───────────────────────────────────────────────────────────────

function readFromStorage(): WidgetProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as WidgetProject[]) : [];
  } catch {
    return [];
  }
}

function writeToStorage(list: WidgetProject[]): void {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(list)); } catch {}
}

// initialise from localStorage on first client import
if (typeof window !== "undefined") {
  projects = readFromStorage();
}

// ── projects API ──────────────────────────────────────────────────────────────

/**
 * Returns the stable module-level projects reference. Only changes identity
 * when a mutation (create/update/delete) actually runs. Safe to use as
 * useSyncExternalStore's getSnapshot — React's Object.is comparison will see
 * the same reference between mutations and never loop.
 *
 * Callers that need auto-correction of hasBuildOutput against the registry,
 * or virtual Created entries for pre-existing widgets, do that in their own
 * render body rather than here — keeping the snapshot pure and stable.
 */
export function getStoredProjects(): WidgetProject[] {
  return projects;
}

/** SSR-safe stub — returns [] until the client hydrates. */
export function getServerProjects(): WidgetProject[] { return []; }

export function subscribeProjects(cb: () => void): () => void {
  projectListeners.add(cb);
  return () => projectListeners.delete(cb);
}

export function createProject(entryMode: ProjectMode, displayName = "Untitled"): WidgetProject {
  const project: WidgetProject = {
    id: crypto.randomUUID(),
    displayName,
    activeMode: entryMode,
    entryMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hasBrief: false,
    hasIdeateRounds: false,
    hasBuildOutput: false,
  };
  projects = [project, ...projects];
  writeToStorage(projects);
  notifyProjects();
  return project;
}

export function updateProject(id: string, patch: Partial<WidgetProject>): void {
  projects = projects.map((p) =>
    p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
  );
  writeToStorage(projects);
  notifyProjects();
}

/**
 * Ensures a project exists in the store. Used when opening a virtual Created
 * entry (pre-existing widget with no project history) — promotes it to a real
 * stored entry so the workspace has a persistent home for the project.
 */
export function ensureProject(project: WidgetProject): void {
  if (projects.find((p) => p.id === project.id)) return;
  projects = [project, ...projects];
  writeToStorage(projects);
  notifyProjects();
}

/** Deletes an In Progress project and wipes all its keyed storage. */
export function deleteProject(id: string): void {
  const project = projects.find((p) => p.id === id);
  if (!project || project.hasBuildOutput) return; // guard: Created projects cannot be deleted from creator

  projects = projects.filter((p) => p.id !== id);
  writeToStorage(projects);

  try {
    localStorage.removeItem(projectMessagesKey(id));
    localStorage.removeItem(projectPlanMessagesKey(id));
    localStorage.removeItem(projectIdeateKey(id));
    localStorage.removeItem(projectDoneKey(id));
    sessionStorage.removeItem(projectPlanSidKey(id));
    sessionStorage.removeItem(projectIdeateSidKey(id));
    sessionStorage.removeItem(projectBuildSidKey(id));
  } catch {}

  notifyProjects();
}

/**
 * Called when a widget is deleted from Hub Core — resets the matching Created
 * project back to In Progress so it doesn't linger as a stale Created entry.
 * Virtual-only entries (id === slug) are removed entirely since they have no
 * conversation history worth keeping.
 */
export function syncDeletedWidget(slug: string): void {
  const project = projects.find((p) => p.slug === slug);
  if (!project) return;

  if (project.id === slug) {
    // virtual-only entry (pre-existing widget with no project history) — remove
    projects = projects.filter((p) => p.id !== slug);
  } else {
    // real project with history — reset build status, keep the conversation
    projects = projects.map((p) =>
      p.id === project.id
        ? { ...p, hasBuildOutput: false, slug: undefined, updatedAt: Date.now() }
        : p,
    );
  }
  writeToStorage(projects);
  notifyProjects();
}

// ── AI lock ───────────────────────────────────────────────────────────────────

/** Which project currently has an active AI generation in flight. Only one at a time. */
export function getWorkingProjectId(): string | null { return workingProjectId; }
export function getServerWorkingProjectId(): string | null { return null; }

export function setWorkingProjectId(id: string | null): void {
  workingProjectId = id;
  notifyWorking();
}

export function subscribeWorkingProjectId(cb: () => void): () => void {
  workingListeners.add(cb);
  return () => workingListeners.delete(cb);
}
