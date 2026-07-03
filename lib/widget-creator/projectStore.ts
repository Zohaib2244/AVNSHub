// Client-side project store for Widget Creator.
// Each custom widget is a "project". Projects in In Progress = not yet built.
// Projects in Created = their widget exists in the registry.
//
// Persistence mirrors lib/prefs.ts: localStorage is the instant-read/write
// cache, every mutation also pushes to the shared-hub KV server
// (lib/serverSync.ts), and a visible-tab poll reconciles changes made from
// other browsers/devices. Before this, projects/conversations lived only in
// one browser's localStorage while the widgets themselves lived on the
// server — a second device saw bare "virtual" entries with no history.

import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";
import { deleteFromServer, pollWhileVisible, pullFromServer, pushToServer } from "@/lib/serverSync";

export type WidgetBrief = {
  title: string;
  slug: string;
  icon?: string;
  sizes?: string[];
  /** the master record: EVERYTHING the user asked for — purpose, every
      field/control/behavior, data, interactions, persistence, edge cases.
      The per-size content fields below are views dividing this up; this is
      the field downstream stages treat as the complete spec. */
  requirements?: string;
  sContent?: string;
  mContent?: string;
  lContent?: string;
  dataSource?: string;
  dataShape?: string;
  concept: string;
  /** freeform extra context that doesn't fit the fixed fields above —
      constraints, inspiration, things to avoid, edge cases. Carried through
      to Ideate's prompt and Build's settingsSummary/SPEC.md unchanged. */
  notes?: string;
};

export type ProjectMode = "plan" | "ideate" | "build";

export type ProjectIdentity = { name?: string; icon?: string; slug?: string };

export type WidgetProject = {
  id: string;
  displayName: string;
  /** Set when the widget has been successfully built (= its id in the registry). */
  slug?: string;
  /** Visible panel. Earlier stages can be opened for read-only review. */
  activeMode: ProjectMode;
  /** Furthest/current editable stage in the one-way Plan -> Ideate -> Build flow. */
  workflowMode: ProjectMode;
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
  /** Plan-mode CLI conversation id — server-machine-scoped, so it lives in the
      synced record (valid from any device), not per-tab sessionStorage. */
  planSessionId?: string;
  /** Ideate-mode session id — doubles as the scratch dir name on the server. */
  ideateSessionId?: string;
  /** Build-mode CLI session, tagged with the slug it was minted for so a
      target change invalidates it (survives remounts, unlike the old ref). */
  buildSession?: { id: string; forSlug: string | null };
  /** A build finished but the widget isn't installed/placed yet — powers the
      "install widget" button. Lives here (synced) instead of sessionStorage so
      closing the tab can't strand generated files with no way to install them. */
  pendingInstall?: { slug: string; registered: boolean };
};

// ── per-project storage key helpers ──────────────────────────────────────────

export const projectMessagesKey     = (id: string) => `nutmag-creator-msgs-${id}`;
export const projectPlanMessagesKey = (id: string) => `nutmag-plan-msgs-${id}`;
export const projectIdeateKey       = (id: string) => `nutmag-creator-ideate-${id}`;

// Legacy sessionStorage keys — only read by the one-shot migration in
// CreatorWorkspace (old sid/done records → fields on WidgetProject above).
export const legacyPlanSidKey   = (id: string) => `nutmag-plan-sid-${id}`;
export const legacyIdeateSidKey = (id: string) => `nutmag-ideate-sid-${id}`;
export const legacyBuildSidKey  = (id: string) => `nutmag-creator-sid-${id}`;
export const legacyDoneKey      = (id: string) => `nutmag-creator-done-${id}`;

// ── internal state ────────────────────────────────────────────────────────────

const PROJECTS_KEY = "nutmag-creator-projects";
export const CREATOR_RESTORE_PROJECT_KEY = "nutmag-creator-restore-project";

let projects: WidgetProject[] = [];
let workingProjectId: string | null = null;

const projectListeners = new Set<() => void>();
const workingListeners = new Set<() => void>();

function notifyProjects() { projectListeners.forEach((l) => l()); }
function notifyWorking()  { workingListeners.forEach((l) => l()); }

// ── sanitize ──────────────────────────────────────────────────────────────────

const MODES: ProjectMode[] = ["plan", "ideate", "build"];
const MODE_INDEX: Record<ProjectMode, number> = { plan: 0, ideate: 1, build: 2 };

function isMode(v: unknown): v is ProjectMode {
  return typeof v === "string" && (MODES as string[]).includes(v);
}

function maxMode(...modes: ProjectMode[]): ProjectMode {
  return modes.reduce((max, mode) => (MODE_INDEX[mode] > MODE_INDEX[max] ? mode : max));
}

export function sanitizeProjects(raw: unknown): WidgetProject[] {
  if (!Array.isArray(raw)) return [];
  const out: WidgetProject[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== "string" || !p.id) continue;
    const buildSession = p.buildSession && typeof p.buildSession === "object"
      && typeof (p.buildSession as Record<string, unknown>).id === "string"
      ? {
          id: (p.buildSession as Record<string, unknown>).id as string,
          forSlug: typeof (p.buildSession as Record<string, unknown>).forSlug === "string"
            ? ((p.buildSession as Record<string, unknown>).forSlug as string)
            : null,
        }
      : undefined;
    const pendingInstall = p.pendingInstall && typeof p.pendingInstall === "object"
      && typeof (p.pendingInstall as Record<string, unknown>).slug === "string"
      ? {
          slug: (p.pendingInstall as Record<string, unknown>).slug as string,
          registered: Boolean((p.pendingInstall as Record<string, unknown>).registered),
        }
      : undefined;
    const activeMode = isMode(p.activeMode) ? p.activeMode : "build";
    const entryMode = isMode(p.entryMode) ? p.entryMode : "build";
    const inferredWorkflow = maxMode(
      entryMode,
      activeMode,
      Boolean(p.hasIdeateRounds) || typeof p.designReferenceHtml === "string" ? "ideate" : entryMode,
      Boolean(p.hasBuildOutput) || pendingInstall ? "build" : entryMode,
    );
    out.push({
      id: p.id,
      displayName: typeof p.displayName === "string" && p.displayName ? p.displayName : "Untitled",
      slug: typeof p.slug === "string" ? p.slug : undefined,
      activeMode,
      workflowMode: isMode(p.workflowMode) ? p.workflowMode : inferredWorkflow,
      entryMode,
      createdAt: typeof p.createdAt === "number" ? p.createdAt : 0,
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
      hasBrief: Boolean(p.hasBrief),
      hasIdeateRounds: Boolean(p.hasIdeateRounds),
      hasBuildOutput: Boolean(p.hasBuildOutput),
      brief: p.brief as WidgetBrief | undefined,
      designReferenceHtml: typeof p.designReferenceHtml === "string" ? p.designReferenceHtml : undefined,
      buildSettings: p.buildSettings as GenerateSettings | undefined,
      planSessionId: typeof p.planSessionId === "string" ? p.planSessionId : undefined,
      ideateSessionId: typeof p.ideateSessionId === "string" ? p.ideateSessionId : undefined,
      buildSession,
      pendingInstall,
    });
  }
  return out;
}

// ── persistence ───────────────────────────────────────────────────────────────

function readFromStorage(): WidgetProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? sanitizeProjects(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Local cache only — mutators additionally push; the server-reconcile path
    must NOT push (it would echo the server's own value back at it). */
function writeToStorage(list: WidgetProject[]): void {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(list)); } catch {}
}

function persistAndPush(): void {
  writeToStorage(projects);
  pushToServer(PROJECTS_KEY, projects);
  notifyProjects();
}

// Reconcile the project list with the server: on load + every 15s while
// visible. A fresh install has nothing on the server yet → seed it.
async function syncWithServer() {
  const remote = await pullFromServer<unknown>(PROJECTS_KEY);
  if (remote === undefined) {
    pushToServer(PROJECTS_KEY, projects);
    return;
  }
  const clean = sanitizeProjects(remote);
  if (JSON.stringify(clean) === JSON.stringify(projects)) return;
  projects = clean;
  writeToStorage(projects);
  notifyProjects();
}

// initialise from localStorage on first client import
if (typeof window !== "undefined") {
  projects = readFromStorage();
  syncWithServer();
  pollWhileVisible(syncWithServer);
}

// ── per-project blobs (conversations, ideate rounds) ─────────────────────────
// localStorage-first like the list, but pushes are debounced — message
// persistence fires per streamed chunk, and mirroring that unthrottled would
// mean dozens of PUTs per second during a generation.

const PUSH_DEBOUNCE_MS = 1500;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function loadProjectBlob<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveProjectBlob(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  const existing = pushTimers.get(key);
  if (existing) clearTimeout(existing);
  pushTimers.set(key, setTimeout(() => {
    pushTimers.delete(key);
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) pushToServer(key, JSON.parse(raw));
    } catch {}
  }, PUSH_DEBOUNCE_MS));
}

export function removeProjectBlob(key: string): void {
  const timer = pushTimers.get(key);
  if (timer) { clearTimeout(timer); pushTimers.delete(key); }
  try { localStorage.removeItem(key); } catch {}
  deleteFromServer(key);
}

/** One-shot server read for a blob — used when a workspace opens so another
    device's transcript/rounds appear. Lazy: blobs are never polled. */
export async function pullProjectBlob<T>(key: string): Promise<T | undefined> {
  return pullFromServer<T>(key);
}

// ── projects API ──────────────────────────────────────────────────────────────

/**
 * Returns the stable module-level projects reference. Only changes identity
 * when a mutation (create/update/delete) or a server reconcile actually ran.
 * Safe to use as useSyncExternalStore's getSnapshot — React's Object.is
 * comparison will see the same reference between mutations and never loop.
 *
 * Callers that need auto-correction of hasBuildOutput against the registry,
 * or virtual Created entries for pre-existing widgets, use buildProjectView()
 * in their own render body rather than here — keeping the snapshot pure.
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

/**
 * `identity` is what the user decided in the "new widget" step's name/icon
 * fields (or left empty via "decide later"). When any field is set it seeds
 * `buildSettings` so Build mode's identity inputs show it immediately —
 * whether the project starts in Build directly, or arrives there later via
 * Plan/Ideate (those handoffs only override the fields their own data
 * actually supplies, so an undecided field here still gets a chance to be
 * filled by a later brief).
 */
export function createProject(
  entryMode: ProjectMode,
  displayName = "Untitled",
  identity?: ProjectIdentity,
): WidgetProject {
  const name = identity?.name?.trim();
  const icon = identity?.icon?.trim();
  const slug = identity?.slug?.trim();
  const hasIdentity = Boolean(name || icon || slug);

  const project: WidgetProject = {
    id: crypto.randomUUID(),
    displayName: name || displayName,
    activeMode: entryMode,
    workflowMode: entryMode,
    entryMode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hasBrief: false,
    hasIdeateRounds: false,
    hasBuildOutput: false,
    buildSettings: hasIdentity
      ? { sizes: ["S", "M", "L"], orientations: ["h"], hoe: false, name, icon, slug }
      : undefined,
  };
  projects = [project, ...projects];
  persistAndPush();
  return project;
}

export function updateProject(id: string, patch: Partial<WidgetProject>): void {
  projects = projects.map((p) =>
    p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
  );
  persistAndPush();
}

/**
 * Ensures a project exists in the store. Used when opening a virtual Created
 * entry (pre-existing widget with no project history) — promotes it to a real
 * stored entry so the workspace has a persistent home for the project.
 */
export function ensureProject(project: WidgetProject): void {
  if (projects.find((p) => p.id === project.id)) return;
  projects = [project, ...projects];
  persistAndPush();
}

/** Removes a project from the list and wipes all its keyed storage (local + server). */
function removeProjectAndBlobs(id: string): void {
  projects = projects.filter((p) => p.id !== id);

  removeProjectBlob(projectMessagesKey(id));
  removeProjectBlob(projectPlanMessagesKey(id));
  removeProjectBlob(projectIdeateKey(id));
  try {
    sessionStorage.removeItem(legacyPlanSidKey(id));
    sessionStorage.removeItem(legacyIdeateSidKey(id));
    sessionStorage.removeItem(legacyBuildSidKey(id));
    sessionStorage.removeItem(legacyDoneKey(id));
  } catch {}

  persistAndPush();
}

/** Deletes an In Progress project and wipes all its keyed storage (local + server). */
export function deleteProject(id: string): void {
  const project = projects.find((p) => p.id === id);
  if (!project || project.hasBuildOutput) return; // guard: Created projects cannot be deleted from creator
  removeProjectAndBlobs(id);
}

/**
 * Called when a widget is deleted from Hub Core — fully removes the matching
 * creator project (chat/brief/ideate history included), the same as deleting
 * an In Progress project by hand. A deleted widget shouldn't leave any trace
 * behind in either the "Created" or "In Progress" list.
 */
export function syncDeletedWidget(slug: string): void {
  const project = projects.find((p) => p.slug === slug);
  if (!project) return;
  removeProjectAndBlobs(project.id);
}

// ── merged project view (registry correction + virtual entries) ──────────────

export type RegistryLike = Record<string, { title?: string }>;

/**
 * The list every creator surface actually renders: stored projects corrected
 * against the current registry (a project whose slug left the registry drops
 * its Created status and any pending install pointing at deleted files), plus
 * virtual entries for registry widgets that have no stored project. Pure —
 * call it in a render body with the stable getStoredProjects() snapshot.
 */
export function buildProjectView(stored: WidgetProject[], registry: RegistryLike): WidgetProject[] {
  const registryKeys = Object.keys(registry);
  const registryKeySet = new Set(registryKeys);

  const corrected = stored.map((p) => {
    let next = p;
    if (next.hasBuildOutput && next.slug && !registryKeySet.has(next.slug)) {
      next = { ...next, hasBuildOutput: false, slug: undefined };
    }
    if (next.pendingInstall?.registered && !registryKeySet.has(next.pendingInstall.slug)) {
      // an installed-then-deleted widget must not resurrect an install button
      next = { ...next, pendingInstall: undefined };
    }
    return next;
  });

  const storedSlugs = new Set(corrected.map((p) => p.slug).filter(Boolean));
  const virtualCreated: WidgetProject[] = registryKeys
    .filter((slug) => !storedSlugs.has(slug))
    .map((slug) => ({
      id: slug,
      displayName: registry[slug]?.title ?? slug,
      slug,
      activeMode: "build" as ProjectMode,
      workflowMode: "build" as ProjectMode,
      entryMode: "build" as ProjectMode,
      createdAt: 0,
      updatedAt: 0,
      hasBrief: false,
      hasIdeateRounds: false,
      hasBuildOutput: true,
    }));

  return [...corrected, ...virtualCreated];
}

// ── AI lock ───────────────────────────────────────────────────────────────────

/** Which project currently has an active AI generation in flight (this tab's
    view of it — the authoritative mutex lives server-side in generationLock). */
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
