// External store for the office-game-dev widget's games/links data - same
// module-level-cache + listener-Set + persist-on-mutation pattern as
// lib/sessions.ts. Kept inside the widget's own folder since custom widgets
// must not touch shared lib/ files; read via useSyncExternalStore.

export type GameLink = { id: string; label: string; url: string };
export type Game = { id: string; name: string; links: GameLink[] };

const STORAGE_KEY = "nutmag-office-game-dev";
const listeners = new Set<() => void>();

let games: Game[] | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    // storage full/blocked - data still applies for this session
  }
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeUrl(url: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) return url;
  return `https://${url}`;
}

/** null on the server / first hydration render; real data right after */
export function getGames(): Game[] | null {
  if (games === null) {
    games = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) games = JSON.parse(raw) as Game[];
    } catch {
      // corrupt saved data - keep empty
    }
  }
  return games;
}

export function getServerGames(): Game[] | null {
  return null;
}

export function subscribeGames(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** add a game; returns the new id, or "" if the name was blank */
export function addGame(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const current = getGames() ?? [];
  const id = makeId();
  games = [...current, { id, name: trimmed, links: [] }];
  persist();
  emit();
  return id;
}

export function removeGame(id: string) {
  const current = getGames();
  if (!current) return;
  games = current.filter((g) => g.id !== id);
  persist();
  emit();
}

export function addLink(gameId: string, label: string, url: string) {
  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  if (!trimmedLabel || !trimmedUrl) return;
  const current = getGames();
  if (!current) return;
  const id = makeId();
  const link: GameLink = { id, label: trimmedLabel, url: normalizeUrl(trimmedUrl) };
  games = current.map((g) => (g.id === gameId ? { ...g, links: [...g.links, link] } : g));
  persist();
  emit();
}

export function removeLink(gameId: string, linkId: string) {
  const current = getGames();
  if (!current) return;
  games = current.map((g) =>
    g.id === gameId ? { ...g, links: g.links.filter((l) => l.id !== linkId) } : g,
  );
  persist();
  emit();
}
