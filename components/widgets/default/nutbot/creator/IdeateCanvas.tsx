"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Square, RefreshCw, Hammer, Plus, Minus } from "lucide-react";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { clearSignal, emitWorking } from "@/lib/nutbotSignal";
import {
  updateProject,
  setWorkingProjectId,
  projectIdeateSidKey,
  projectIdeateKey,
} from "@/lib/widget-creator/projectStore";

type Variation = { index: number; file: string; html: string };
type Round = { prompt: string; variations: Variation[] };

type Phase =
  | { id: "idle" }
  | { id: "connecting"; harness: HarnessId }
  | { id: "generating"; harness: HarnessId }
  | { id: "done" }
  | { id: "error"; message: string };

type Props = {
  projectId: string;
  activeHarness: HarnessId;
  harnessChain: HarnessId[];
  onFinalize: (html: string) => void;
  initialPrompt?: string;
};

const PHASE_LABEL: Record<Phase["id"], string> = {
  idle: "ready",
  connecting: "connecting...",
  generating: "generating...",
  done: "done",
  error: "error",
};

function StatusBar({ phase }: { phase: Phase }) {
  const isActive = phase.id === "connecting" || phase.id === "generating";
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

async function streamIdeate(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onSwitch: (from: HarnessId, to: HarnessId, reason: string) => void,
  onHarnessStart: (harness: HarnessId) => void,
): Promise<{ ok: true; variations: string[] } | { ok: false; message: string }> {
  const res = await fetch("/api/widget-creator/ideate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    return { ok: false, message: `server error ${res.status} — the ideate request failed before streaming started` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let result: { ok: true; variations: string[] } | { ok: false; message: string } | null = null;

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
          onHarnessStart(payload.harness as HarnessId);
        } else if (type === "done") {
          result = { ok: true, variations: payload.variations as string[] };
        }
      } else if (event === "switch") {
        onSwitch(payload.from as HarnessId, payload.to as HarnessId, payload.reason as string);
      } else if (event === "error") {
        result = { ok: false, message: payload.message as string };
      }
    }
  }

  return result ?? { ok: false, message: "stream ended without a result" };
}

export function IdeateCanvas({ projectId, activeHarness, harnessChain, onFinalize, initialPrompt }: Props) {
  const sidKey    = projectIdeateSidKey(projectId);
  const roundsKey = projectIdeateKey(projectId);

  function loadSessionId(): string {
    if (typeof window === "undefined") return "";
    try {
      const existing = sessionStorage.getItem(sidKey);
      if (existing) return existing;
    } catch {}
    const id = crypto.randomUUID();
    try { sessionStorage.setItem(sidKey, id); } catch {}
    return id;
  }

  function loadRounds(): Round[] {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(roundsKey);
      return saved ? (JSON.parse(saved) as Round[]) : [];
    } catch {
      return [];
    }
  }

  const [sessionId, setSessionId] = useState(loadSessionId);
  const [rounds, setRounds] = useState<Round[]>(loadRounds);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [count, setCount] = useState(3);
  const [phase, setPhase] = useState<Phase>({ id: "idle" });
  const [regeneratingFile, setRegeneratingFile] = useState<string | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(roundsKey, JSON.stringify(rounds)); } catch {}
  }, [rounds, roundsKey]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [rounds.length, phase]);

  const nextIndex = Math.max(0, ...rounds.flatMap((r) => r.variations.map((v) => v.index))) + 1;
  const isGenerating = phase.id === "connecting" || phase.id === "generating";

  async function fetchVariationHtml(file: string): Promise<string> {
    const res = await fetch(`/api/widget-creator/ideate/file?session=${sessionId}&file=${encodeURIComponent(file)}`);
    if (!res.ok) throw new Error(`couldn't load ${file} (${res.status})`);
    return res.text();
  }

  async function generate() {
    if (!prompt.trim() || isGenerating) return;
    const userPrompt = prompt.trim();
    setPrompt("");
    setPhase({ id: "connecting", harness: activeHarness });
    emitWorking();
    setWorkingProjectId(projectId);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const result = await streamIdeate(
        { sessionId, prompt: userPrompt, count, startIndex: nextIndex, harness: activeHarness, harnessChain },
        abort.signal,
        (_from, to) => setPhase({ id: "connecting", harness: to }),
        (harness) => setPhase({ id: "generating", harness }),
      );

      if (!result.ok) {
        clearSignal();
        setWorkingProjectId(null);
        setPhase({ id: "error", message: result.message });
        return;
      }

      const variations: Variation[] = await Promise.all(
        result.variations.map(async (file) => {
          const m = file.match(/variation-(\d+)\.html/);
          return { index: m ? Number(m[1]) : 0, file, html: await fetchVariationHtml(file) };
        }),
      );

      setRounds((prev) => [...prev, { prompt: userPrompt, variations }]);
      updateProject(projectId, { hasIdeateRounds: true });
      setPhase({ id: "done" });
      clearSignal();
      setWorkingProjectId(null);
    } catch (err) {
      clearSignal();
      setWorkingProjectId(null);
      if ((err as Error).name === "AbortError") {
        setPhase({ id: "idle" });
      } else {
        setPhase({ id: "error", message: (err as Error).message ?? "request failed" });
      }
    } finally {
      abortRef.current = null;
    }
  }

  async function regenerate(file: string, index: number) {
    if (!regenPrompt.trim() || isGenerating) return;
    const instruction = regenPrompt.trim();
    setRegenPrompt("");
    setRegeneratingFile(null);
    setPhase({ id: "connecting", harness: activeHarness });
    emitWorking();
    setWorkingProjectId(projectId);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const result = await streamIdeate(
        { sessionId, prompt: instruction, regenerateIndex: index, harness: activeHarness, harnessChain },
        abort.signal,
        (_from, to) => setPhase({ id: "connecting", harness: to }),
        (harness) => setPhase({ id: "generating", harness }),
      );

      if (!result.ok) {
        clearSignal();
        setWorkingProjectId(null);
        setPhase({ id: "error", message: result.message });
        return;
      }

      const html = await fetchVariationHtml(file);
      setRounds((prev) =>
        prev.map((r) => ({
          ...r,
          variations: r.variations.map((v) => (v.file === file ? { ...v, html } : v)),
        })),
      );
      setPhase({ id: "done" });
      clearSignal();
      setWorkingProjectId(null);
    } catch (err) {
      clearSignal();
      setWorkingProjectId(null);
      if ((err as Error).name === "AbortError") {
        setPhase({ id: "idle" });
      } else {
        setPhase({ id: "error", message: (err as Error).message ?? "request failed" });
      }
    } finally {
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    clearSignal();
    setWorkingProjectId(null);
    setPhase({ id: "idle" });
  }

  function newSession() {
    if (isGenerating) return;
    const oldSessionId = sessionId;
    fetch(`/api/widget-creator/ideate/file?session=${oldSessionId}`, { method: "DELETE" }).catch(() => {});
    const id = crypto.randomUUID();
    try {
      sessionStorage.setItem(sidKey, id);
      localStorage.removeItem(roundsKey);
    } catch {}
    setSessionId(id);
    setRounds([]);
    setPhase({ id: "idle" });
    setRegeneratingFile(null);
  }

  return (
    <div className="wc-chat">
      <StatusBar phase={phase} />

      <div className="wc-chat-body wc-ideate-body" ref={bodyRef}>
        {rounds.length === 0 && (
          <div className="wc-chat-empty">
            describe a widget concept below and pick how many variations to brainstorm
          </div>
        )}

        {rounds.map((round, ri) => (
          <div key={ri} className="wc-ideate-round">
            <div className="wc-msg wc-msg-user">{round.prompt}</div>
            <div className="wc-ideate-gallery">
              {round.variations.map((v) => (
                <div key={v.file} className="wc-ideate-card">
                  <div className="wc-ideate-card-head">variation {v.index}</div>
                  <iframe
                    className="wc-ideate-frame"
                    sandbox="allow-scripts"
                    srcDoc={v.html}
                    title={`variation ${v.index}`}
                  />
                  <div className="wc-ideate-card-actions">
                    {regeneratingFile === v.file ? (
                      <div className="wc-ideate-regen-row">
                        <input
                          className="wc-input"
                          autoFocus
                          placeholder="what should change?"
                          value={regenPrompt}
                          onChange={(e) => setRegenPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") regenerate(v.file, v.index);
                            if (e.key === "Escape") setRegeneratingFile(null);
                          }}
                          disabled={isGenerating}
                        />
                        <button
                          type="button"
                          className="wc-add-btn"
                          onClick={() => regenerate(v.file, v.index)}
                          disabled={isGenerating || !regenPrompt.trim()}
                        >
                          go
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="wc-ideate-action-btn"
                          onClick={() => { setRegeneratingFile(v.file); setRegenPrompt(""); }}
                          disabled={isGenerating}
                          title="regenerate this variation"
                        >
                          <RefreshCw size={11} strokeWidth={2} />
                          regenerate
                        </button>
                        <button
                          type="button"
                          className="wc-ideate-action-btn wc-ideate-finalize-btn"
                          onClick={() => onFinalize(v.html)}
                          disabled={isGenerating}
                          title="finalize this design and build the real widget"
                        >
                          <Hammer size={11} strokeWidth={2} />
                          finalize → build
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="wc-generating-hint">
            <span className="wc-dot-pulse" />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.2s" }} />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        )}
      </div>

      <div className="wc-chat-footer wc-ideate-footer">
        {rounds.length > 0 && !isGenerating && (
          <button type="button" className="wc-clear-btn" onClick={newSession}>
            new
          </button>
        )}
        <div className="wc-ideate-count">
          <button
            type="button"
            className="wc-ideate-count-btn"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            disabled={isGenerating || count <= 1}
          >
            <Minus size={10} strokeWidth={2} />
          </button>
          <span className="wc-ideate-count-value">{count}</span>
          <button
            type="button"
            className="wc-ideate-count-btn"
            onClick={() => setCount((c) => Math.min(6, c + 1))}
            disabled={isGenerating || count >= 6}
          >
            <Plus size={10} strokeWidth={2} />
          </button>
        </div>
        <textarea
          className="wc-chat-input"
          placeholder={isGenerating ? "generating..." : "describe the widget concept... (shift+enter for newline)"}
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
