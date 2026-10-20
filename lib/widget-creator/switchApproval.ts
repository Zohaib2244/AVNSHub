import { randomUUID } from "crypto";

// Shared between route bundles, survives dev module reloads. A restart or
// expired request can never authorize a switch.
const state = globalThis as typeof globalThis & { nutbotApprovals?: Map<string, (approved: boolean) => void> };
const pending = state.nutbotApprovals ??= new Map();
export function requestSwitch(signal: AbortSignal, notify: (id: string) => void): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const id = randomUUID();
    const finish = (approved: boolean) => {
      pending.delete(id); clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(approved);
    };
    const abort = () => finish(false);
    const timer = setTimeout(abort, 5 * 60_000);
    pending.set(id, finish);
    signal.addEventListener("abort", abort, { once: true });
    notify(id);
  });
}
export function answerSwitch(id: string, approved: boolean): boolean {
  const finish = pending.get(id);
  if (!finish) return false;
  finish(approved);
  return true;
}
