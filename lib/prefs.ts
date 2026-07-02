// Global hub preferences — mirrors the lib/theme.ts external-store pattern.
// Server renders the defaults; the client lazily reads the saved values from
// localStorage["nutmag-prefs"]. Written immediately on change, and mirrored
// to the shared-hub server (lib/serverSync.ts) so every browser/device
// converges on the same prefs instead of each being stuck with its own.

import { HARNESS_CHAIN_DEFAULT, type HarnessId } from "./widget-creator/harnessAdapters";
import { pollWhileVisible, pullFromServer, pushToServer } from "./serverSync";

export type ChatBackend = "auto" | "bonfire" | HarnessId | "off";

export type Prefs = {
  /** false = every usePolling consumer fetches once and stops refreshing */
  pollingEnabled: boolean;
  /** false = skip the boot-sequence intro entirely */
  bootSequence: boolean;
  /** NutBot chat backend selector */
  chatBackend: ChatBackend;
  /** false = hide the widget creator without probing/spawning harnesses */
  creatorEnabled: boolean;
  /** active CLI harness for the widget creator */
  activeHarness: HarnessId;
  /** ordered fallback chain for rate-limit auto-switching */
  harnessChain: HarnessId[];
};

export const DEFAULT_PREFS: Prefs = {
  pollingEnabled: true,
  bootSequence: true,
  chatBackend: "auto",
  creatorEnabled: true,
  activeHarness: "claude",
  harnessChain: [...HARNESS_CHAIN_DEFAULT],
};

const STORAGE_KEY = "nutmag-prefs";
const listeners = new Set<() => void>();

let prefs: Prefs | null = null;

const VALID_HARNESS_IDS: HarnessId[] = ["claude", "codex", "opencode"];

function isHarnessId(v: unknown): v is HarnessId {
  return typeof v === "string" && (VALID_HARNESS_IDS as string[]).includes(v);
}

function isChatBackend(v: unknown): v is ChatBackend {
  return v === "auto" || v === "bonfire" || v === "off" || isHarnessId(v);
}

function sanitize(raw: unknown): Prefs {
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const chain = Array.isArray(stored.harnessChain)
    ? (stored.harnessChain as unknown[]).filter(isHarnessId)
    : DEFAULT_PREFS.harnessChain;
  return {
    pollingEnabled:
      typeof stored.pollingEnabled === "boolean" ? stored.pollingEnabled : DEFAULT_PREFS.pollingEnabled,
    bootSequence: typeof stored.bootSequence === "boolean" ? stored.bootSequence : DEFAULT_PREFS.bootSequence,
    chatBackend: isChatBackend(stored.chatBackend) ? stored.chatBackend : DEFAULT_PREFS.chatBackend,
    creatorEnabled:
      typeof stored.creatorEnabled === "boolean" ? stored.creatorEnabled : DEFAULT_PREFS.creatorEnabled,
    activeHarness: isHarnessId(stored.activeHarness) ? stored.activeHarness : DEFAULT_PREFS.activeHarness,
    harnessChain: chain.length > 0 ? chain : DEFAULT_PREFS.harnessChain,
  };
}

export function getPrefs(): Prefs {
  if (prefs === null) {
    prefs = DEFAULT_PREFS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) prefs = sanitize(JSON.parse(raw));
    } catch {
      // corrupt saved prefs — keep the defaults
    }
  }
  return prefs;
}

export function getServerPrefs(): Prefs {
  return DEFAULT_PREFS;
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage full/blocked — prefs still apply for this session
  }
  pushToServer(STORAGE_KEY, prefs);
  listeners.forEach((listener) => listener());
}

export function subscribePrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Reconcile with the server: on load, and every 15s thereafter (skipped
// while the tab is hidden). A fresh install has nothing on the server yet,
// in which case we seed it with whatever's local (defaults, on a first run).
async function syncWithServer() {
  const remote = await pullFromServer<Prefs>(STORAGE_KEY);
  if (remote === undefined) {
    pushToServer(STORAGE_KEY, getPrefs());
    return;
  }
  const clean = sanitize(remote);
  if (JSON.stringify(clean) === JSON.stringify(getPrefs())) return;
  prefs = clean;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage full/blocked — the reconciled value still applies for this session
  }
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  syncWithServer();
  pollWhileVisible(syncWithServer);
}
