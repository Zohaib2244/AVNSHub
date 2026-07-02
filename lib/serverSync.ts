// Thin client for the shared-hub KV API (app/api/hub-data). Every store in
// lib/ (prefs.ts, theme.ts, canvases.ts, ...) keeps localStorage as its
// instant-read/instant-write cache — exactly as before, so there's no flash
// and the app still works offline — and additionally pushes writes to the
// server and polls for changes made from other browsers/devices. Last write
// wins; there's no conflict resolution because this is a single-owner tool.

const POLL_INTERVAL_MS = 15_000;

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

/** Runs `callback` on an interval, skipped while the tab is hidden. Returns an unsubscribe function. */
export function pollWhileVisible(callback: () => void, intervalMs = POLL_INTERVAL_MS): () => void {
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") callback();
  }, intervalMs);
  return () => clearInterval(timer);
}
