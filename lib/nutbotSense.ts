// NutBot's per-frame senses — deliberately NOT a React store.
//
// Everything here is read once per animation frame by NutBotFaceV2's RAF loop
// and must never cause a render: a mouth that reshapes on every streamed token
// or eyes that follow the cursor would otherwise re-render the whole widget at
// 60fps. Same pattern as lib/hoeSignal.ts (which stays separate — SlotRegion
// owns that one), just with more channels.

/* ── pointer ─────────────────────────────────────────────────────────────
   Where the cursor is, in viewport coords, so the eyes can follow it. Tracking
   is refcounted and lazy: no listener exists until a face mounts, and the last
   one to unmount removes it. `movedAt` lets the face ignore a stale position
   and fall back to its idle look-around after the mouse has been still. */

type Pointer = { x: number; y: number; movedAt: number; inside: boolean };

let pointer: Pointer = { x: 0, y: 0, movedAt: 0, inside: false };
let pointerRefs = 0;

function onPointerMove(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY, movedAt: performance.now(), inside: true };
}
function onPointerLeave() {
  pointer = { ...pointer, inside: false };
}

export function startPointerTracking(): () => void {
  if (typeof window === "undefined") return () => {};
  pointerRefs += 1;
  if (pointerRefs === 1) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
  }
  return () => {
    pointerRefs -= 1;
    if (pointerRefs === 0) {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    }
  };
}

export function getPointer(): Pointer {
  return pointer;
}

/* ── speech energy ───────────────────────────────────────────────────────
   Chat streaming calls pulseSpeech() per token frame; the face turns the
   decaying energy into mouth movement, so NutBot's mouth actually moves at the
   rate text is arriving instead of holding one static smile for the whole
   reply. Decay is computed on read — no timer, and it survives a tab that was
   backgrounded mid-reply. */

const SPEECH_DECAY_MS = 260;
let speechEnergy = 0;
let speechAt = 0;

export function pulseSpeech(chars = 1) {
  const now = performance.now();
  // decay what's already there before adding, so a burst of tokens builds up
  // rather than each one resetting the level
  speechEnergy = currentSpeechEnergy(now) + Math.min(0.5, 0.12 + chars * 0.012);
  if (speechEnergy > 1) speechEnergy = 1;
  speechAt = now;
}

function currentSpeechEnergy(now: number): number {
  if (speechEnergy <= 0) return 0;
  const decayed = speechEnergy * Math.exp(-(now - speechAt) / SPEECH_DECAY_MS);
  return decayed < 0.004 ? 0 : decayed;
}

export function getSpeechEnergy(): number {
  return currentSpeechEnergy(performance.now());
}

export function resetSpeech() {
  speechEnergy = 0;
  speechAt = 0;
}

/* ── glance ──────────────────────────────────────────────────────────────
   A one-shot "look over there" the rest of the app can fire at a screen
   position — used when a freshly built widget lands on the canvas, or when the
   canvas switches, so NutBot reacts to the thing that just happened instead of
   staring ahead through it. */

type Glance = { x: number; y: number; until: number } | null;
let glance: Glance = null;

export function glanceAt(x: number, y: number, ms = 1600) {
  glance = { x, y, until: performance.now() + ms };
}

/** glance at a widget card by its id (the card's DOM id is the widget id) */
export function glanceAtElement(id: string, ms = 1600): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  glanceAt(r.left + r.width / 2, r.top + r.height / 2, ms);
  return true;
}

export function getGlance(): { x: number; y: number } | null {
  if (!glance) return null;
  if (performance.now() > glance.until) { glance = null; return null; }
  return { x: glance.x, y: glance.y };
}

/* ── machine load ────────────────────────────────────────────────────────
   0..1, written by lib/nutbotMood.ts from /api/system-stats. The face uses it
   as a continuous dial (breathing rate, vent flicker), separate from the
   discrete "strained" ambient signal it also raises past a threshold. */

let load = 0;

export function setLoad(value: number) {
  load = Math.min(1, Math.max(0, value));
}

export function getLoad(): number {
  return load;
}
