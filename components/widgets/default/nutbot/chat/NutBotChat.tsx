"use client";

import "./NutBotChat.css";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw, Send, Square } from "lucide-react";
import { NutBotFaceV2 } from "@/components/widgets/default/nutbot/NutBotFaceV2";
import { clearSignal, emitThinking, emitSpeaking, emitBrowsing, emitError } from "@/lib/nutbotSignal";
import { pulseSpeech, resetSpeech } from "@/lib/nutbotSense";
import { showHubDialog } from "@/lib/hubDialog";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs, type ChatBackend } from "@/lib/prefs";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; streaming?: boolean }
  | { role: "tool"; name: string; detail: string }
  | { role: "status"; text: string }
  | { role: "error"; text: string };

/** chill = the original persona chat; work = a CLI agent with a real shell on
    the host for maintenance/troubleshooting. Each mode keeps its own
    conversation, so switching never resumes the other mode's session. */
type ChatMode = "chill" | "work";

type ConcreteBackend = "bonfire" | HarnessId;
type HarnessStatus = { id: HarnessId; label: string; available: boolean };

type BackendState =
  | { kind: "disabled" }
  | { kind: "checking"; label: string }
  | { kind: "ready"; backend: ConcreteBackend; autoFallback?: boolean }
  | { kind: "offline"; message: string; backend?: ConcreteBackend };

const CONV_KEY = "nutmag-nutbot-conv";
const CONV_BACKEND_KEY = "nutmag-nutbot-conv-backend";
const NSFW_KEY = "nutmag-nutbot-nsfw";
const SEARCH_KEY = "nutmag-nutbot-search";
const HISTORY_KEY = "nutmag-nutbot-history";
const MODE_KEY = "nutmag-nutbot-mode";
/** how many sent prompts the up-arrow recall keeps, oldest dropped first */
const HISTORY_LIMIT = 100;

// chill keeps the original keys so existing sessions survive the upgrade
function modeKey(base: string, mode: ChatMode) {
  return mode === "work" ? `${base}-work` : base;
}

// Switching modes remounts the pane (key={mode}); harness transcripts are not
// stored server-side for hydration, so the other mode's messages wait here
const messageStash: Record<ChatMode, ChatMessage[]> = { chill: [], work: [] };

function readSession(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function readHistory(): string[] {
  const raw = readSession(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function isHarnessId(value: unknown): value is HarnessId {
  return typeof value === "string" && value in HARNESS_ADAPTERS;
}

function readStoredBackend(mode: ChatMode): ConcreteBackend | null {
  const stored = readSession(modeKey(CONV_BACKEND_KEY, mode));
  return stored === "bonfire" || isHarnessId(stored) ? stored : null;
}

function backendLabel(backend: ChatBackend | ConcreteBackend) {
  if (backend === "auto") return "auto";
  if (backend === "off") return "off";
  if (backend === "bonfire") return "bonfire";
  return HARNESS_ADAPTERS[backend]?.label ?? backend;
}

function availability(statuses: HarnessStatus[], id: HarnessId) {
  return statuses.find((status) => status.id === id)?.available === true;
}

export function NutBotChat() {
  const [mode, setMode] = useState<ChatMode>(() => (readSession(MODE_KEY) === "work" ? "work" : "chill"));

  useEffect(() => {
    try {
      sessionStorage.setItem(MODE_KEY, mode);
    } catch {}
  }, [mode]);

  return <ChatPane key={mode} mode={mode} onModeChange={setMode} />;
}

function ChatPane({ mode, onModeChange }: { mode: ChatMode; onModeChange: (mode: ChatMode) => void }) {
  const work = mode === "work";
  const convKey = modeKey(CONV_KEY, mode);
  const convBackendKey = modeKey(CONV_BACKEND_KEY, mode);
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [messages, setMessages] = useState<ChatMessage[]>(() => messageStash[mode]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [backendState, setBackendState] = useState<BackendState>(
    prefs.chatBackend === "off" ? { kind: "disabled" } : { kind: "checking", label: "checking backend" },
  );
  const [harnessStatuses, setHarnessStatuses] = useState<HarnessStatus[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => readSession(convKey));
  const [conversationBackend, setConversationBackend] = useState<ConcreteBackend | null>(() => readStoredBackend(mode));
  const [nsfw, setNsfw] = useState(() => readSession(NSFW_KEY) === "true");
  const [searchEnabled, setSearchEnabled] = useState(() => readSession(SEARCH_KEY) !== "false");
  // CLI-style prompt recall. `history` is newest-last and deliberately NOT
  // cleared by "new chat" — a shell keeps its history across commands, and the
  // whole point is getting a prompt back after you've moved on. `historyIdx`
  // is -1 while composing normally and otherwise indexes back from the end;
  // `draftRef` stashes whatever was typed before the first Up so Down can
  // return it, exactly like readline.
  const [history, setHistory] = useState<string[]>(() => readHistory());
  const [historyIdx, setHistoryIdx] = useState(-1);
  const draftRef = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const approvedAutoBackend = useRef<ConcreteBackend | null>(null);
  const assistantIdxRef = useRef(-1);
  const hydratedConvRef = useRef<string | null>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending, backendState.kind]);

  useEffect(() => {
    messageStash[mode] = messages;
  }, [mode, messages]);

  useEffect(() => {
    try {
      sessionStorage.setItem(NSFW_KEY, String(nsfw));
    } catch {}
  }, [nsfw]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SEARCH_KEY, String(searchEnabled));
    } catch {}
  }, [searchEnabled]);

  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // sessionStorage can throw (private mode / blocked site data) — recall
      // just won't survive a remount, which is not worth breaking chat over
    }
  }, [history]);

  useEffect(() => {
    try {
      if (conversationId) {
        sessionStorage.setItem(convKey, conversationId);
        if (conversationBackend) sessionStorage.setItem(convBackendKey, conversationBackend);
      } else {
        sessionStorage.removeItem(convKey);
        sessionStorage.removeItem(convBackendKey);
      }
    } catch {}
  }, [conversationId, conversationBackend, convKey, convBackendKey]);


  useEffect(() => {
    if (prefs.chatBackend === "off") {
      abortRef.current?.abort();
      setSending(false);
      clearSignal();
      setBackendState({ kind: "disabled" });
      return;
    }

    let cancelled = false;
    const abort = new AbortController();

    async function loadHarnessStatuses() {
      const res = await fetch("/api/widget-creator/harnesses", { signal: abort.signal });
      if (!res.ok) throw new Error(`harness check failed (${res.status})`);
      const data = (await res.json()) as HarnessStatus[];
      if (!cancelled) setHarnessStatuses(data);
      return data;
    }

    async function probeBonfire(hydrate: boolean) {
      const storedConv = readSession(CONV_KEY);
      const storedBackend = readStoredBackend("chill");
      const canHydrate = Boolean(storedConv && (!storedBackend || storedBackend === "bonfire"));
      const url = hydrate && canHydrate && storedConv
        ? `/api/nutbot-chat?conversationId=${encodeURIComponent(storedConv)}`
        : "/api/nutbot-chat";
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok) return false;

      if (hydrate && canHydrate && storedConv && hydratedConvRef.current !== storedConv) {
        const data = (await res.json().catch(() => ({}))) as { messages?: Array<{ role: string; content: string }> };
        if (Array.isArray(data.messages)) {
          const hydrated = data.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m): ChatMessage => ({ role: m.role as "user" | "assistant", text: m.content }));
          if (!cancelled && hydrated.length) setMessages(hydrated);
        }
        if (!cancelled) {
          hydratedConvRef.current = storedConv;
          setConversationId(storedConv);
          setConversationBackend("bonfire");
        }
      }
      return true;
    }

    async function resolveBackend() {
      try {
        // work mode needs tools, so Bonfire is never a candidate: a pinned
        // harness is used as-is, auto/bonfire walk the harness chain. The
        // user picked work mode deliberately, so no auto-fallback confirm.
        if (work && !isHarnessId(prefs.chatBackend)) {
          setBackendState({ kind: "checking", label: "checking cli harnesses" });
          const statuses = await loadHarnessStatuses();
          if (cancelled) return;
          const chosen = prefs.harnessChain.find((id) => availability(statuses, id));
          setBackendState(
            chosen
              ? { kind: "ready", backend: chosen }
              : { kind: "offline", message: "work mode needs a cli harness (claude/codex/opencode) and none was found" },
          );
          return;
        }

        if (prefs.chatBackend === "bonfire") {
          setBackendState({ kind: "checking", label: "checking bonfire" });
          const ok = await probeBonfire(true);
          if (cancelled) return;
          setBackendState(
            ok
              ? { kind: "ready", backend: "bonfire" }
              : { kind: "offline", backend: "bonfire", message: "bonfire is not reachable" },
          );
          return;
        }

        if (isHarnessId(prefs.chatBackend)) {
          setBackendState({ kind: "checking", label: `checking ${backendLabel(prefs.chatBackend)}` });
          const statuses = await loadHarnessStatuses();
          if (cancelled) return;
          const available = availability(statuses, prefs.chatBackend);
          setBackendState(
            available
              ? { kind: "ready", backend: prefs.chatBackend }
              : {
                  kind: "offline",
                  backend: prefs.chatBackend,
                  message: `${backendLabel(prefs.chatBackend)} is not installed or not on PATH`,
                },
          );
          return;
        }

        setBackendState({ kind: "checking", label: "checking bonfire" });
        const bonfireOk = await probeBonfire(true);
        if (cancelled) return;
        if (bonfireOk) {
          setBackendState({ kind: "ready", backend: "bonfire" });
          return;
        }

        setBackendState({ kind: "checking", label: "checking cli harnesses" });
        const statuses = await loadHarnessStatuses();
        if (cancelled) return;
        const chosen = prefs.harnessChain.find((id) => availability(statuses, id));
        setBackendState(
          chosen
            ? { kind: "ready", backend: chosen, autoFallback: true }
            : { kind: "offline", message: "bonfire is offline and no cli harness was found" },
        );
      } catch (error) {
        if (cancelled || (error as Error).name === "AbortError") return;
        setBackendState({ kind: "offline", message: (error as Error).message ?? "backend check failed" });
      }
    }

    resolveBackend();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [prefs.chatBackend, prefs.harnessChain, work]);

  const resolvedBackend = backendState.kind === "ready" ? backendState.backend : null;
  const bonfireActive = resolvedBackend === "bonfire";

  function finalizeStreaming() {
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

  function conversationForBackend(backend: ConcreteBackend) {
    if (!conversationId) return null;
    if (!conversationBackend && backend === "bonfire") return conversationId;
    return conversationBackend === backend ? conversationId : null;
  }

  function processFrame(frame: { type?: string; data?: unknown }, backend: ConcreteBackend, gotTokenRef: { current: boolean }) {
    if (frame.type === "conversation" || frame.type === "done") {
      const d = frame.data as { conversation_id?: string } | undefined;
      if (d?.conversation_id) {
        setConversationId(d.conversation_id);
        setConversationBackend(backend);
      }
      if (frame.type === "done") {
        finalizeStreaming();
        resetSpeech();
        clearSignal();
      }
    } else if (frame.type === "token") {
      if (!gotTokenRef.current) {
        gotTokenRef.current = true;
        emitSpeaking();
      }
      const text = String(frame.data ?? "");
      // feeds NutBot's mouth — a non-reactive channel on purpose, a render per
      // token would be a render per frame
      pulseSpeech(text.length);
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
    } else if (frame.type === "tool") {
      emitBrowsing();
      const d = (frame.data ?? {}) as { name?: string; detail?: string };
      // close the current prose bubble so text after the tool call starts a
      // new one below it instead of growing the bubble above. Done inside the
      // updater: the token updater assigns assistantIdxRef when it runs, so a
      // reset outside would be undone by a still-queued token update
      setMessages((prev) => {
        const updated = [...prev];
        const idx = assistantIdxRef.current;
        const msg = updated[idx];
        if (msg?.role === "assistant" && msg.streaming) updated[idx] = { ...msg, streaming: false };
        assistantIdxRef.current = -1;
        return [...updated, { role: "tool", name: String(d.name ?? "tool"), detail: String(d.detail ?? "") }];
      });
    } else if (frame.type === "status") {
      emitBrowsing();
      setMessages((prev) => [...prev, { role: "status", text: `[info] ${String(frame.data ?? "")}` }]);
    } else if (frame.type === "search_results") {
      emitBrowsing();
      const n = Array.isArray(frame.data) ? frame.data.length : 0;
      setMessages((prev) => [...prev, { role: "status", text: `[info] found ${n} result${n === 1 ? "" : "s"}` }]);
    } else if (frame.type === "page_read") {
      emitBrowsing();
    } else if (frame.type === "error") {
      emitError(String(frame.data ?? "something broke"));
      setMessages((prev) => [...prev, { role: "error", text: String(frame.data ?? "something broke") }]);
    }
  }

  async function send() {
    if (!prompt.trim() || sending || !resolvedBackend) return;

    const backend = resolvedBackend;
    if (backendState.kind === "ready" && backendState.autoFallback && approvedAutoBackend.current !== backend) {
      showHubDialog({ title: `Use ${backendLabel(backend)} for chat?`, body: "Bonfire is unavailable. Continuing uses your CLI subscription. Cancel keeps your message unsent.", confirmLabel: "use this provider", onConfirm: () => { approvedAutoBackend.current = backend; void send(); } });
      return;
    }
    const userText = prompt.trim();
    const history = backend === "bonfire"
      ? undefined
      : messages.flatMap((msg) => (
          msg.role === "user" || msg.role === "assistant" ? [{ role: msg.role, text: msg.text }] : []
        )).slice(-8);
    setPrompt("");
    // consecutive duplicates collapse, like a shell ignoring a repeated command
    setHistory((prev) => (prev[prev.length - 1] === userText
      ? prev
      : [...prev, userText].slice(-HISTORY_LIMIT)));
    setHistoryIdx(-1);
    draftRef.current = "";
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setSending(true);
    emitThinking();
    assistantIdxRef.current = -1;
    const gotTokenRef = { current: false };

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/nutbot-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend,
          mode,
          message: userText,
          conversationId: conversationForBackend(backend),
          nsfw: bonfireActive ? nsfw : false,
          searchEnabled: bonfireActive ? searchEnabled : false,
          history,
        }),
        signal: abort.signal,
      });

      if (res.status === 503) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        const message = `${backendLabel(backend)} is not reachable${data.error ? ` (${data.error})` : ""}`;
        setBackendState({ kind: "offline", backend, message });
        setMessages((prev) => [...prev, { role: "error", text: `NutBot's ${backendLabel(backend)} backend is offline: ${message}.` }]);
        clearSignal();
        return;
      }
      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { role: "error", text: `server error ${res.status}` }]);
        clearSignal();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            processFrame(JSON.parse(line), backend, gotTokenRef);
          } catch {}
        }
      }

      if (buffer.trim()) {
        try {
          processFrame(JSON.parse(buffer), backend, gotTokenRef);
        } catch {}
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "error", text: (err as Error).message ?? "request failed" }]);
      }
      clearSignal();
    } finally {
      setSending(false);
      abortRef.current = null;
      finalizeStreaming();
    }
  }

  /** Up/Down walk `history` newest-first. Returns false when there is nothing
      to move to, so the caller can let the key do its normal caret thing. */
  function recall(direction: -1 | 1): boolean {
    if (history.length === 0) return false;

    if (direction === -1) {
      const next = historyIdx < 0 ? 0 : historyIdx + 1;
      if (next >= history.length) return false; // already at the oldest
      if (historyIdx < 0) draftRef.current = prompt; // stash the live draft once
      setHistoryIdx(next);
      setPrompt(history[history.length - 1 - next]);
      return true;
    }

    if (historyIdx < 0) return false; // not in recall mode
    const next = historyIdx - 1;
    setHistoryIdx(next);
    // stepping past the newest entry restores whatever was being typed
    setPrompt(next < 0 ? draftRef.current : history[history.length - 1 - next]);
    return true;
  }

  /** Recall only when the caret is on the edge line the key would leave, so
      Up/Down still navigate normally inside a multi-line draft — same rule a
      terminal uses. Requires a collapsed selection. */
  function shouldRecall(el: HTMLTextAreaElement, direction: -1 | 1): boolean {
    if (el.selectionStart !== el.selectionEnd) return false;
    return direction === -1
      ? !el.value.slice(0, el.selectionStart).includes("\n")
      : !el.value.slice(el.selectionEnd).includes("\n");
  }

  function stop() {
    abortRef.current?.abort();
    clearSignal();
    setSending(false);
  }

  function newChat() {
    if (sending) return;
    setMessages([]);
    setConversationId(null);
    setConversationBackend(null);
    clearSignal();
  }

  function chooseBackend(backend: ChatBackend) {
    if (backend === "off") {
      abortRef.current?.abort();
      setSending(false);
      clearSignal();
    }
    setPrefs({ chatBackend: backend });
  }

  const inputDisabled = sending || backendState.kind !== "ready";
  const placeholder =
    backendState.kind === "disabled"
      ? "chat is turned off"
      : backendState.kind === "offline"
        ? "NutBot's backend is offline..."
        : sending
          ? work ? "working..." : "thinking..."
          : work
            ? "what's broken, bro?"
            : "talk to NutBot...";

  return (
    <div className="nb-chat">
      <div className="nb-chat-top">
        <div className="nb-chat-face">
          <div className="nutbot-v2-scale nutbot-v2-scale-chat">
            <NutBotFaceV2 />
          </div>
        </div>

        <div className="nb-chat-body" ref={bodyRef}>
          {messages.length === 0 && backendState.kind === "ready" && (
            <div className="nb-chat-empty">
              {work
                ? `work mode: ${backendLabel(backendState.backend)} has a real shell on this box. it looks around freely and asks before changing anything.`
                : backendState.autoFallback
                  ? `bonfire is offline; chatting through ${backendLabel(backendState.backend)}`
                  : "say something, bro"}
            </div>
          )}
          {messages.length === 0 && backendState.kind === "checking" && (
            <div className="nb-chat-empty">[checking] {backendState.label}</div>
          )}
          {messages.length === 0 && backendState.kind === "offline" && (
            <div className="nb-chat-offline">[offline] {backendState.message}</div>
          )}
          {messages.length === 0 && backendState.kind === "disabled" && (
            <div className="nb-chat-disabled">
              <span>chat is turned off</span>
              <button type="button" className="nb-inline-btn" onClick={() => chooseBackend("auto")}>
                turn on
              </button>
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return <div key={i} className="nb-msg nb-msg-user">{msg.text}</div>;
            }
            if (msg.role === "assistant") {
              return (
                <div key={i} className="nb-msg nb-msg-assistant">
                  {msg.text}
                  {msg.streaming && <span className="nb-cursor">|</span>}
                </div>
              );
            }
            if (msg.role === "tool") {
              const shell = msg.name === "Bash" || msg.name === "bash";
              return (
                <div key={i} className="nb-msg nb-msg-tool" title={msg.detail || msg.name}>
                  <span className="nb-tool-name">{shell ? "$" : msg.name}</span> {msg.detail}
                </div>
              );
            }
            if (msg.role === "status") {
              return <div key={i} className="nb-msg nb-msg-status">{msg.text}</div>;
            }
            return (
              <div key={i} className="nb-msg nb-msg-error">
                <span className="nb-msg-error-tag">[error]</span> {msg.text}
              </div>
            );
          })}

          {sending && (
            <div className="nb-generating-hint">
              <span className="nb-dot-pulse" />
              <span className="nb-dot-pulse" style={{ animationDelay: "0.2s" }} />
              <span className="nb-dot-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
          )}
        </div>
      </div>

      <div className="nb-chat-toolbar">
        <div className="nb-mode-switch" role="group" aria-label="chat mode">
          {(["chill", "work"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`nb-toggle-btn${mode === m ? " active" : ""}`}
              aria-pressed={mode === m}
              // a mid-stream switch would unmount the pane with the request
              // still writing into it
              disabled={sending}
              onClick={() => onModeChange(m)}
            >
              {m}
            </button>
          ))}
        </div>

        {!work && bonfireActive && (
          <>
            <button
              type="button"
              className={`nb-toggle-btn${nsfw ? " active" : ""}`}
              onClick={() => setNsfw((v) => !v)}
            >
              nsfw
            </button>
            <button
              type="button"
              className={`nb-toggle-btn${searchEnabled ? " active" : ""}`}
              onClick={() => setSearchEnabled((v) => !v)}
            >
              search
            </button>
          </>
        )}

        <button type="button" className="nb-new-btn" onClick={newChat} disabled={sending}>
          <RotateCcw size={10} strokeWidth={2} />
          new chat
        </button>
      </div>

      <div className="nb-chat-footer">
        <textarea
          ref={inputRef}
          className="nb-chat-input"
          placeholder={placeholder}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            // typing over a recalled prompt drops out of recall, so the next
            // Down doesn't clobber the edit with a stale history entry
            if (historyIdx !== -1) setHistoryIdx(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
              return;
            }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              const direction = e.key === "ArrowUp" ? -1 : 1;
              const el = e.currentTarget;
              if (!shouldRecall(el, direction) || !recall(direction)) return;
              e.preventDefault();
              // a recalled prompt lands with the caret at the end, ready to
              // edit or re-send — setPrompt hasn't painted yet, so defer
              requestAnimationFrame(() => {
                const end = inputRef.current?.value.length ?? 0;
                inputRef.current?.setSelectionRange(end, end);
              });
            }
          }}
          rows={1}
          disabled={inputDisabled}
        />
        <button
          type="button"
          className={`nb-send-btn${sending ? " stop" : ""}`}
          onClick={sending ? stop : send}
          aria-label={sending ? "stop" : "send"}
          disabled={!sending && (!prompt.trim() || backendState.kind !== "ready")}
        >
          {sending ? <Square size={10} strokeWidth={2} fill="currentColor" /> : <Send size={12} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
