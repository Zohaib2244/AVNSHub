// Tiny module-level signal store for cross-component notifications in NutBot.
// ChatCanvas writes here when widget creation finishes; NutBotFace reads it
// to trigger the celebrate animation.

type Signal = { type: "widget_created"; id: string } | null;

let signal: Signal = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function emitWidgetCreated(id: string) {
  signal = { type: "widget_created", id };
  notify();
  setTimeout(() => {
    signal = null;
    notify();
  }, 3500);
}

export function getSignal(): Signal {
  return signal;
}

export function getServerSignal(): Signal {
  return null;
}

export function subscribeSignal(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
