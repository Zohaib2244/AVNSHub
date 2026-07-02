"use client";

import { useEffect, useRef, useState } from "react";
import { Download, PlusCircle, Send, Square, Map, Wand2, ChevronDown, ChevronUp } from "lucide-react";
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
import {
  updateProject,
  setWorkingProjectId,
  projectMessagesKey,
  projectBuildSidKey,
  projectDoneKey,
  type WidgetBrief,
  type ProjectMode,
} from "@/lib/widget-creator/projectStore";

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
  | { role: "audit"; files: string[] }
  | { role: "ok"; text: string }
  | { role: "error"; text: string };

type Props = {
  projectId: string;
  settings: GenerateSettings;
  onSettingsChange: (patch: Partial<GenerateSettings>) => void;
  activeHarness: HarnessId;
  harnessChain: HarnessId[];
  initialPrompt?: string;
  /** the project's Plan-mode brief, if any — shown as a "carried over from
      plan" indicator, and folded into the widget's SPEC.md on generate */
  brief?: WidgetBrief;
  /** which pipeline stage this project started from — recorded in SPEC.md */
  entryMode?: ProjectMode;
};

const PHASE_LABEL: Record<Phase["id"], string> = {
  idle: "ready",
  connecting: "connecting...",
  generating: "generating...",
  tsc: "checking types...",
  done: "done",
  error: "error",
};

// Pending-add key is global (not per-project) since only one install can be
// in flight at a time. Includes projectId in the value so the mount effect
// only fires for the matching project.
const PENDING_ADD_KEY = "nutmag-creator-pending-add";

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

function validateSettings(settings: GenerateSettings): string | null {
  if (settings.editSlug) return null;
  const slug = (settings.slug ?? "").trim();
  if (!slug) return "enter a widget name or slug in the settings panel before generating — registration needs an id";
  if (!isValidSlug(slug)) return `invalid slug "${slug}" — use only lowercase letters, numbers, and hyphens`;
  return null;
}

type DoneRecord = { slug: string; registered: boolean };

export function ChatCanvas({ projectId, settings, onSettingsChange, activeHarness, harnessChain, initialPrompt, brief, entryMode }: Props) {
  const [showMockupPreview, setShowMockupPreview] = useState(false);
  const MESSAGES_KEY  = projectMessagesKey(projectId);
  const SESSION_KEY   = projectBuildSidKey(projectId);
  const DONE_KEY_PROJ = projectDoneKey(projectId);

  function readDoneRecord(): DoneRecord | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(DONE_KEY_PROJ);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<DoneRecord>;
      return typeof parsed.slug === "string" ? { slug: parsed.slug, registered: Boolean(parsed.registered) } : null;
    } catch { return null; }
  }

  function writeDoneRecord(record: DoneRecord | null) {
    try {
      if (record) sessionStorage.setItem(DONE_KEY_PROJ, JSON.stringify(record));
      else sessionStorage.removeItem(DONE_KEY_PROJ);
    } catch {}
  }

  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(MESSAGES_KEY);
        return saved ? (JSON.parse(saved) as Message[]) : [];
      } catch {}
    }
    return [];
  });

  const [creatorSessionId, setCreatorSessionId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try { return sessionStorage.getItem(SESSION_KEY); } catch {}
    }
    return null;
  });

  const sessionForSlugRef = useRef<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [doneWidgetId, setDoneWidgetId] = useState<string | null>(() => readDoneRecord()?.slug ?? null);
  const [pendingRegistration, setPendingRegistration] = useState(() => {
    const done = readDoneRecord();
    return done ? !done.registered : false;
  });
  const [phase, setPhase] = useState<Phase>(() => (readDoneRecord() ? { id: "done" } : { id: "idle" }));
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editHidden, setEditHidden] = useState(false);
  const hiddenEditRef = useRef<{ slug: string; snapshot: PlacementSnapshot } | null>(null);
  const { setInstalling } = useLayout();
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdxRef = useRef(-1);

  function fail(message: string) {
    clearSignal();
    setWorkingProjectId(null);
    setPhase({ id: "error", message });
    setMessages((prev) => [...prev, { role: "error", text: message }]);
  }

  // if this canvas is unmounted mid-generation (e.g. canvas switch), abort and clear the lock
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        clearSignal();
        setWorkingProjectId(null);
      }
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, phase]);

  useEffect(() => {
    try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages)); } catch {}
  }, [messages, MESSAGES_KEY]);

  async function generate() {
    const inFlight = phase.id === "connecting" || phase.id === "generating" || phase.id === "tsc";
    if (!prompt.trim() || inFlight) return;

    const validationError = validateSettings(settings);
    if (validationError) {
      fail(validationError);
      return;
    }

    const userText = prompt.trim();
    setPrompt("");

    const attemptedSlug = (settings.editSlug || settings.slug || "").trim() || null;
    let hadTscErrors = false;

    setDoneWidgetId(null);
    setAdded(false);
    setPendingRegistration(false);
    writeDoneRecord(null);

    const currentTarget = (settings.editSlug || settings.slug || "").trim() || null;
    if (creatorSessionId && sessionForSlugRef.current !== currentTarget) {
      setCreatorSessionId(null);
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    }

    assistantIdxRef.current = -1;
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setPhase({ id: "connecting", harness: activeHarness });
    emitWorking();
    setWorkingProjectId(projectId);

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
          sessionId: creatorSessionId ?? undefined,
          projectMeta: { concept: brief?.concept, entryMode },
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
              const registered = Boolean(payload.registered);
              const newSessionId = (payload.sessionId as string | null) ?? null;
              if (newSessionId) {
                setCreatorSessionId(newSessionId);
                sessionForSlugRef.current = slug;
                try { sessionStorage.setItem(SESSION_KEY, newSessionId); } catch {}
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
              setWorkingProjectId(null);

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
                // promote project to Created in the store
                updateProject(projectId, {
                  hasBuildOutput: true,
                  slug,
                  displayName: settings.name ?? slug,
                });
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
          } else if (event === "audit") {
            setMessages((prev) => [...prev, { role: "audit", files: payload.unexpectedFiles as string[] }]);
          } else if (event === "error") {
            clearSignal();
            setWorkingProjectId(null);
            fail(payload.message as string);
            if (hadTscErrors && attemptedSlug) {
              onSettingsChange({ editSlug: attemptedSlug });
              setMessages((prev) => [
                ...prev,
                { role: "ok", text: `[info] switched to edit mode for "${attemptedSlug}" — describe the fix and resubmit` },
              ]);
            }
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
      setWorkingProjectId(null);
      if ((err as Error).name === "AbortError") {
        setPhase({ id: "idle" });
      } else {
        fail((err as Error).message ?? "request failed");
      }
    } finally {
      abortRef.current = null;
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
    }
  }

  function stop() {
    abortRef.current?.abort();
    clearSignal();
    setWorkingProjectId(null);
    setPhase({ id: "idle" });
  }

  function clearChat() {
    if (phase.id !== "idle" && phase.id !== "done" && phase.id !== "error") return;
    setMessages([]);
    setPhase({ id: "idle" });
    setDoneWidgetId(null);
    setAdded(false);
    setPendingRegistration(false);
    onSettingsChange({ editSlug: undefined, slug: undefined, name: undefined });
    writeDoneRecord(null);
    setCreatorSessionId(null);
    sessionForSlugRef.current = null;
    try { sessionStorage.removeItem(PENDING_ADD_KEY); } catch {}
    try { localStorage.removeItem(MESSAGES_KEY); } catch {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }

  async function placeWithRetry(slug: string, attempts: number, delayMs: number): Promise<boolean> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (getPlacementSnapshot(slug).kind !== "none" || placeWidgetAuto(slug)) return true;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  useEffect(() => {
    let pendingRaw: string | null = null;
    try { pendingRaw = sessionStorage.getItem(PENDING_ADD_KEY); } catch {}
    if (!pendingRaw) return;

    let pendingData: { slug: string; projectId: string } | null = null;
    try { pendingData = JSON.parse(pendingRaw) as { slug: string; projectId: string }; } catch {}
    // only process if this is the project that triggered the install
    if (!pendingData || pendingData.projectId !== projectId) return;

    setAdding(true);
    let cancelled = false;
    const slug = pendingData.slug;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInstall() {
    if (!doneWidgetId || adding) return;
    const slug = doneWidgetId;
    setAdding(true);
    setInstalling(true);
    try { sessionStorage.setItem(PENDING_ADD_KEY, JSON.stringify({ slug, projectId })); } catch {}
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
    const ok = await placeWithRetry(slug, 8, 250);
    try { sessionStorage.removeItem(PENDING_ADD_KEY); } catch {}
    setInstalling(false);
    setAdding(false);
    if (ok) setAdded(true);
  }

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

      {(brief || settings.designReferenceHtml) && (
        <div className="wc-handoff-strip">
          {brief && (
            <span className="wc-handoff-chip" title={brief.concept}>
              <Map size={9} strokeWidth={2} />
              <span className="wc-handoff-chip-label">carried over from plan: {brief.title}</span>
            </span>
          )}
          {settings.designReferenceHtml && (
            <button
              type="button"
              className="wc-handoff-chip interactive"
              onClick={() => setShowMockupPreview((v) => !v)}
              title="the finalized Ideate-mode mockup being sent as the build reference"
            >
              <Wand2 size={9} strokeWidth={2} />
              <span className="wc-handoff-chip-label">mockup reference attached</span>
              {showMockupPreview ? <ChevronUp size={9} strokeWidth={2} /> : <ChevronDown size={9} strokeWidth={2} />}
            </button>
          )}
        </div>
      )}

      {showMockupPreview && settings.designReferenceHtml && (
        <div className="wc-handoff-preview">
          <iframe
            className="wc-handoff-preview-frame"
            sandbox="allow-scripts"
            srcDoc={settings.designReferenceHtml}
            title="finalized mockup reference"
          />
        </div>
      )}

      <div className="wc-chat-body" ref={bodyRef}>
        {messages.length === 0 && !isGenerating && (
          <div className="wc-chat-empty">
            fill in the settings on the left, then describe your widget here
          </div>
        )}

        {messages.length === 0 && isGenerating && (
          <div className="wc-chat-empty wc-status-bar active">
            <span className="wc-status-dot" />
            <span className="wc-status-label">writing the widget...</span>
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
          if (msg.role === "audit") {
            return (
              <div key={i} className="wc-msg wc-msg-audit">
                <div className="wc-msg-audit-head">[write audit] the run touched files outside the widget&apos;s own folders — review before trusting this build:</div>
                {msg.files.map((f, j) => (
                  <div key={j} className="wc-audit-line">{f}</div>
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
            {added && <span className="wc-added-hint">added ✓</span>}
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
