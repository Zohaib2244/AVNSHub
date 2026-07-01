"use client";

import { useRef, useState } from "react";
import { Hammer, Send, Square, Wand2 } from "lucide-react";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { clearSignal, emitWorking } from "@/lib/nutbotSignal";
import { useEffect } from "react";
import {
  updateProject,
  setWorkingProjectId,
  projectPlanSidKey,
  projectPlanMessagesKey,
  type WidgetBrief,
} from "@/lib/widget-creator/projectStore";

// Re-export so consumers that import from PlanCanvas keep working
export type { WidgetBrief };

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; streaming?: boolean }
  | { role: "error"; text: string };

function extractBrief(text: string): WidgetBrief | null {
  const match = text.match(/```widget-brief\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()) as WidgetBrief; } catch { return null; }
}

function stripBrief(text: string): string {
  return text.replace(/```widget-brief[\s\S]*?```/g, "").trim();
}

type Props = {
  projectId: string;
  activeHarness: HarnessId;
  onBuild: (brief: WidgetBrief) => void;
  onVisualize: (brief: WidgetBrief) => void;
};

export function PlanCanvas({ projectId, activeHarness, onBuild, onVisualize }: Props) {
  const sidKey  = projectPlanSidKey(projectId);
  const msgsKey = projectPlanMessagesKey(projectId);

  function loadSessionId(): string | null {
    if (typeof window === "undefined") return null;
    try { return sessionStorage.getItem(sidKey); } catch { return null; }
  }

  function loadMessages(): Message[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(msgsKey);
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch { return []; }
  }

  const [sessionId, setSessionId] = useState<string | null>(loadSessionId);
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeBrief, setActiveBrief] = useState<WidgetBrief | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdxRef = useRef(-1);

  // persist messages so they survive mode switches (PlanCanvas unmounts/remounts)
  useEffect(() => {
    try { localStorage.setItem(msgsKey, JSON.stringify(messages)); } catch {}
  }, [messages, msgsKey]);

  function scrollBottom() {
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    });
  }

  function clearChat() {
    if (isLoading) return;
    setMessages([]);
    setHistory([]);
    setActiveBrief(null);
    setSessionId(null);
    try { sessionStorage.removeItem(sidKey); } catch {}
    try { localStorage.removeItem(msgsKey); } catch {}
  }

  async function send() {
    if (!prompt.trim() || isLoading) return;
    const userText = prompt.trim();
    setPrompt("");
    setActiveBrief(null);
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setIsLoading(true);
    emitWorking();
    setWorkingProjectId(projectId);
    scrollBottom();

    const currentHistory = history;
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
            scrollBottom();
          } else if (frame.type === "done") {
            const data = (frame.data ?? {}) as Record<string, unknown>;
            const convId = (data.conversation_id as string | undefined) ?? null;
            if (convId) {
              setSessionId(convId);
              try { sessionStorage.setItem(sidKey, convId); } catch {}
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
              setActiveBrief(brief);
              updateProject(projectId, { hasBrief: true, brief, displayName: brief.title });
            }
            setHistory((prev) => [
              ...prev,
              { role: "user", text: userText },
              { role: "assistant", text: accText },
            ]);
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
          {isLoading ? `planning · ${activeHarness}` : "plan mode — describe a widget idea to get started"}
        </span>
      </div>

      <div className="wc-chat-body wc-plan-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="wc-chat-empty">
            describe an idea ("I want a widget that shows...") — get concept suggestions, then build or visualize from a brief
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

          if (msg.role === "error") {
            return (
              <div key={i} className="wc-msg wc-msg-error">
                <span className="wc-msg-error-tag">[error]</span> {msg.text}
              </div>
            );
          }

          return null;
        })}

        {activeBrief && !isLoading && (
          <div className="wc-brief-card">
            <div className="wc-brief-header">
              <span className="wc-brief-title">{activeBrief.title}</span>
              <div className="wc-brief-meta">
                {(activeBrief.sizes ?? []).map((s) => (
                  <span key={s} className="wc-brief-tag">{s}</span>
                ))}
                {activeBrief.slug && <span className="wc-brief-tag">#{activeBrief.slug}</span>}
              </div>
            </div>
            {activeBrief.concept && (
              <p className="wc-brief-concept">{activeBrief.concept}</p>
            )}
            <div className="wc-brief-actions">
              <button
                type="button"
                className="wc-brief-action-btn wc-brief-build-btn"
                onClick={() => onBuild(activeBrief)}
                title="pre-fill build settings and switch to build mode"
              >
                <Hammer size={10} strokeWidth={2} />
                build this
              </button>
              <button
                type="button"
                className="wc-brief-action-btn wc-brief-viz-btn"
                onClick={() => onVisualize(activeBrief)}
                title="generate HTML/CSS mockups from this concept"
              >
                <Wand2 size={10} strokeWidth={2} />
                visualize first
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="wc-generating-hint">
            <span className="wc-dot-pulse" />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.2s" }} />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        )}
      </div>

      <div className="wc-chat-footer">
        {messages.length > 0 && !isLoading && (
          <button type="button" className="wc-clear-btn" onClick={clearChat}>
            new
          </button>
        )}
        <textarea
          className="wc-chat-input"
          placeholder={isLoading ? "thinking..." : "describe a widget idea... (shift+enter for newline)"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          disabled={isLoading}
        />
        <button
          type="button"
          className={`wc-send-btn${isLoading ? " stop" : ""}`}
          onClick={isLoading ? stop : send}
          aria-label={isLoading ? "stop" : "send"}
          disabled={!isLoading && !prompt.trim()}
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
