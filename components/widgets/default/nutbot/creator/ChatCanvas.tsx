"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Square, PlusCircle } from "lucide-react";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { clearSignal, emitWidgetCreated, emitWorking } from "@/lib/nutbotSignal";
import { placeWidgetAuto } from "@/lib/slotLayout";

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
  activeHarness: HarnessId;
  harnessChain: HarnessId[];
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

const MESSAGES_KEY = "nutmag-creator-messages";

export function ChatCanvas({ settings, activeHarness, harnessChain }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem(MESSAGES_KEY);
        return saved ? (JSON.parse(saved) as Message[]) : [];
      } catch {}
    }
    return [];
  });
  const [prompt, setPrompt] = useState("");
  // restore done state from sessionStorage so HMR doesn't lose it
  const [doneWidgetId, setDoneWidgetId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("nutmag-creator-done") ?? null;
    }
    return null;
  });
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("nutmag-creator-done")) {
      return { id: "done" };
    }
    return { id: "idle" };
  });
  const [added, setAdded] = useState(false);
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

    const userText = prompt.trim();
    setPrompt("");

    // clear any prior run's result so retrying after done/error starts clean
    setDoneWidgetId(null);
    setAdded(false);
    try { sessionStorage.removeItem("nutmag-creator-done"); } catch {}

    assistantIdxRef.current = -1;
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setPhase({ id: "connecting", harness: activeHarness });
    emitWorking();

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
              setPhase({ id: "done" });
              setMessages((prev) => {
                const updated = [...prev];
                const idx = assistantIdxRef.current;
                if (idx >= 0 && updated[idx]?.role === "assistant") {
                  updated[idx] = { ...(updated[idx] as { role: "assistant"; text: string }), streaming: false };
                }
                return [...updated, { role: "ok", text: "[ok] widget written — click '+ add to layout' below" }];
              });
              clearSignal();
              if (slug) {
                setDoneWidgetId(slug);
                setAdded(false);
                emitWidgetCreated(slug);
                try { sessionStorage.setItem("nutmag-creator-done", slug); } catch {}
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
            setMessages((prev) => [...prev, { role: "tsc_errors", errors: payload.errors as string[] }]);
          } else if (event === "error") {
            clearSignal();
            fail(payload.message as string);
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
    try { sessionStorage.removeItem("nutmag-creator-done"); } catch {}
    try { sessionStorage.removeItem(MESSAGES_KEY); } catch {}
  }

  function handleAddToLayout() {
    if (!doneWidgetId) return;
    placeWidgetAuto(doneWidgetId);
    setAdded(true);
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
            {doneWidgetId && !added && (
              <button type="button" className="wc-add-btn" onClick={handleAddToLayout}>
                <PlusCircle size={11} strokeWidth={2} />
                add to layout
              </button>
            )}
            {added && (
              <span className="wc-added-hint">added ✓</span>
            )}
          </>
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
