// Generic canvas-scoped persistence for per-widget data (notes, idea inbox,
// quick links, ...). Mirrors the pattern lib/slotLayout.ts and lib/canvases.ts
// already use for framework state: localStorage is the instant-read/write
// cache, canvasScopedKey() namespaces it per canvas so canvas A's data never
// shows up on canvas B, and lib/serverSync.ts mirrors every write to the
// shared-hub DB (app/api/hub-data) so the same value is visible from every
// browser/device, not trapped in one browser's storage. Last write wins.
//
// Two entry points, same underlying logic:
// - createCanvasStore(): a module-level external store (useSyncExternalStore)
//   for widgets that already keep state outside React (lib/canvasStore's
//   consumers: components/widgets/default/notes, .../office-game-dev).
// - useCanvasSyncedState(): a useState-shaped hook for widgets that keep
//   their data as ordinary component state (quick-links, idea-inbox,
//   weather-updated's saved location).

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { canvasScopedKey, getActiveCanvasId, subscribeCanvases } from "@/lib/canvases";
import { deleteFromServer, pollWhileVisible, pullFromServer, pushToServer } from "@/lib/serverSync";

function readLocal<T>(key: string, sanitize: (raw: unknown) => T | null): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/blocked — the in-memory value still applies this session
  }
}

/** Module-level external store, namespaced per active canvas. `baseKey` is
    the unscoped localStorage key name (e.g. "nutmag-notes"); sanitize()
    validates/normalizes a parsed value, returning null to fall back to
    buildDefault(). */
export function createCanvasStore<T>(opts: {
  baseKey: string;
  buildDefault: () => T;
  sanitize: (raw: unknown) => T | null;
}) {
  const { baseKey, buildDefault, sanitize } = opts;
  const listeners = new Set<() => void>();

  let state: T | null = null;
  let currentCanvasId: string | null = null;
  let cachedDefault: T | null = null;

  function getDefault(): T {
    if (cachedDefault === null) cachedDefault = buildDefault();
    return cachedDefault;
  }

  function keyFor(canvasId: string) {
    return canvasScopedKey(baseKey, canvasId);
  }

  function loadForCanvas(canvasId: string): T {
    return readLocal(keyFor(canvasId), sanitize) ?? getDefault();
  }

  function get(): T {
    if (state === null) {
      currentCanvasId = getActiveCanvasId();
      state = loadForCanvas(currentCanvasId);
    }
    return state;
  }

  /** stable across renders — required for useSyncExternalStore's server snapshot */
  function getServerSnapshot(): T {
    return getDefault();
  }

  function persist() {
    const key = keyFor(currentCanvasId ?? getActiveCanvasId());
    writeLocal(key, state);
    pushToServer(key, state);
  }

  function set(next: T) {
    state = next;
    persist();
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  async function syncWithServer() {
    const key = keyFor(currentCanvasId ?? getActiveCanvasId());
    const remote = await pullFromServer<unknown>(key);
    if (remote === undefined) {
      pushToServer(key, get());
      return;
    }
    const clean = sanitize(remote);
    if (clean === null || JSON.stringify(clean) === JSON.stringify(get())) return;
    state = clean;
    writeLocal(key, state);
    listeners.forEach((listener) => listener());
  }

  /** drop the active canvas's stored value and go back to buildDefault() */
  function reset() {
    const id = currentCanvasId ?? getActiveCanvasId();
    state = getDefault();
    try {
      localStorage.removeItem(keyFor(id));
    } catch {
      // ignore
    }
    deleteFromServer(keyFor(id));
    listeners.forEach((listener) => listener());
  }

  if (typeof window !== "undefined") {
    // reload whenever the active canvas changes, whether or not the widget
    // consuming this store stays mounted across the switch
    subscribeCanvases(() => {
      const activeId = getActiveCanvasId();
      if (state !== null && activeId === currentCanvasId) return;
      currentCanvasId = activeId;
      state = loadForCanvas(activeId);
      listeners.forEach((listener) => listener());
      syncWithServer();
    });
    syncWithServer();
    pollWhileVisible(syncWithServer);
  }

  return { get, getServerSnapshot, set, subscribe, reset };
}

/** reactive read of the active canvas id — re-renders on canvas switch */
export function useActiveCanvasId(): string {
  return useSyncExternalStore(subscribeCanvases, getActiveCanvasId, getActiveCanvasId);
}

/** useState-shaped hook backed by the same canvas-scoped + server-synced
    storage as createCanvasStore(), for widgets that keep their data as plain
    component state instead of a module-level store. Switching the active
    canvas reloads `value` even if the widget itself stays mounted (it may be
    placed on more than one canvas). `hydrated` is false until the first
    client-side load completes, matching the SSR-safe hydration pattern the
    widgets already use. */
export function useCanvasSyncedState<T>(
  baseKey: string,
  buildDefault: () => T,
  sanitize: (raw: unknown) => T | null,
): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const canvasId = useActiveCanvasId();
  const key = canvasScopedKey(baseKey, canvasId);

  const [value, setValueState] = useState<T>(buildDefault);
  const [hydrated, setHydrated] = useState(false);
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
    const initial = readLocal<T>(key, sanitize) ?? buildDefault();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage/the active canvas only exist on the client; loading them after mount (not in a lazy initializer) keeps the server render and first client render identical
    setValueState(initial);
    setHydrated(true);

    let cancelled = false;
    async function sync() {
      const remote = await pullFromServer<unknown>(key);
      if (cancelled || keyRef.current !== key) return;
      if (remote === undefined) {
        pushToServer(key, readLocal<T>(key, sanitize) ?? buildDefault());
        return;
      }
      const cleaned = sanitize(remote);
      if (cleaned === null) return;
      writeLocal(key, cleaned);
      setValueState(cleaned);
    }
    sync();
    const stopPolling = pollWhileVisible(() => {
      if (keyRef.current === key) sync();
    });

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildDefault/sanitize are stable per caller by convention (module-scope functions)
  }, [key]);

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    setValueState((prev) => {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      writeLocal(keyRef.current, resolved);
      pushToServer(keyRef.current, resolved);
      return resolved;
    });
  }, []);

  return [value, setValue, hydrated];
}
