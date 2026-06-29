"use client";

import "./NutBotChat.css";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, RotateCcw, Send, Square } from "lucide-react";
import { NutBotFaceV2 } from "@/components/widgets/default/nutbot/NutBotFaceV2";
import { clearSignal, emitThinking, emitSpeaking, emitBrowsing, emitError } from "@/lib/nutbotSignal";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs, type ChatBackend } from "@/lib/prefs";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; streaming?: boolean }
  | { role: "status"; text: string }
  | { role: "error"; text: string };

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
const HARNESS_IDS: HarnessId[] = ["claude", "codex", "opencode"];

function readSession(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function isHarnessId(value: unknown): value is HarnessId {
  return typeof value === "string" && value in HARNESS_ADAPTERS;
}

function readStoredBackend(): ConcreteBackend | null {
  const stored = readSession(CONV_BACKEND_KEY);
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
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [backendState, setBackendState] = useState<BackendState>(
    prefs.chatBackend === "off" ? { kind: "disabled" } : { kind: "checking", label: "checking backend" },
  );
  const [backendMenuOpen, setBackendMenuOpen] = useState(false);
  const [harnessStatuses, setHarnessStatuses] = useState<HarnessStatus[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => readSession(CONV_KEY));
  const [conversationBackend, setConversationBackend] = useState<ConcreteBackend | null>(() => readStoredBackend());
  const [nsfw, setNsfw] = useState(() => readSession(NSFW_KEY) === "true");
  const [searchEnabled, setSearchEnabled] = useState(() => readSession(SEARCH_KEY) !== "false");

  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdxRef = useRef(-1);
  const hydratedConvRef = useRef<string | null>(null);
  const backendMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending, backendState.kind]);

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
      if (conversationId) {
        sessionStorage.setItem(CONV_KEY, conversationId);
        if (conversationBackend) sessionStorage.setItem(CONV_BACKEND_KEY, conversationBackend);
      } else {
        sessionStorage.removeItem(CONV_KEY);
        sessionStorage.removeItem(CONV_BACKEND_KEY);
      }
    } catch {}
  }, [conversationId, conversationBackend]);

  useEffect(() => {
    if (!backendMenuOpen) return;
    function handler(e: MouseEvent) {
      if (backendMenuRef.current && !backendMenuRef.current.contains(e.target as Node)) {
        setBackendMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [backendMenuOpen]);

  useEffect(() => {
    if (!backendMenuOpen || harnessStatuses.length > 0) return;
    fetch("/api/widget-creator/harnesses")
      .then((res) => res.json())
      .then((data: HarnessStatus[]) => setHarnessStatuses(data))
      .catch(() => {});
  }, [backendMenuOpen, harnessStatuses.length]);

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
      const storedBackend = readStoredBackend();
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
  }, [prefs.chatBackend, prefs.harnessChain]);

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
        clearSignal();
      }
    } else if (frame.type === "token") {
      if (!gotTokenRef.current) {
        gotTokenRef.current = true;
        emitSpeaking();
      }
      const text = String(frame.data ?? "");
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
    const userText = prompt.trim();
    const history = backend === "bonfire"
      ? undefined
      : messages.flatMap((msg) => (
          msg.role === "user" || msg.role === "assistant" ? [{ role: msg.role, text: msg.text }] : []
        )).slice(-8);
    setPrompt("");
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
    setBackendMenuOpen(false);
  }

  const backendButtonLabel =
    prefs.chatBackend === "auto" && backendState.kind === "ready" && backendState.autoFallback
      ? `auto > ${backendLabel(backendState.backend)}`
      : backendLabel(prefs.chatBackend);
  const inputDisabled = sending || backendState.kind !== "ready";
  const placeholder =
    backendState.kind === "disabled"
      ? "chat is turned off"
      : backendState.kind === "offline"
        ? "NutBot's backend is offline..."
        : sending
          ? "thinking..."
          : "talk to NutBot... (shift+enter for newline)";

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
              {backendState.autoFallback
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
        <div className="hp-root nb-backend-picker" ref={backendMenuRef}>
          <button
            type="button"
            className={`hp-pill${backendMenuOpen ? " open" : ""}`}
            onClick={() => setBackendMenuOpen((open) => !open)}
            aria-label="select chat backend"
          >
            <span className={`hp-dot${backendState.kind === "offline" || backendState.kind === "disabled" ? " unavailable" : ""}`} />
            chat {backendButtonLabel}
            <ChevronDown size={9} strokeWidth={2} className={backendMenuOpen ? "hp-chevron open" : "hp-chevron"} />
          </button>

          {backendMenuOpen && (
            <div className="hp-popover">
              <div className="hp-popover-head">chat backend</div>
              <button
                type="button"
                className={`hp-item hp-item-button${prefs.chatBackend === "auto" ? " active" : ""}`}
                onClick={() => chooseBackend("auto")}
              >
                <span className="hp-dot" />
                <span className="hp-item-label">auto</span>
                {prefs.chatBackend === "auto" && <span className="hp-badge active">active</span>}
              </button>
              <button
                type="button"
                className={`hp-item hp-item-button${prefs.chatBackend === "bonfire" ? " active" : ""}`}
                onClick={() => chooseBackend("bonfire")}
              >
                <span className="hp-dot" />
                <span className="hp-item-label">bonfire</span>
                {prefs.chatBackend === "bonfire" && <span className="hp-badge active">active</span>}
              </button>
              {HARNESS_IDS.map((id) => {
                const status = harnessStatuses.find((s) => s.id === id);
                const unavailable = status?.available === false;
                return (
                  <button
                    type="button"
                    key={id}
                    className={`hp-item hp-item-button${prefs.chatBackend === id ? " active" : ""}${unavailable ? " unavailable" : ""}`}
                    onClick={() => chooseBackend(id)}
                    title={unavailable ? "not found on PATH" : undefined}
                  >
                    <span className={`hp-dot${unavailable ? " unavailable" : ""}`} />
                    <span className="hp-item-label">{HARNESS_ADAPTERS[id]?.label ?? id}</span>
                    {unavailable && <span className="hp-badge">not installed</span>}
                    {prefs.chatBackend === id && <span className="hp-badge active">active</span>}
                  </button>
                );
              })}
              <button
                type="button"
                className={`hp-item hp-item-button${prefs.chatBackend === "off" ? " active" : ""}`}
                onClick={() => chooseBackend("off")}
              >
                <span className="hp-dot unavailable" />
                <span className="hp-item-label">off</span>
                {prefs.chatBackend === "off" && <span className="hp-badge active">active</span>}
              </button>
            </div>
          )}
        </div>

        {bonfireActive && (
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
          className="nb-chat-input"
          placeholder={placeholder}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
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
