// Tiny module-level signal store for cross-component notifications in NutBot.
// Emitters fire and auto-clear; NutBotFaceV2 reads via useSyncExternalStore
// to drive expression changes.

export type Signal =
  | { type: "widget_created"; id: string }
  | { type: "thinking" }
  | { type: "error"; msg?: string }
  | { type: "working" }
  | null;

let signal: Signal = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function emit(s: Signal, durationMs = 3500) {
  signal = s;
  notify();
  setTimeout(() => {
    signal = null;
    notify();
  }, durationMs);
}

export function emitWidgetCreated(id: string) { emit({ type: "widget_created", id }, 3500); }
export function emitThinking()                { emit({ type: "thinking" }, 8000); }
export function emitError(msg?: string)       { emit({ type: "error", msg }, 4000); }
export function emitWorking()                 { emit({ type: "working" }, 6000); }

export function getSignal(): Signal        { return signal; }
export function getServerSignal(): Signal  { return null; }

export function subscribeSignal(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
