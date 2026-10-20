// Thin client for the shared-hub KV API (app/api/hub-data). Every store in
// lib/ (prefs.ts, theme.ts, canvases.ts, ...) keeps localStorage as its
// instant-read/instant-write cache — exactly as before, so there's no flash
// and the app still works offline — and additionally pushes writes to the
// server and polls for changes made from other browsers/devices. Last write
// wins; there's no conflict resolution because this is a single-owner tool.

const POLL_INTERVAL_MS = 15_000;

// AVN Hub deliberately runs under HMR. Module-level timers/listeners would be
// duplicated whenever one of the external-store modules is re-evaluated, so
// keyed pollers live across module instances and replace their predecessor.
const globalForPollers = globalThis as typeof globalThis & {
  __avnHubVisiblePollers?: Map<string, () => void>;
};
const visiblePollers = globalForPollers.__avnHubVisiblePollers ?? new Map<string, () => void>();
globalForPollers.__avnHubVisiblePollers = visiblePollers;

export async function pullFromServer<T>(key: string): Promise<T | undefined> {
  try {
    const res = await fetch(`/api/hub-data?key=${encodeURIComponent(key)}`);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { value: T | null };
    return data.value === null ? undefined : data.value;
  } catch {
    return undefined;
  }
}

export function pushToServer(key: string, value: unknown) {
  fetch("/api/hub-data", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => {
    // server unreachable — the local write still applies, and will sync on
    // the next successful push for this key
  });
}

export function deleteFromServer(key: string) {
  fetch(`/api/hub-data?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => {
    // server unreachable — nothing left to reconcile against for this key
  });
}

/** Runs one non-overlapping poll at a time while visible. Hidden tabs have no
    timer at all, and refresh immediately when brought back to the foreground. */
export function pollWhileVisible(
  callback: () => void | Promise<void>,
  intervalMs = POLL_INTERVAL_MS,
  key?: string,
): () => void {
  if (key) visiblePollers.get(key)?.();

  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    clearTimer();
    if (disposed || document.visibilityState === "hidden") return;
    timer = setTimeout(run, intervalMs);
  };

  const run = () => {
    timer = null;
    if (disposed || running || document.visibilityState === "hidden") return;
    running = true;
    Promise.resolve(callback())
      .catch(() => {})
      .finally(() => {
        running = false;
        schedule();
      });
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") run();
    else clearTimer();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  schedule();

  const stop = () => {
    disposed = true;
    clearTimer();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (key && visiblePollers.get(key) === stop) visiblePollers.delete(key);
  };

  if (key) visiblePollers.set(key, stop);
  return stop;
}
