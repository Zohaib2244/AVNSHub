// External store for the merged office-game-dev widget: per-game quick links
// (3 fixed slots + freeform custom links) and the publishing build/email tool
// that used to live in the standalone publishing-email-builder widget. Read
// via useSyncExternalStore. Canvas-scoped and DB-synced through
// lib/canvasStore.ts (same pattern as lib/slotLayout.ts) — canvas A's games
// are invisible on canvas B, and every write mirrors to the shared-hub DB
// (app/api/hub-data) so the same list shows up from any browser/device.
//
// One-time migration folds data from both pre-merge widgets' old (global,
// unscoped) storage keys into the new shape on the DEFAULT_CANVAS_ID canvas
// only, matching games by trimmed lowercase name. Old keys are left untouched
// (harmless leftovers) rather than deleted, so a corrupt read here can never
// destroy the source data.

import { createCanvasStore } from "@/lib/canvasStore";

export type FixedLinkKind = "firebase" | "apkFolder" | "gameIds";

export const FIXED_LINK_KINDS: FixedLinkKind[] = ["firebase", "apkFolder", "gameIds"];

export const FIXED_LINK_LABELS: Record<FixedLinkKind, string> = {
  firebase: "Firebase",
  apkFolder: "APK Folder",
  gameIds: "Game Ids",
};

export type CustomLink = { id: string; label: string; url: string };

export type StageOption = "Beta" | "Production" | "Other/custom";

export type BuildDraft = {
  stage: StageOption;
  customStage: string;
  versionNumber: string;
  bundleCode: string;
  previousRollOut: string;
  newRollOut: string;
  countryBased: string;
  bundleLink: string;
  releaseNotes: string;
};

export type GameTodo = { id: string; text: string; done: boolean; createdAt: number; updatedAt: number };

export type Game = {
  id: string;
  name: string;
  gameId: string;
  storeName: string;
  liveLink: string;
  fixedLinks: Record<FixedLinkKind, string>;
  customLinks: CustomLink[];
  draft: BuildDraft;
  todos: GameTodo[];
};

const STORAGE_KEY = "nutmag-office-game-dev-v2";
const OLD_OFFICE_KEY = "nutmag-office-game-dev";
const OLD_PUB_GAMES_KEY = "publishing-email-builder:games";
const OLD_PUB_DRAFTS_KEY = "publishing-email-builder:drafts";

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** "" stays "" (lets a fixed link be cleared) - only a non-empty value gets a scheme */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function defaultDraft(): BuildDraft {
  return {
    stage: "Production",
    customStage: "",
    versionNumber: "",
    bundleCode: "",
    previousRollOut: "",
    newRollOut: "",
    countryBased: "",
    bundleLink: "",
    releaseNotes: "",
  };
}

function emptyFixedLinks(): Record<FixedLinkKind, string> {
  return { firebase: "", apkFolder: "", gameIds: "" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isStageOption(value: unknown): value is StageOption {
  return value === "Beta" || value === "Production" || value === "Other/custom";
}

function parseDraft(value: unknown): BuildDraft {
  if (!isRecord(value)) return defaultDraft();
  return {
    stage: isStageOption(value.stage) ? value.stage : "Production",
    customStage: str(value.customStage),
    versionNumber: str(value.versionNumber),
    bundleCode: str(value.bundleCode),
    previousRollOut: str(value.previousRollOut),
    newRollOut: str(value.newRollOut),
    countryBased: str(value.countryBased),
    bundleLink: str(value.bundleLink),
    releaseNotes: str(value.releaseNotes),
  };
}

function parseCustomLinks(value: unknown): CustomLink[] {
  if (!Array.isArray(value)) return [];
  const out: CustomLink[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = str(item.label).trim();
    const url = str(item.url).trim();
    if (!label || !url) continue;
    out.push({ id: str(item.id) || makeId(), label, url });
  }
  return out;
}

function parseFixedLinks(value: unknown): Record<FixedLinkKind, string> {
  const out = emptyFixedLinks();
  if (isRecord(value)) {
    for (const kind of FIXED_LINK_KINDS) out[kind] = str(value[kind]);
  }
  return out;
}

function parseTodos(value: unknown): GameTodo[] {
  if (!Array.isArray(value)) return [];
  const out: GameTodo[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const text = str(item.text);
    if (!text.trim()) continue;
    const createdAt = typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
    const updatedAt = typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : createdAt;
    out.push({ id: str(item.id) || makeId(), text, done: item.done === true, createdAt, updatedAt });
  }
  return out;
}

const NUMBERED_LINE = /^\s*\d+[.)]\s+/;

/** a legacy note that is a numbered list ("2. fix x\n3. fix y") becomes one
    todo per item, number stripped; any other note stays a single todo. A line
    that doesn't start with a number continues the item above it. */
function splitLegacyNotes(notes: GameTodo[]): GameTodo[] {
  const out: GameTodo[] = [];
  for (const note of notes) {
    const lines = note.text.split(/\r?\n/);
    if (lines.filter((line) => NUMBERED_LINE.test(line)).length < 2) {
      out.push(note);
      continue;
    }
    const items: string[] = [];
    for (const line of lines) {
      if (NUMBERED_LINE.test(line)) items.push(line.replace(NUMBERED_LINE, "").trim());
      else if (line.trim() && items.length) items[items.length - 1] += ` ${line.trim()}`;
      else if (line.trim()) items.push(line.trim());
    }
    items.forEach((text, i) => {
      if (text) out.push({ ...note, id: i === 0 ? note.id : makeId(), text });
    });
  }
  return out;
}

function parseGame(value: unknown): Game | null {
  if (!isRecord(value)) return null;
  const name = str(value.name).trim();
  if (!name) return null;
  return {
    id: str(value.id) || makeId(),
    name,
    gameId: str(value.gameId).trim(),
    storeName: str(value.storeName).trim(),
    liveLink: str(value.liveLink).trim(),
    fixedLinks: parseFixedLinks(value.fixedLinks),
    customLinks: parseCustomLinks(value.customLinks),
    draft: parseDraft(value.draft),
    // the Notes tab became a todo list: a game saved before that carries
    // `notes` (same shape, no `done`), which load as unchecked todos
    todos: Array.isArray(value.todos) ? parseTodos(value.todos) : splitLegacyNotes(parseTodos(value.notes)),
  };
}

function parseGames(value: unknown): Game[] {
  if (!Array.isArray(value)) return [];
  const out: Game[] = [];
  for (const item of value) {
    const game = parseGame(item);
    if (game) out.push(game);
  }
  return out;
}

function migrateFromOldWidgets(): Game[] {
  const merged = new Map<string, Game>();

  try {
    const raw = localStorage.getItem(OLD_OFFICE_KEY);
    if (raw) {
      const old: unknown = JSON.parse(raw);
      if (Array.isArray(old)) {
        for (const item of old) {
          if (!isRecord(item)) continue;
          const name = str(item.name).trim();
          if (!name) continue;
          const rawLinks = Array.isArray(item.links) ? item.links : [];
          const customLinks: CustomLink[] = [];
          for (const l of rawLinks) {
            if (!isRecord(l)) continue;
            const label = str(l.label).trim();
            const url = str(l.url).trim();
            if (!label || !url) continue;
            customLinks.push({ id: str(l.id) || makeId(), label, url });
          }
          merged.set(name.toLowerCase(), {
            id: str(item.id) || makeId(),
            name,
            gameId: "",
            storeName: "",
            liveLink: "",
            fixedLinks: emptyFixedLinks(),
            customLinks,
            draft: defaultDraft(),
            todos: [],
          });
        }
      }
    }
  } catch {
    // corrupt old data - skip this source
  }

  try {
    const rawGames = localStorage.getItem(OLD_PUB_GAMES_KEY);
    if (rawGames) {
      const oldGames: unknown = JSON.parse(rawGames);
      const rawDrafts = localStorage.getItem(OLD_PUB_DRAFTS_KEY);
      const oldDrafts: unknown = rawDrafts ? JSON.parse(rawDrafts) : {};
      if (Array.isArray(oldGames)) {
        for (const item of oldGames) {
          if (!isRecord(item)) continue;
          const name = str(item.name).trim();
          if (!name) continue;
          const key = name.toLowerCase();
          const uid = str(item.uid);
          const draft = isRecord(oldDrafts) ? parseDraft(oldDrafts[uid]) : defaultDraft();
          const existing = merged.get(key);
          if (existing) {
            existing.gameId = str(item.gameId).trim();
            existing.storeName = str(item.storeName).trim();
            existing.liveLink = str(item.liveLink).trim();
            existing.draft = draft;
          } else {
            merged.set(key, {
              id: makeId(),
              name,
              gameId: str(item.gameId).trim(),
              storeName: str(item.storeName).trim(),
              liveLink: str(item.liveLink).trim(),
              fixedLinks: emptyFixedLinks(),
              customLinks: [],
              draft,
              todos: [],
            });
          }
        }
      }
    }
  } catch {
    // corrupt old data - skip this source
  }

  return Array.from(merged.values());
}

// One-time: if this browser has never written the (bare, DEFAULT_CANVAS_ID-
// scoped — see canvasScopedKey) games key, seed it from the pre-merge
// widgets' old keys before gamesStore ever reads it. Only runs once per
// browser; a deliberately-emptied list (key present, value "[]") is left alone.
function seedDefaultCanvasFromLegacyKeys() {
  try {
    if (localStorage.getItem(STORAGE_KEY) !== null) return;
  } catch {
    return;
  }
  const migrated = migrateFromOldWidgets();
  if (migrated.length === 0) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  } catch {
    // ignore
  }
}

if (typeof window !== "undefined") seedDefaultCanvasFromLegacyKeys();

// canvas-scoped + DB-synced (app/api/hub-data) — see lib/canvasStore.ts. The
// DEFAULT_CANVAS_ID canvas keeps the bare STORAGE_KEY (via canvasScopedKey),
// so an existing single-canvas install's data survives with no migration.
const gamesStore = createCanvasStore<Game[]>({
  baseKey: STORAGE_KEY,
  buildDefault: () => [],
  sanitize: (raw) => (Array.isArray(raw) ? parseGames(raw) : null),
});

/** null on the server / first hydration render; real data right after */
export function getGames(): Game[] | null {
  return typeof window === "undefined" ? null : gamesStore.get();
}

export function getServerGames(): Game[] | null {
  return null;
}

export function subscribeGames(listener: () => void) {
  return gamesStore.subscribe(listener);
}

function updateGame(id: string, updater: (game: Game) => Game) {
  const current = getGames();
  if (!current) return;
  gamesStore.set(current.map((g) => (g.id === id ? updater(g) : g)));
}

/** add a game; returns the new id, or "" if the name was blank */
export function addGame(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const current = getGames() ?? [];
  const id = makeId();
  const game: Game = {
    id,
    name: trimmed,
    gameId: "",
    storeName: "",
    liveLink: "",
    fixedLinks: emptyFixedLinks(),
    customLinks: [],
    draft: defaultDraft(),
    todos: [],
  };
  gamesStore.set([...current, game]);
  return id;
}

export function removeGame(id: string) {
  const current = getGames();
  if (!current) return;
  gamesStore.set(current.filter((g) => g.id !== id));
}

export function updateGameDetails(
  id: string,
  patch: { name?: string; gameId?: string; storeName?: string; liveLink?: string },
) {
  updateGame(id, (g) => ({
    ...g,
    name: patch.name !== undefined ? patch.name.trim() || g.name : g.name,
    gameId: patch.gameId !== undefined ? patch.gameId.trim() : g.gameId,
    storeName: patch.storeName !== undefined ? patch.storeName.trim() : g.storeName,
    liveLink: patch.liveLink !== undefined ? patch.liveLink.trim() : g.liveLink,
  }));
}

export function setFixedLink(gameId: string, kind: FixedLinkKind, url: string) {
  updateGame(gameId, (g) => ({ ...g, fixedLinks: { ...g.fixedLinks, [kind]: normalizeUrl(url) } }));
}

export function addCustomLink(gameId: string, label: string, url: string) {
  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  if (!trimmedLabel || !trimmedUrl) return;
  const link: CustomLink = { id: makeId(), label: trimmedLabel, url: normalizeUrl(trimmedUrl) };
  updateGame(gameId, (g) => ({ ...g, customLinks: [...g.customLinks, link] }));
}

export function removeCustomLink(gameId: string, linkId: string) {
  updateGame(gameId, (g) => ({ ...g, customLinks: g.customLinks.filter((l) => l.id !== linkId) }));
}

export function updateDraft(gameId: string, patch: Partial<BuildDraft>) {
  updateGame(gameId, (g) => ({ ...g, draft: { ...g.draft, ...patch } }));
}

/** blank text is ignored; new todos go on top of the list */
export function addTodo(gameId: string, text: string) {
  if (!text.trim()) return;
  const now = Date.now();
  const todo: GameTodo = { id: makeId(), text: text.trim(), done: false, createdAt: now, updatedAt: now };
  updateGame(gameId, (g) => ({ ...g, todos: [todo, ...g.todos] }));
}

/** blank text is ignored (use removeTodo to delete) */
export function updateTodo(gameId: string, todoId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  updateGame(gameId, (g) => ({
    ...g,
    todos: g.todos.map((t) => (t.id === todoId && t.text !== trimmed ? { ...t, text: trimmed, updatedAt: Date.now() } : t)),
  }));
}

export function toggleTodo(gameId: string, todoId: string) {
  updateGame(gameId, (g) => ({
    ...g,
    todos: g.todos.map((t) => (t.id === todoId ? { ...t, done: !t.done, updatedAt: Date.now() } : t)),
  }));
}

export function removeTodo(gameId: string, todoId: string) {
  updateGame(gameId, (g) => ({ ...g, todos: g.todos.filter((t) => t.id !== todoId) }));
}

/** edit a custom link in place; blank label or url is ignored */
export function updateCustomLink(gameId: string, linkId: string, label: string, url: string) {
  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  if (!trimmedLabel || !trimmedUrl) return;
  updateGame(gameId, (g) => ({
    ...g,
    customLinks: g.customLinks.map((l) => (l.id === linkId ? { ...l, label: trimmedLabel, url: normalizeUrl(trimmedUrl) } : l)),
  }));
}
