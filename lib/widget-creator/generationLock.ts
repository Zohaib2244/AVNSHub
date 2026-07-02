// Server-side mutex for widget generation. The old "one generation at a time"
// invariant lived only in one browser tab's memory (projectStore's
// workingProjectId) — a second tab, another device on the tailnet, or a
// refreshed page could start a concurrent run, racing the two harnesses on
// customComponentMap.tsx read-modify-writes, registry writes, and tsc checks.
//
// The lock lives on globalThis rather than a plain module variable because the
// runtime is `next dev`: a Turbopack server-module invalidation mid-run (e.g.
// registration writing config/customRegistry.json) can re-instantiate this
// module and would silently drop a module-level lock — same reason dev-mode
// prisma clients are stashed on globalThis.

export type GenerationMode = "generate" | "ideate";

type LockState = { mode: GenerationMode; startedAt: number } | null;

// A run that somehow never released (process didn't crash — that clears it —
// but e.g. a stream handler bug) shouldn't brick generation forever.
const STALE_LOCK_MS = 30 * 60 * 1000;

const globalStore = globalThis as typeof globalThis & { __wcGenerationLock?: LockState };

export function acquireGenerationLock(
  mode: GenerationMode,
): { ok: true } | { ok: false; holder: GenerationMode; ageMs: number } {
  const current = globalStore.__wcGenerationLock;
  if (current && Date.now() - current.startedAt < STALE_LOCK_MS) {
    return { ok: false, holder: current.mode, ageMs: Date.now() - current.startedAt };
  }
  globalStore.__wcGenerationLock = { mode, startedAt: Date.now() };
  return { ok: true };
}

export function releaseGenerationLock(): void {
  globalStore.__wcGenerationLock = null;
}

export function describeBusyError(holder: GenerationMode, ageMs: number): string {
  const seconds = Math.round(ageMs / 1000);
  const age = seconds < 120 ? `${seconds}s` : `${Math.round(seconds / 60)}min`;
  return `another generation is already running (${holder}, started ${age} ago) — wait for it to finish or stop it first`;
}
