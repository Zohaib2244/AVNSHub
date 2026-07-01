"use client";

import { useEffect, useRef, useState } from "react";
import { Download, PlusCircle, Send, Square } from "lucide-react";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { clearSignal, emitWidgetCreated, emitWorking } from "@/lib/nutbotSignal";
import {
  placeWidgetAuto,
  unplaceWidgetTemporarily,
  restorePlacementSnapshot,
  getPlacementSnapshot,
  type PlacementSnapshot,
} from "@/lib/slotLayout";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { isValidSlug } from "@/lib/widget-creator/slug";

type Phase =
  | { id: "idle" }
  | { id: "connecting"; harness: HarnessId }
  | { id: "generating"; harness: HarnessId }
  | { id: "tsc" }
  | { id: "done" }
  | { id: "error"; message: string };

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; streaming?: boolean }
  | { role: "switch"; from: HarnessId; to: HarnessId; reason: string }
  | { role: "tsc_errors"; errors: string[] }
  | { role: "ok"; text: string }
  | { role: "error"; text: string };

type Props = {
  settings: GenerateSettings;
  onSettingsChange: (patch: Partial<GenerateSettings>) => void;
  activeHarness: HarnessId;
  harnessChain: HarnessId[];
  /** pre-fills the prompt textarea on mount (e.g. after finalizing an Ideate
      mockup) — only read once via lazy useState init, not kept in sync */
  initialPrompt?: string;
};

const PHASE_LABEL: Record<Phase["id"], string> = {
  idle: "ready",
  connecting: "connecting...",
  generating: "generating...",
  tsc: "checking types...",
  done: "done",
  error: "error",
};

function StatusBar({ phase }: { phase: Phase }) {
  const isActive = phase.id === "connecting" || phase.id === "generating" || phase.id === "tsc";
  const harness = (phase as { harness?: HarnessId }).harness;
  return (
    <div className={`wc-status-bar${phase.id === "error" ? " error" : phase.id === "done" ? " done" : isActive ? " active" : ""}`}>
      {isActive && <span className="wc-status-dot" />}
      <span className="wc-status-label">
        {PHASE_LABEL[phase.id]}
        {harness && ` · ${harness}`}
        {phase.id === "error" && ` · ${(phase as { message: string }).message}`}
      </span>
    </div>
  );
}

// Mirrors the slug check in registerCustomWidget() (lib/widget-creator/customRegistry.ts) —
// catch a missing/invalid slug here, before spawning a harness, instead of
// after a full generation run completes.
function validateSettings(settings: GenerateSettings): string | null {
  if (settings.editSlug) return null; // edit mode always has a valid editSlug from the picker
  const slug = (settings.slug ?? "").trim();
  if (!slug) return "enter a widget name or slug in the settings panel before generating — registration needs an id";
  if (!isValidSlug(slug)) return `invalid slug "${slug}" — use only lowercase letters, numbers, and hyphens`;
  return null;
}

const MESSAGES_KEY = "nutmag-creator-messages";
const SESSION_ID_KEY = "nutmag-creator-session-id";
// `registered` distinguishes "already wired into customComponentMap.tsx /
// customRegistry.json" (an edit to a pre-existing widget — the generate route
// applies that immediately) from "still needs the explicit add-to-layout
// commit" (a brand-new widget — see registerCustomWidget()'s doc comment).
const DONE_KEY = "nutmag-creator-done";
// set right before the add-to-layout click's register fetch, so a full reload
// triggered by that commit (Fast Refresh can't hot-swap customComponentMap.tsx)
// doesn't strand the user on a finished widget with no visible next step
const PENDING_ADD_KEY = "nutmag-creator-pending-add";

type DoneRecord = { slug: string; registered: boolean };

function readDoneRecord(): DoneRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DONE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DoneRecord>;
    return typeof parsed.slug === "string" ? { slug: parsed.slug, registered: Boolean(parsed.registered) } : null;
  } catch {
    return null;
  }
}

function writeDoneRecord(record: DoneRecord | null) {
  try {
    if (record) sessionStorage.setItem(DONE_KEY, JSON.stringify(record));
    else sessionStorage.removeItem(DONE_KEY);
  } catch {}
}

export function ChatCanvas({ settings, onSettingsChange, activeHarness, harnessChain, initialPrompt }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem(MESSAGES_KEY);
        return saved ? (JSON.parse(saved) as Message[]) : [];
      } catch {}
    }
    return [];
  });
  // Claude session ID returned by the generate route on the first successful
  // turn. Sent back on every subsequent request so the route can use --resume
  // (the model already has the full authoring guide + widget spec in context,
  // so only the bare user instruction needs to be re-sent).
  const [creatorSessionId, setCreatorSessionId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try { return sessionStorage.getItem(SESSION_ID_KEY); } catch {}
    }
    return null;
  });
  // Track which widget slug the current session was established for so we can
  // invalidate it if the user switches to a different widget target.
  const sessionForSlugRef = useRef<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  // restore done state from sessionStorage so HMR/reload doesn't lose it
  const [doneWidgetId, setDoneWidgetId] = useState<string | null>(() => readDoneRecord()?.slug ?? null);
  const [pendingRegistration, setPendingRegistration] = useState(() => {
    const done = readDoneRecord();
    return done ? !done.registered : false;
  });
  const [phase, setPhase] = useState<Phase>(() => (readDoneRecord() ? { id: "done" } : { id: "idle" }));
  // a widget is only "added" once it's actually confirmed placed on the
  // canvas — for a brand-new widget that's after the register+place click; for
  // an edit it's set from restorePlacementSnapshot()'s return value below
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  // tracks a widget pulled off the canvas for the duration of an edit-mode run
  // (see generate()) — kept until the run finishes cleanly (auto-restore) or
  // the user restores it manually after a failed/aborted run
  const [editHidden, setEditHidden] = useState(false);
  const hiddenEditRef = useRef<{ slug: string; snapshot: PlacementSnapshot } | null>(null);
  const { setInstalling } = useLayout();
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdxRef = useRef(-1);

  // surface an error both in the status bar (short) and as a full, readable
  // chat message (wraps, scrolls — the status bar truncates long text)
  function fail(message: string) {
    clearSignal();
    setPhase({ id: "error", message });
    setMessages((prev) => [...prev, { role: "error", text: message }]);
  }

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, phase]);

  useEffect(() => {
    try { sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  async function generate() {
    // allow a new attempt from idle / done / error — only block while a run is
    // actually in flight (otherwise an error would strand the chat)
    const inFlight = phase.id === "connecting" || phase.id === "generating" || phase.id === "tsc";
    if (!prompt.trim() || inFlight) return;

    const validationError = validateSettings(settings);
    if (validationError) {
      fail(validationError);
      return;
    }

    const userText = prompt.trim();
    setPrompt("");

    // the slug this run is targeting — known up front for edits, derived from
    // the create-mode slug field otherwise; used to auto-switch into edit mode
    // once we know the widget exists on disk (whether the run succeeds or
    // leaves fixable tsc errors behind), so a same-session follow-up message
    // edits/debugs it instead of failing validation or re-creating from scratch
    const attemptedSlug = (settings.editSlug || settings.slug || "").trim() || null;
    let hadTscErrors = false;

    // clear any prior run's result so retrying after done/error starts clean
    setDoneWidgetId(null);
    setAdded(false);
    setPendingRegistration(false);
    writeDoneRecord(null);

    // Invalidate the claude session if we're now targeting a different widget —
    // a stale session would resume a conversation about the wrong component.
    const currentTarget = (settings.editSlug || settings.slug || "").trim() || null;
    if (creatorSessionId && sessionForSlugRef.current !== currentTarget) {
      setCreatorSessionId(null);
      try { sessionStorage.removeItem(SESSION_ID_KEY); } catch {}
    }

    assistantIdxRef.current = -1;
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setPhase({ id: "connecting", harness: activeHarness });
    emitWorking();

    // Editing an existing widget overwrites its live source file while it may
    // still be mounted on the dashboard — pull it off the canvas for the
    // duration of the run so the browser never has to compile/render a
    // possibly-broken intermediate version. Restored automatically once the
    // run finishes cleanly; left hidden (with a manual restore option) on any
    // failure/abort, since the file may have been left in a broken state.
    if (settings.editSlug) {
      const editSlug = settings.editSlug;
      const snapshot = unplaceWidgetTemporarily(editSlug);
      if (snapshot.kind !== "none") {
        hiddenEditRef.current = { slug: editSlug, snapshot };
        setEditHidden(true);
      }
    }

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/widget-creator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings,
          prompt: userText,
          harness: activeHarness,
          harnessChain,
          // If we have a session ID from a prior turn, pass it so the route
          // uses --resume and only sends the bare instruction (~50 tokens)
          // instead of re-sending the full authoring guide + widget spec (~6K).
          sessionId: creatorSessionId ?? undefined,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        fail(`server error ${res.status} — the generate request failed before streaming started`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split("\n\n");
        sseBuffer = parts.pop() ?? "";

        for (const part of parts) {
          const event = part.match(/^event: (.+)$/m)?.[1];
          const dataStr = part.match(/^data: (.+)$/m)?.[1];
          if (!dataStr) continue;

          let payload: Record<string, unknown>;
          try { payload = JSON.parse(dataStr); } catch { continue; }

          if (event === "status") {
            const type = payload.type as string;
            if (type === "harness_start") {
              setPhase({ id: "generating", harness: payload.harness as HarnessId });
            } else if (type === "tsc_check") {
              setPhase({ id: "tsc" });
            } else if (type === "done") {
              const slug = (payload.slug as string | null) ?? null;
              // true only for an edit to an already-committed widget — the
              // generate route wired it into the registry immediately (see
              // registerCustomWidget()'s doc comment). false means a brand-new
              // widget that still needs the explicit "add to layout" commit.
              const registered = Boolean(payload.registered);
              // Store the claude session ID so the next refinement turn can use
              // --resume instead of re-sending the full prompt (~6K tokens saved
              // per turn). Only present when claude ran (not codex/opencode).
              const newSessionId = (payload.sessionId as string | null) ?? null;
              if (newSessionId) {
                setCreatorSessionId(newSessionId);
                sessionForSlugRef.current = slug;
                try { sessionStorage.setItem(SESSION_ID_KEY, newSessionId); } catch {}
              }
              setPhase({ id: "done" });
              setMessages((prev) => {
                const updated = [...prev];
                const idx = assistantIdxRef.current;
                if (idx >= 0 && updated[idx]?.role === "assistant") {
                  updated[idx] = { ...(updated[idx] as { role: "assistant"; text: string }), streaming: false };
                }
                return [
                  ...updated,
                  {
                    role: "ok",
                    text: registered
                      ? "[ok] widget updated. keep chatting here to iterate on it."
                      : "[ok] widget written — click '+ add to layout' below. keep chatting here to iterate on it.",
                  },
                ];
              });
              clearSignal();
              // the run finished cleanly (no tsc errors, or we wouldn't be in this
              // branch) — safe to put an edited widget back where it was; only
              // true if it was actually pulled off the canvas at the start (it
              // may not have been, e.g. editing a widget that wasn't placed)
              let restoredOk = false;
              if (slug && hiddenEditRef.current?.slug === slug) {
                restoredOk = restorePlacementSnapshot(slug, hiddenEditRef.current.snapshot);
                hiddenEditRef.current = null;
                setEditHidden(false);
              }
              if (slug) {
                setDoneWidgetId(slug);
                setAdded(restoredOk);
                setPendingRegistration(!registered);
                emitWidgetCreated(slug);
                writeDoneRecord({ slug, registered });
                // switch this session into edit mode targeting the widget we just
                // wrote, so a follow-up message in the same chat naturally edits
                // it instead of erroring out or trying to recreate it
                onSettingsChange({ editSlug: slug });
              }
            }
          } else if (event === "chunk") {
            const text = payload.text as string;
            setMessages((prev) => {
              const idx = assistantIdxRef.current;
              if (idx === -1 || prev[idx]?.role !== "assistant") {
                assistantIdxRef.current = prev.length;
                return [...prev, { role: "assistant", text, streaming: true }];
              }
              const updated = [...prev];
              const msg = updated[idx] as { role: "assistant"; text: string; streaming?: boolean };
              updated[idx] = { ...msg, text: msg.text + text };
              return updated;
            });
          } else if (event === "switch") {
            const from = payload.from as HarnessId;
            const to = payload.to as HarnessId;
            setMessages((prev) => [...prev, { role: "switch", from, to, reason: payload.reason as string }]);
            setPhase({ id: "connecting", harness: to });
            assistantIdxRef.current = -1;
          } else if (event === "tsc_errors") {
            hadTscErrors = true;
            setMessages((prev) => [...prev, { role: "tsc_errors", errors: payload.errors as string[] }]);
          } else if (event === "error") {
            clearSignal();
            fail(payload.message as string);
            // a new widget's registration was rolled back for tsc errors, but the
            // files are still on disk — switch to edit mode on the same slug so
            // the next message in this chat asks the harness to fix those files
            // instead of failing slug validation or attempting a fresh create
            if (hadTscErrors && attemptedSlug) {
              onSettingsChange({ editSlug: attemptedSlug });
              setMessages((prev) => [
                ...prev,
                { role: "ok", text: `[info] switched to edit mode for "${attemptedSlug}" — describe the fix and resubmit` },
              ]);
            }
            // the run didn't finish cleanly — leave the widget off the canvas
            // (don't risk rendering a broken intermediate file) until the user
            // either fixes it and resubmits, or restores it manually
            if (hiddenEditRef.current) {
              setMessages((prev) => [
                ...prev,
                { role: "ok", text: `[info] "${hiddenEditRef.current!.slug}" is still off the canvas — fix and resubmit to restore it automatically, or use "restore to canvas" below.` },
              ]);
            }
          }
        }
      }
    } catch (err) {
      clearSignal();
      if ((err as Error).name === "AbortError") {
        setPhase({ id: "idle" });
      } else {
        fail((err as Error).message ?? "request failed");
      }
    } finally {
      abortRef.current = null;
      // finalize any open streaming message
      setMessages((prev) => {
        const idx = assistantIdxRef.current;
        if (idx < 0) return prev;
        const updated = [...prev];
        const msg = updated[idx];
        if (msg?.role === "assistant" && msg.streaming) {
          updated[idx] = { ...msg, streaming: false };
        }
        return updated;
      });
      // if we reach here without an explicit done/error, phase was already set
    }
  }

  function stop() {
    abortRef.current?.abort();
    clearSignal();
    setPhase({ id: "idle" });
  }

  function clearChat() {
    if (phase.id !== "idle" && phase.id !== "done" && phase.id !== "error") return;
    setMessages([]);
    setPhase({ id: "idle" });
    setDoneWidgetId(null);
    setAdded(false);
    setPendingRegistration(false);
    // a finished session may have auto-switched into edit mode and accumulated
    // identity fields for the widget it was targeting — starting a new chat
    // must reset all of it, or a stale slug surviving into the next message
    // could get misread as "create" for a widget that already exists (the
    // exact desync that let an edit-mode run delete a working widget)
    onSettingsChange({ editSlug: undefined, slug: undefined, name: undefined });
    writeDoneRecord(null);
    setCreatorSessionId(null);
    sessionForSlugRef.current = null;
    try { sessionStorage.removeItem(PENDING_ADD_KEY); } catch {}
    try { sessionStorage.removeItem(MESSAGES_KEY); } catch {}
    try { sessionStorage.removeItem(SESSION_ID_KEY); } catch {}
  }

  // placeWidgetAuto can fail right after registration because the dashboard's
  // CUSTOM_WIDGETS module hasn't picked up the dev-server's file-watcher/HMR
  // update yet — retry briefly instead of reporting success regardless of
  // whether the placement actually happened. Already-placed counts as success
  // (rather than retrying to exhaustion) so this is safe to re-enter after the
  // mount-effect below has already finished the job across a reload.
  async function placeWithRetry(slug: string, attempts: number, delayMs: number): Promise<boolean> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (getPlacementSnapshot(slug).kind !== "none" || placeWidgetAuto(slug)) return true;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  // After "Install Widget" triggers a full reload (registering a new widget
  // writes customComponentMap.tsx, which Fast Refresh can't hot-swap),
  // PENDING_ADD_KEY survives in sessionStorage. On remount we show "adding..."
  // immediately and retry placement until the new widget's lazy entry is live.
  useEffect(() => {
    let pendingSlug: string | null = null;
    try {
      pendingSlug = sessionStorage.getItem(PENDING_ADD_KEY);
    } catch {}
    if (!pendingSlug) return;

    // Show "adding..." right away so the user never sees a clickable
    // "Add to Layout" button during the retry window.
    setAdding(true);

    let cancelled = false;
    const slug = pendingSlug;
    (async () => {
      const ok = await placeWithRetry(slug, 16, 300);
      if (cancelled) return;
      try { sessionStorage.removeItem(PENDING_ADD_KEY); } catch {}
      if (ok) {
        const done = readDoneRecord();
        if (done?.slug === slug) writeDoneRecord({ slug, registered: true });
        if (doneWidgetId === slug) {
          setAdded(true);
          setPendingRegistration(false);
          setAdding(false);
        }
      } else {
        setAdding(false);
        setMessages((prev) => [
          ...prev,
          {
            role: "error",
            text: `"${slug}" was installed but couldn't be auto-placed — every region may be full. Try the Widget Manager.`,
          },
        ]);
      }
    })();

    return () => { cancelled = true; };
    // mount-only: resumes whatever was pending when the component last
    // unmounted (reload), not something that should re-run per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 1 — compile & register the new widget into the registry.
  // Writes customComponentMap.tsx, which almost always triggers a full
  // dev-server reload. PENDING_ADD_KEY marks that placement should follow
  // on the other side of that reload (picked up by the mount-effect above).
  async function handleInstall() {
    if (!doneWidgetId || adding) return;
    const slug = doneWidgetId;
    setAdding(true);
    setInstalling(true);
    try { sessionStorage.setItem(PENDING_ADD_KEY, slug); } catch {}
    setMessages((prev) => [
      ...prev,
      { role: "ok", text: `[info] installing "${slug}" — the page will refresh once to pick up the new widget.` },
    ]);
    try {
      const res = await fetch("/api/widget-creator/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: settings.name,
          icon: settings.icon,
          sizes: settings.sizes,
          orientations: settings.orientations,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        try { sessionStorage.removeItem(PENDING_ADD_KEY); } catch {}
        setInstalling(false);
        setAdding(false);
        setMessages((prev) => [
          ...prev,
          { role: "error", text: `couldn't install "${slug}": ${body.error ?? `server error ${res.status}`}` },
        ]);
        return;
      }
    } catch (err) {
      try { sessionStorage.removeItem(PENDING_ADD_KEY); } catch {}
      setInstalling(false);
      setAdding(false);
      setMessages((prev) => [...prev, { role: "error", text: `couldn't install "${slug}": ${(err as Error).message}` }]);
      return;
    }
    setPendingRegistration(false);
    const done = readDoneRecord();
    if (done?.slug === slug) writeDoneRecord({ slug, registered: true });
    // If the reload fires before we get here, the component unmounts and the
    // mount-effect handles placement on the other side. If Fast Refresh
    // somehow handles it without a reload, fall through to placement below.
    const ok = await placeWithRetry(slug, 8, 250);
    try { sessionStorage.removeItem(PENDING_ADD_KEY); } catch {}
    setInstalling(false);
    setAdding(false);
    if (ok) setAdded(true);
    // if not placed: reload will have happened already (the mount-effect takes over)
  }

  // Step 2 — place the already-installed widget onto the canvas.
  // Only shown after the widget is registered (pendingRegistration = false).
  async function handleAddToLayout() {
    if (!doneWidgetId || adding) return;
    const slug = doneWidgetId;
    setAdding(true);
    const ok = await placeWithRetry(slug, 12, 250);
    setAdding(false);
    if (ok) {
      setAdded(true);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          text: `couldn't place "${slug}" on the canvas — every region may be full. Try the Widget Manager, or reload the page.`,
        },
      ]);
    }
  }

  function restoreHiddenEditWidget() {
    const pending = hiddenEditRef.current;
    if (!pending) return;
    if (restorePlacementSnapshot(pending.slug, pending.snapshot)) {
      hiddenEditRef.current = null;
      setEditHidden(false);
    }
  }

  const isGenerating = phase.id === "connecting" || phase.id === "generating" || phase.id === "tsc";
  const isDoneOrError = phase.id === "done" || phase.id === "error";

  return (
    <div className="wc-chat">
      <StatusBar phase={phase} />

      <div className="wc-chat-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="wc-chat-empty">
            fill in the settings on the left, then describe your widget here
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return <div key={i} className="wc-msg wc-msg-user">{msg.text}</div>;
          }

          if (msg.role === "assistant") {
            return (
              <div key={i} className="wc-msg wc-msg-assistant">
                <pre className="wc-code">{msg.text}</pre>
                {msg.streaming && <span className="wc-cursor">▍</span>}
              </div>
            );
          }

          if (msg.role === "switch") {
            return (
              <div key={i} className="wc-msg wc-msg-switch">
                [switch] {msg.from} → {msg.to} · {msg.reason}
              </div>
            );
          }

          if (msg.role === "tsc_errors") {
            return (
              <div key={i} className="wc-msg wc-msg-tsc">
                <div className="wc-msg-tsc-head">[tsc errors — re-sending for self-repair]</div>
                {msg.errors.slice(0, 6).map((e, j) => (
                  <div key={j} className="wc-tsc-line">{e}</div>
                ))}
              </div>
            );
          }

          if (msg.role === "ok") {
            return <div key={i} className="wc-msg wc-msg-ok">{msg.text}</div>;
          }

          if (msg.role === "error") {
            return (
              <div key={i} className="wc-msg wc-msg-error">
                <span className="wc-msg-error-tag">[error]</span> {msg.text}
              </div>
            );
          }

          return null;
        })}

        {isGenerating && (
          <div className="wc-generating-hint">
            <span className="wc-dot-pulse" />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.2s" }} />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        )}
      </div>

      <div className="wc-chat-footer">
        {isDoneOrError && (
          <>
            <button type="button" className="wc-clear-btn" onClick={clearChat}>
              new
            </button>
            {doneWidgetId && !added && pendingRegistration && (
              <button
                type="button"
                className="wc-add-btn wc-install-btn"
                onClick={handleInstall}
                disabled={adding}
                title="compiles the widget into the registry — the page refreshes once, then 'Add to Layout' appears"
              >
                <Download size={11} strokeWidth={2} />
                {adding ? "installing..." : "install widget"}
              </button>
            )}
            {doneWidgetId && !added && !pendingRegistration && (
              <button
                type="button"
                className="wc-add-btn"
                onClick={handleAddToLayout}
                disabled={adding}
              >
                <PlusCircle size={11} strokeWidth={2} />
                {adding ? "adding..." : "add to layout"}
              </button>
            )}
            {added && (
              <span className="wc-added-hint">added ✓</span>
            )}
          </>
        )}
        {editHidden && !isGenerating && (
          <button type="button" className="wc-add-btn" onClick={restoreHiddenEditWidget}>
            <PlusCircle size={11} strokeWidth={2} />
            restore to canvas
          </button>
        )}
        <textarea
          className="wc-chat-input"
          placeholder={isGenerating ? "generating..." : "describe your widget... (shift+enter for newline)"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              generate();
            }
          }}
          rows={2}
          disabled={isGenerating}
        />
        <button
          type="button"
          className={`wc-send-btn${isGenerating ? " stop" : ""}`}
          onClick={isGenerating ? stop : generate}
          aria-label={isGenerating ? "stop" : "generate"}
          disabled={!isGenerating && !prompt.trim()}
        >
          {isGenerating ? <Square size={10} strokeWidth={2} fill="currentColor" /> : <Send size={12} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
