"use client";
import { showHubDialog, dismissHubDialog, getDialogConfig } from "@/lib/hubDialog";

export function confirmProviderSwitch(payload: Record<string, unknown>, signal: AbortSignal) {
  if (typeof payload.id !== "string" || signal.aborted) return;
  let settled = false;
  const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); };
  const answer = async (approved: boolean) => {
    if (settled) return;
    settled = true;
    cleanup();
    try {
      const res = await fetch("/api/widget-creator/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: payload.id, approved }) });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error("Switch request expired. Retry your request when ready.");
    } catch {
      showHubDialog({ title: "Switch was not confirmed", body: "The decision could not reach the server or the request expired. Stop the run and retry when ready; no switch is authorized by this dialog.", confirmLabel: "close", onConfirm: () => {} });
    }
  };
  const config = {
    title: `Switch from ${payload.from} to ${payload.to}?`,
    body: `${payload.reason}. Continue partial work with ${payload.to} / ${payload.model}? This uses that provider's subscription. Cancel keeps the partial files so you can retry or select another provider.`,
    confirmLabel: "switch and continue",
    onConfirm: () => { void answer(true); },
    onCancel: () => { void answer(false); },
  };
  const cancel = () => { if (getDialogConfig() === config) dismissHubDialog(); };
  const timer = setTimeout(cancel, 5 * 60_000);
  signal.addEventListener("abort", cancel, { once: true });
  showHubDialog(config);
}
