// NutBot's ambient mood driver — the thing that gives the face a life of its
// own between chat replies.
//
// NutBotFaceV2 ships thirteen expressions but until v2.6 only six were
// reachable: sleepy/bored/nervous/annoyed/surprised/love were fully animated
// and completely unreachable because nothing ever emitted a signal for them.
// This module supplies the missing half from ambient state instead of chat
// events, which also turns the face into a status surface for the whole hub:
//
//   idle for a while              → bored
//   idle for a long while (sooner at night) → sleepy
//   machine under real load       → strained
//   telemetry endpoint failing    → a one-off irritated reaction
//
// It writes through setAmbient(), which sits below every event signal in the
// priority table, so chatter always wins and the mood is just the floor the
// face returns to. Refcounted: several faces (the widget, the wallpaper
// mascot) share one driver and one timer.

import { emitIrritated, setAmbient } from "@/lib/nutbotSignal";
import { setLoad } from "@/lib/nutbotSense";

const BORED_AFTER_MS  = 3 * 60_000;
const SLEEPY_AFTER_MS = 12 * 60_000;
/** past this hour (and before NIGHT_END) NutBot nods off sooner */
const NIGHT_START = 23;
const NIGHT_END = 6;
const NIGHT_SLEEPY_AFTER_MS = 5 * 60_000;

/** raise/drop thresholds differ so a machine hovering at the line doesn't
    make the face flicker between strained and calm */
const STRAIN_ON = 0.88;
const STRAIN_OFF = 0.78;

const TELEMETRY_INTERVAL_MS = 60_000;
const TICK_MS = 15_000;

type Telemetry = {
  cpu?: { used_pct?: number };
  memory?: { used_pct?: number };
  drives?: { used_pct?: number }[];
};

let refs = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let telemetryTimer: ReturnType<typeof setInterval> | null = null;
let lastInteraction = 0;
let strained = false;
let failures = 0;
let telemetryOn = false;

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

function markInteraction() {
  lastInteraction = Date.now();
}

/** Read the global polling pref without importing lib/prefs — that module
    pulls the whole widget-creator harness/model config in with it, and the
    wallpaper mascot build has no business bundling any of that. Any parse
    failure just means "polling on", the default. */
function pollingEnabled(): boolean {
  try {
    const raw = localStorage.getItem("nutmag-prefs");
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { pollingEnabled?: boolean };
    return parsed.pollingEnabled !== false;
  } catch {
    return true;
  }
}

function sleepyThreshold(): number {
  const hour = new Date().getHours();
  const night = hour >= NIGHT_START || hour < NIGHT_END;
  return night ? NIGHT_SLEEPY_AFTER_MS : SLEEPY_AFTER_MS;
}

function evaluate() {
  // a hidden tab is not "idle", it's unwatched — don't let a backgrounded hub
  // come back already asleep
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

  const idleFor = Date.now() - lastInteraction;

  if (strained) return setAmbient({ type: "strained", level: 1 });
  if (idleFor > sleepyThreshold()) return setAmbient({ type: "sleepy" });
  if (idleFor > BORED_AFTER_MS) return setAmbient({ type: "bored" });
  setAmbient(null);
}

async function sampleTelemetry() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  if (!pollingEnabled()) return;
  try {
    const res = await fetch("/api/system-stats");
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Telemetry;
    failures = 0;

    const worstDrive = Math.max(0, ...(data.drives ?? []).map((d) => d.used_pct ?? 0));
    const level = Math.max(data.cpu?.used_pct ?? 0, data.memory?.used_pct ?? 0, worstDrive) / 100;
    setLoad(level);
    strained = strained ? level > STRAIN_OFF : level >= STRAIN_ON;
    evaluate();
  } catch {
    failures += 1;
    // one grumble, not one per failed poll — the face shouldn't nag about a
    // backend that has been down for an hour
    if (failures === 3) emitIrritated("telemetry unreachable");
  }
}

/**
 * Start the ambient driver. Returns a stop function; the driver actually stops
 * when the last caller releases it.
 *
 * @param telemetry poll /api/system-stats for load-driven moods. Off for the
 *   wallpaper mascot, which runs in a static build with no server behind it.
 */
export function startMoodDriver({ telemetry = true }: { telemetry?: boolean } = {}): () => void {
  if (typeof window === "undefined") return () => {};

  refs += 1;
  telemetryOn = telemetryOn || telemetry;

  if (refs === 1) {
    markInteraction();
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, markInteraction, { passive: true });
    }
    document.addEventListener("visibilitychange", markInteraction);
    tickTimer = setInterval(evaluate, TICK_MS);
  }

  if (telemetryOn && !telemetryTimer) {
    void sampleTelemetry();
    telemetryTimer = setInterval(() => void sampleTelemetry(), TELEMETRY_INTERVAL_MS);
  }

  return () => {
    refs -= 1;
    if (refs > 0) return;
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, markInteraction);
    document.removeEventListener("visibilitychange", markInteraction);
    if (tickTimer) clearInterval(tickTimer);
    if (telemetryTimer) clearInterval(telemetryTimer);
    tickTimer = null;
    telemetryTimer = null;
    telemetryOn = false;
    strained = false;
    failures = 0;
    setAmbient(null);
  };
}

/** "the user did something" — for interactions that aren't raw DOM events on
    window (a widget poke, a canvas switch), so NutBot wakes up for them too */
export function reportInteraction() {
  markInteraction();
  evaluate();
}
