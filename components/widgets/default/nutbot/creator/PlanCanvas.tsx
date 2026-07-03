"use client";

import { useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { clearSignal, emitWorking } from "@/lib/nutbotSignal";
import { useEffect } from "react";
import { useStickToBottom } from "@/lib/widget-creator/useStickToBottom";
import {
  updateProject,
  setWorkingProjectId,
  projectPlanMessagesKey,
  loadProjectBlob,
  saveProjectBlob,
  removeProjectBlob,
  pullProjectBlob,
  type WidgetBrief,
} from "@/lib/widget-creator/projectStore";

// Re-export so consumers that import from PlanCanvas keep working
export type { WidgetBrief };

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; streaming?: boolean }
  | { role: "brief"; brief: WidgetBrief }
  | { role: "error"; text: string };

const BRIEF_RE = /```widget-brief\s*\n([\s\S]*?)```/;

function extractBrief(text: string): WidgetBrief | null {
  const match = text.match(BRIEF_RE);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()) as WidgetBrief; } catch { return null; }
}

function hasBriefBlock(text: string): boolean {
  return BRIEF_RE.test(text);
}

function stripBrief(text: string): string {
  return extractBrief(text) ? text.replace(/```widget-brief[\s\S]*?```/g, "").trim() : text;
}

function historyFromMessages(messages: Message[]): Array<{ role: "user" | "assistant"; text: string }> {
  return messages.flatMap((msg) => (
    msg.role === "user" || msg.role === "assistant"
      ? [{ role: msg.role, text: msg.text }]
      : []
  ));
}

type Props = {
  projectId: string;
  activeHarness: HarnessId;
  /** CLI conversation id from the synced project record — server-machine
      scoped, so it survives remounts, tab closes, and device switches */
  planSessionId?: string;
  readOnly?: boolean;
};

export function PlanCanvas({ projectId, activeHarness, planSessionId, readOnly = false }: Props) {
  const msgsKey = projectPlanMessagesKey(projectId);

  const sessionId = planSessionId ?? null;
  const [messages, setMessages] = useState<Message[]>(() => loadProjectBlob<Message[]>(msgsKey) ?? []);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { ref: bodyRef, onScroll: onBodyScroll, scrollToBottom: scrollBottom } = useStickToBottom<HTMLDivElement>([messages]);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdxRef = useRef(-1);

  // persist messages so they survive mode switches (PlanCanvas unmounts/remounts)
  useEffect(() => {
    saveProjectBlob(msgsKey, messages);
  }, [messages, msgsKey]);

  // one-shot server pull so a transcript written from another device appears;
  // local wins while a send is in flight (we never adopt mid-generation)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await pullProjectBlob<Message[]>(msgsKey);
      if (cancelled || !remote || !Array.isArray(remote)) return;
      setMessages((current) => {
        if (current.length >= remote.length) return current;
        return remote;
      });
    })();
    return () => { cancelled = true; };
  }, [msgsKey]);

  function clearChat() {
    if (isLoading || readOnly) return;
    setMessages([]);
    updateProject(projectId, { planSessionId: undefined });
    removeProjectBlob(msgsKey);
  }

  async function send() {
    if (!prompt.trim() || isLoading || readOnly) return;
    const userText = prompt.trim();
    setPrompt("");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setIsLoading(true);
    emitWorking();
    setWorkingProjectId(projectId);
    scrollBottom(true);

    const currentHistory = historyFromMessages(messages);
    assistantIdxRef.current = -1;
    let accText = "";

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/widget-creator/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          sessionId,
          history: currentHistory,
          harness: activeHarness,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { role: "error", text: `server error ${res.status}` }]);
        setIsLoading(false);
        clearSignal();
        setWorkingProjectId(null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let frame: { type: string; data: unknown };
          try { frame = JSON.parse(line) as { type: string; data: unknown }; } catch { continue; }

          if (frame.type === "token") {
            const token = frame.data as string;
            accText += token;
            setMessages((prev) => {
              const idx = assistantIdxRef.current;
              if (idx === -1 || prev[idx]?.role !== "assistant") {
                assistantIdxRef.current = prev.length;
                return [...prev, { role: "assistant", text: token, streaming: true }];
              }
              const updated = [...prev];
              const msg = updated[idx] as { role: "assistant"; text: string; streaming?: boolean };
              updated[idx] = { ...msg, text: msg.text + token };
              return updated;
            });
          } else if (frame.type === "done") {
            const data = (frame.data ?? {}) as Record<string, unknown>;
            const convId = (data.conversation_id as string | undefined) ?? null;
            if (convId && convId !== sessionId) {
              updateProject(projectId, { planSessionId: convId });
            }
            setMessages((prev) => {
              const idx = assistantIdxRef.current;
              if (idx < 0) return prev;
              const updated = [...prev];
              const msg = updated[idx];
              if (msg?.role === "assistant") updated[idx] = { ...msg, streaming: false };
              return updated;
            });
            const brief = extractBrief(accText);
            if (brief) {
              setMessages((prev) => [...prev, { role: "brief", brief }]);
              updateProject(projectId, { hasBrief: true, brief, displayName: brief.title });
            } else if (hasBriefBlock(accText)) {
              setMessages((prev) => [...prev, { role: "error", text: "couldn't parse the widget brief JSON — the raw block is left above" }]);
            }
          } else if (frame.type === "error") {
            setMessages((prev) => [...prev, { role: "error", text: frame.data as string }]);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "error", text: (err as Error).message ?? "request failed" }]);
      }
    } finally {
      setIsLoading(false);
      clearSignal();
      setWorkingProjectId(null);
      abortRef.current = null;
      setMessages((prev) => {
        const idx = assistantIdxRef.current;
        if (idx < 0) return prev;
        const updated = [...prev];
        const msg = updated[idx];
        if (msg?.role === "assistant" && (msg as { streaming?: boolean }).streaming) {
          updated[idx] = { ...msg, streaming: false };
        }
        return updated;
      });
    }
  }

  function stop() {
    abortRef.current?.abort();
    setIsLoading(false);
    clearSignal();
    setWorkingProjectId(null);
  }

  return (
    <div className="wc-chat">
      <div className={`wc-status-bar${isLoading ? " active" : ""}`}>
        {isLoading && <span className="wc-status-dot" />}
        <span className="wc-status-label">
          {isLoading
            ? `planning · ${activeHarness}`
            : readOnly
              ? "plan mode — review only"
              : "plan mode — describe a widget idea to get started"}
        </span>
      </div>

      {readOnly && (
        <div className="wc-readonly-banner">
          Plan has been locked. You can review this transcript, but edits now happen in the current stage.
        </div>
      )}

      <div className="wc-chat-body wc-plan-body" ref={bodyRef} onScroll={onBodyScroll}>
        {messages.length === 0 && !isLoading && (
          <div className="wc-chat-empty">
            describe an idea (&ldquo;I want a widget that shows...&rdquo;) — get concept suggestions, then continue to ideate or build from a brief
          </div>
        )}

        {messages.length === 0 && isLoading && (
          <div className="wc-chat-empty wc-status-bar active">
            <span className="wc-status-dot" />
            <span className="wc-status-label">thinking...</span>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return <div key={i} className="wc-msg wc-msg-user">{msg.text}</div>;
          }

          if (msg.role === "assistant") {
            const displayText = stripBrief(msg.text);
            return (
              <div key={i} className="wc-msg wc-msg-assistant">
                <pre className="wc-code">{displayText}</pre>
                {msg.streaming && <span className="wc-cursor">▍</span>}
              </div>
            );
          }

          if (msg.role === "brief") {
            return (
              <div key={i} className="wc-msg wc-msg-ok">
                &ldquo;{msg.brief.title}&rdquo; plan updated — review it in the panel on the left.
              </div>
            );
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

        {isLoading && (
          <div className="wc-generating-hint">
            <span className="wc-dot-pulse" />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.2s" }} />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        )}
      </div>

      <div className="wc-chat-footer">
        {messages.length > 0 && !isLoading && !readOnly && (
          <button type="button" className="wc-clear-btn" onClick={clearChat}>
            reset
          </button>
        )}
        <textarea
          className="wc-chat-input"
          placeholder={readOnly ? "review only — continue in the current stage" : isLoading ? "thinking..." : "describe a widget idea... (shift+enter for newline)"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          disabled={isLoading || readOnly}
        />
        <button
          type="button"
          className={`wc-send-btn${isLoading ? " stop" : ""}`}
          onClick={isLoading ? stop : send}
          aria-label={isLoading ? "stop" : "send"}
          disabled={readOnly || (!isLoading && !prompt.trim())}
        >
          {isLoading
            ? <Square size={10} strokeWidth={2} fill="currentColor" />
            : <Send size={12} strokeWidth={2} />
          }
        </button>
      </div>
    </div>
  );
}
