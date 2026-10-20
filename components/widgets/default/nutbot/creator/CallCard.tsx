"use client";

// A function call offered in the Widget Creator chat: reload the page, open
// the Widget Manager, regenerate the skills. These used to be plain chat
// lines with a button, which froze a moment's state into the saved
// transcript — "installed, but not in the loaded registry yet" with a reload
// button stayed on screen forever, long after the reload had happened,
// because the chat is kept across reloads.
//
// A call card instead keeps only *what is being offered* (fn + slug) in the
// transcript and works out whether it is still needed from the live app every
// time it renders. Once the need has gone it collapses to a one-line record,
// so retaining the chat never resurrects a stale prompt.

import { useEffect, useState, type ComponentType } from "react";
import { Check, LayoutGrid, RefreshCw, Sparkles, X } from "lucide-react";
import { getManifest } from "@/config/widgets";
import { getPlacementSnapshot, getRegionsThatFitWidget, subscribeSlotLayout } from "@/lib/slotLayout";

export type CallFn = "reload-page" | "open-widget-manager" | "sync-skills";

export type CallResult = { ok: boolean; detail?: string };

export type CallMessage = {
  role: "call";
  fn: CallFn;
  /** the widget the call is about — what lets "still needed?" be read live */
  slug?: string;
  /** why the call is on offer */
  text: string;
  /** set when a call with nothing live to check (sync-skills) has run */
  result?: CallResult;
};

type CallSpec = {
  /** how the call is named in the transcript */
  name: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

const CALLS: Record<CallFn, CallSpec> = {
  "reload-page": { name: "reload_page()", label: "reload", Icon: RefreshCw },
  "open-widget-manager": { name: "open_widget_manager()", label: "open", Icon: LayoutGrid },
  "sync-skills": { name: "sync_skills()", label: "regenerate", Icon: Sparkles },
};

/** Why the call no longer needs doing, or null while it still does. Reads the
    live registry and layout, never the transcript. `superseded` is for a call
    the conversation has moved past (see ChatCanvas). */
export function callResolution(
  call: Pick<CallMessage, "fn" | "result">,
  slug: string | null,
  superseded = false,
): string | null {
  if (call.result?.ok) return call.result.detail ?? "done";
  if (superseded) return "superseded by a later message";
  if (!slug) return null;
  if (call.fn === "reload-page") {
    return getManifest(slug) ? `"${slug}" is in the loaded registry, no reload needed` : null;
  }
  if (call.fn === "open-widget-manager") {
    if (getPlacementSnapshot(slug).kind !== "none") return `"${slug}" is already on the canvas`;
    if (getRegionsThatFitWidget(slug).length > 0) return "a canvas region has room for it now";
  }
  return null;
}

/** re-renders the caller while `active` — on layout changes, and on a slow
    timer for the registry, which has no change event (it only changes with a
    page reload or a hot update) */
function useRecheck(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const bump = () => setTick((n) => n + 1);
    const unsubscribe = subscribeSlotLayout(bump);
    const timer = setInterval(bump, 1500);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [active]);
}

export function CallCard({
  call,
  fallbackSlug,
  superseded,
  onCall,
  onSettled,
}: {
  call: CallMessage;
  /** the widget this chat is working on, for calls saved before they carried a slug */
  fallbackSlug: string | null;
  superseded: boolean;
  onCall: (fn: CallFn) => Promise<CallResult>;
  onSettled: (result: CallResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const slug = call.slug ?? fallbackSlug;
  const resolved = callResolution(call, slug, superseded);
  useRecheck(resolved === null);

  const { name, label, Icon } = CALLS[call.fn];

  if (resolved !== null) {
    return (
      <div className="wc-msg wc-call resolved">
        <Check size={11} strokeWidth={2.25} />
        <span className="wc-call-name">{name}</span>
        <span className="wc-call-note">{resolved}</span>
      </div>
    );
  }

  async function run() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await onCall(call.fn);
    setBusy(false);
    if (!result.ok) setFailure(result.detail ?? "the call failed");
    onSettled(result);
  }

  return (
    <div className={`wc-msg wc-call${failure ? " failed" : ""}`}>
      <div className="wc-call-head">
        <Icon size={12} strokeWidth={1.75} />
        <span className="wc-call-name">{name}</span>
        <span className="wc-call-state">{busy ? "running" : failure ? "failed" : "needs you"}</span>
      </div>
      <div className="wc-call-body">
        <span className="wc-call-text">{call.text}</span>
        <button type="button" className="wc-call-btn" onClick={() => void run()} disabled={busy}>
          {busy ? "running..." : failure ? "retry" : label}
        </button>
      </div>
      {failure && (
        <div className="wc-call-error">
          <X size={11} strokeWidth={2.25} />
          <span>{failure}</span>
        </div>
      )}
    </div>
  );
}
