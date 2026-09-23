// Signal bus for NutBot's face — cross-component notifications that drive
// which expression the robot wears. NutBotFaceV2 reads the *active* signal via
// useSyncExternalStore.
//
// v2.6: this used to be a single `signal` variable with a per-emit
// `setTimeout` that nulled it. That was last-write-wins: two overlapping
// emitters clobbered each other, a late timeout from an already-superseded
// emit could blank a live one, and a caller that missed its clearSignal() left
// the face stuck for the full (120s) duration. It is now a keyed map of
// entries with priorities — the face shows the highest-priority live entry, so
// an error always beats chatter, chatter always beats ambient mood, and each
// emitter only ever owns its own key.
//
// Two channels share the map:
//   • EVENT signals  — emitted by chat/creator/boot, expire on their own or
//     when the caller calls clearSignal().
//   • AMBIENT signals — written by lib/nutbotMood.ts (sleepy / bored /
//     strained). They never expire and clearSignal() does not touch them:
//     they are the floor the face falls back to when nothing is happening.

export type SignalType =
  | "widget_created"
  | "thinking"
  | "error"
  | "working"
  | "speaking"
  | "browsing"
  | "boot_complete"
  | "surprise"
  | "delight"
  | "irritated"
  | "sleepy"
  | "bored"
  | "strained";

export type Signal =
  | { type: "widget_created"; id: string }
  | { type: "thinking" }
  | { type: "error"; msg?: string }
  /** progress is 0..1 when the caller knows how far along it is, else absent */
  | { type: "working"; progress?: number }
  | { type: "speaking" }
  | { type: "browsing" }
  | { type: "boot_complete" }
  | { type: "surprise"; msg?: string }
  | { type: "delight"; msg?: string }
  | { type: "irritated"; msg?: string }
  | { type: "sleepy" }
  | { type: "bored" }
  /** level is the worst offending resource, 0..1 */
  | { type: "strained"; level?: number }
  | null;

/** higher wins. Ambient moods sit far below every event on purpose. */
const PRIORITY: Record<SignalType, number> = {
  error:          100,
  widget_created:  90,
  boot_complete:   85,
  speaking:        70,
  browsing:        65,
  thinking:        60,
  working:         55,
  surprise:        50,
  delight:         48,
  irritated:       44,
  strained:        12,
  bored:           10,
  sleepy:           8,
};

const AMBIENT: ReadonlySet<SignalType> = new Set<SignalType>(["sleepy", "bored", "strained"]);

type Entry = { sig: NonNullable<Signal>; at: number; expiresAt: number | null };

const entries = new Map<SignalType, Entry>();
const listeners = new Set<() => void>();

/** cached so getSignal() is a stable reference between changes —
    useSyncExternalStore re-renders on every getSnapshot identity change */
let active: Signal = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  listeners.forEach((l) => l());
}

function sweep(now: number) {
  for (const [type, entry] of entries) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) entries.delete(type);
  }
}

/** one timer for the whole map, re-armed at the nearest expiry */
function armExpiry(now: number) {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  let next = Infinity;
  for (const entry of entries.values()) {
    if (entry.expiresAt !== null && entry.expiresAt < next) next = entry.expiresAt;
  }
  if (next === Infinity) return;
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    recompute();
  }, Math.max(16, next - now));
}

function recompute() {
  const now = Date.now();
  sweep(now);

  let winner: Entry | null = null;
  for (const entry of entries.values()) {
    if (!winner) { winner = entry; continue; }
    const a = PRIORITY[entry.sig.type];
    const b = PRIORITY[winner.sig.type];
    // equal priority → whichever was emitted more recently
    if (a > b || (a === b && entry.at > winner.at)) winner = entry;
  }

  const next = winner ? winner.sig : null;
  const changed = next !== active;
  active = next;
  armExpiry(now);
  if (changed) notify();
}

function emit(sig: NonNullable<Signal>, durationMs: number | null) {
  const now = Date.now();
  entries.set(sig.type, { sig, at: now, expiresAt: durationMs === null ? null : now + durationMs });
  recompute();
}

export function emitWidgetCreated(id: string) { emit({ type: "widget_created", id }, 3500); }
export function emitThinking()                { emit({ type: "thinking" }, 8000); }
export function emitError(msg?: string)       { emit({ type: "error", msg }, 4000); }
// Long duration — caller is expected to call clearSignal() when work finishes
export function emitWorking()                 { emit({ type: "working" }, 120_000); }
// Chat-specific signals — caller clears explicitly when the reply finishes
export function emitSpeaking()                { emit({ type: "speaking" }, 120_000); }
export function emitBrowsing()                { emit({ type: "browsing" }, 30_000); }
export function emitBootComplete()            { emit({ type: "boot_complete" }, 3000); }
// Reaction signals — short, any widget may fire them at the face
export function emitSurprise(msg?: string)    { emit({ type: "surprise", msg }, 2200); }
export function emitDelight(msg?: string)     { emit({ type: "delight", msg }, 2600); }
export function emitIrritated(msg?: string)   { emit({ type: "irritated", msg }, 2600); }

/** determinate progress for the running `working` signal (0..1) — the face
    draws a fill instead of an open-ended loop. No-op if nothing is working. */
export function setProgress(progress: number) {
  const entry = entries.get("working");
  if (!entry || entry.sig.type !== "working") return;
  const clamped = Math.min(1, Math.max(0, progress));
  if (entry.sig.progress === clamped) return;
  entries.set("working", { ...entry, sig: { type: "working", progress: clamped } });
  recompute();
  // recompute() only notifies on an identity change of the *winner*; a progress
  // edit keeps the same type but a new object, so force it
  notify();
}

/** the mood floor (lib/nutbotMood.ts owns this). null clears it. */
export function setAmbient(sig: Extract<NonNullable<Signal>, { type: "sleepy" | "bored" | "strained" }> | null) {
  for (const type of AMBIENT) entries.delete(type);
  if (sig) entries.set(sig.type, { sig, at: Date.now(), expiresAt: null });
  recompute();
}

/** "my work is done". With no argument this drops every event signal but
    leaves the ambient mood alone, which is what every existing caller means. */
export function clearSignal(type?: SignalType) {
  if (type) entries.delete(type);
  else for (const key of [...entries.keys()]) if (!AMBIENT.has(key)) entries.delete(key);
  recompute();
}

export function getSignal(): Signal        { return active; }
export function getServerSignal(): Signal  { return null; }

export function subscribeSignal(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
