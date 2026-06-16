// Global hub preferences — mirrors the lib/theme.ts external-store pattern.
// Server renders the defaults; the client lazily reads the saved values from
// localStorage["nutmag-prefs"]. Written immediately on change.

import { HARNESS_CHAIN_DEFAULT, type HarnessId } from "./widget-creator/harnessAdapters";

export type Prefs = {
  /** false = every usePolling consumer fetches once and stops refreshing */
  pollingEnabled: boolean;
  /** false = skip the boot-sequence intro entirely */
  bootSequence: boolean;
  /** active CLI harness for the widget creator */
  activeHarness: HarnessId;
  /** ordered fallback chain for rate-limit auto-switching */
  harnessChain: HarnessId[];
};

export const DEFAULT_PREFS: Prefs = {
  pollingEnabled: true,
  bootSequence: true,
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

function sanitize(raw: unknown): Prefs {
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const chain = Array.isArray(stored.harnessChain)
    ? (stored.harnessChain as unknown[]).filter(isHarnessId)
    : DEFAULT_PREFS.harnessChain;
  return {
    pollingEnabled:
      typeof stored.pollingEnabled === "boolean" ? stored.pollingEnabled : DEFAULT_PREFS.pollingEnabled,
    bootSequence: typeof stored.bootSequence === "boolean" ? stored.bootSequence : DEFAULT_PREFS.bootSequence,
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
  listeners.forEach((listener) => listener());
}

export function subscribePrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
