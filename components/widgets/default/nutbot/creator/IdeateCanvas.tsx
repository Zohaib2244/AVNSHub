"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Square, RefreshCw, Hammer, Plus, Minus, Map, Maximize2 } from "lucide-react";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { clearSignal, emitWorking } from "@/lib/nutbotSignal";
import {
  updateProject,
  setWorkingProjectId,
  projectIdeateKey,
  loadProjectBlob,
  saveProjectBlob,
  removeProjectBlob,
  pullProjectBlob,
  type WidgetBrief,
} from "@/lib/widget-creator/projectStore";
import { MockupLightbox } from "./MockupLightbox";

type Variation = { index: number; file: string; html: string };
type Round = { prompt: string; variations: Variation[] };
type PendingRound = { prompt: string; files: string[]; variations: Array<Variation | null> };

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
  /** the project's Plan-mode brief, if any — shown as a "carried over from
      plan" indicator so the user knows what's feeding the first prompt */
  brief?: WidgetBrief;
  /** Ideate session id from the synced project record; also names the
      scratch directory holding generated mockups. */
  ideateSessionId?: string;
  readOnly?: boolean;
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

export function IdeateCanvas({ projectId, activeHarness, harnessChain, onFinalize, initialPrompt, brief, ideateSessionId, readOnly = false }: Props) {
  const roundsKey = projectIdeateKey(projectId);

  const sessionId = ideateSessionId ?? null;
  const [rounds, setRounds] = useState<Round[]>(() => loadProjectBlob<Round[]>(roundsKey) ?? []);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [count, setCount] = useState(3);
  const [phase, setPhase] = useState<Phase>({ id: "idle" });
  const [regeneratingFile, setRegeneratingFile] = useState<string | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [pendingRound, setPendingRound] = useState<PendingRound | null>(null);
  const [lightboxHtml, setLightboxHtml] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  function clearPendingPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // if this canvas is unmounted mid-generation (e.g. stage/canvas switch),
  // abort the request and clear this tab's working indicator
  useEffect(() => {
    return () => {
      clearPendingPoll();
      if (abortRef.current) {
        abortRef.current.abort();
        clearSignal();
        setWorkingProjectId(null);
      }
    };
  }, []);

  useEffect(() => {
    saveProjectBlob(roundsKey, rounds);
  }, [rounds, roundsKey]);

  useEffect(() => {
    if (ideateSessionId) return;
    const id = crypto.randomUUID();
    updateProject(projectId, { ideateSessionId: id });
  }, [ideateSessionId, projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await pullProjectBlob<Round[]>(roundsKey);
      if (cancelled || !remote || !Array.isArray(remote)) return;
      setRounds((current) => {
        if (current.length > remote.length) return current;
        if (JSON.stringify(current) === JSON.stringify(remote)) return current;
        return remote;
      });
    })();
    return () => { cancelled = true; };
  }, [roundsKey]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [rounds.length, pendingRound, phase]);

  const nextIndex = Math.max(0, ...rounds.flatMap((r) => r.variations.map((v) => v.index))) + 1;
  const isGenerating = phase.id === "connecting" || phase.id === "generating";

  /** Brief is substantive enough to start generation without a prompt — has
      concept + at least one size description, or explicit notes to work from. */
  function isBriefSubstantive(): boolean {
    if (!brief) return false;
    const hasContent = brief.concept || brief.sContent || brief.mContent || brief.lContent;
    return Boolean(hasContent || brief.notes);
  }

  async function fetchVariationHtml(file: string, activeSessionId = sessionId): Promise<string> {
    if (!activeSessionId) throw new Error("ideate session is not ready yet");
    const res = await fetch(`/api/widget-creator/ideate/file?session=${activeSessionId}&file=${encodeURIComponent(file)}`);
    if (!res.ok) throw new Error(`couldn't load ${file} (${res.status})`);
    return res.text();
  }

  async function fetchCompletedVariation(file: string, activeSessionId: string): Promise<Variation | null> {
    const res = await fetch(`/api/widget-creator/ideate/file?session=${activeSessionId}&file=${encodeURIComponent(file)}`);
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.trim().endsWith("</html>")) return null;
    const m = file.match(/variation-(\d+)\.html/);
    return { index: m ? Number(m[1]) : 0, file, html };
  }

  function startProgressPolling(promptText: string, files: string[], activeSessionId: string) {
    clearPendingPoll();
    setPendingRound({ prompt: promptText, files, variations: files.map(() => null) });

    const poll = async () => {
      const variations = await Promise.all(files.map((file) => fetchCompletedVariation(file, activeSessionId)));
      setPendingRound((current) => {
        if (!current || current.prompt !== promptText) return current;
        return {
          ...current,
          variations: current.variations.map((existing, index) => existing ?? variations[index]),
        };
      });
    };
    void poll();
    pollRef.current = setInterval(() => { void poll(); }, 2000);
  }

  async function generate() {
    if (isGenerating || readOnly) return;
    if (!sessionId) return;
    // Allow empty prompt if brief is substantial (from Plan); require it otherwise
    const hasPrompt = prompt.trim();
    if (!hasPrompt && !isBriefSubstantive()) return;
    const userPrompt = prompt.trim();
    const expectedFiles = Array.from({ length: count }, (_, i) => `variation-${nextIndex + i}.html`);
    setPrompt("");
    setPhase({ id: "connecting", harness: activeHarness });
    emitWorking();
    setWorkingProjectId(projectId);

    const abort = new AbortController();
    abortRef.current = abort;
    startProgressPolling(userPrompt, expectedFiles, sessionId);

    try {
      const result = await streamIdeate(
        { sessionId, prompt: userPrompt, count, startIndex: nextIndex, harness: activeHarness, harnessChain, brief },
        abort.signal,
        (_from, to) => setPhase({ id: "connecting", harness: to }),
        (harness) => setPhase({ id: "generating", harness }),
      );

      if (!result.ok) {
        clearPendingPoll();
        setPendingRound(null);
        clearSignal();
        setWorkingProjectId(null);
        setPhase({ id: "error", message: result.message });
        return;
      }

      const variations: Variation[] = await Promise.all(
        result.variations.map(async (file) => {
          const m = file.match(/variation-(\d+)\.html/);
          return { index: m ? Number(m[1]) : 0, file, html: await fetchVariationHtml(file, sessionId) };
        }),
      );

      setRounds((prev) => [...prev, { prompt: userPrompt, variations }]);
      updateProject(projectId, { hasIdeateRounds: true });
      clearPendingPoll();
      setPendingRound(null);
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
      clearPendingPoll();
      abortRef.current = null;
    }
  }

  async function regenerate(file: string, index: number) {
    if (!regenPrompt.trim() || isGenerating || readOnly) return;
    if (!sessionId) return;
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
        { sessionId, prompt: instruction, regenerateIndex: index, harness: activeHarness, harnessChain, brief },
        abort.signal,
        (_from, to) => setPhase({ id: "connecting", harness: to }),
        (harness) => setPhase({ id: "generating", harness }),
      );

      if (!result.ok) {
        clearPendingPoll();
        clearSignal();
        setWorkingProjectId(null);
        setPhase({ id: "error", message: result.message });
        return;
      }

      const html = await fetchVariationHtml(file, sessionId);
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
      clearPendingPoll();
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    clearPendingPoll();
    setPendingRound(null);
    clearSignal();
    setWorkingProjectId(null);
    setPhase({ id: "idle" });
  }

  function newSession() {
    if (isGenerating || readOnly) return;
    const oldSessionId = sessionId;
    if (oldSessionId) fetch(`/api/widget-creator/ideate/file?session=${oldSessionId}`, { method: "DELETE" }).catch(() => {});
    const id = crypto.randomUUID();
    updateProject(projectId, { ideateSessionId: id });
    removeProjectBlob(roundsKey);
    setRounds([]);
    setPendingRound(null);
    setPhase({ id: "idle" });
    setRegeneratingFile(null);
  }

  return (
    <div className="wc-chat">
      <StatusBar phase={phase} />

      {readOnly && (
        <div className="wc-readonly-banner">
          Ideate has been locked. You can review and expand mockups, but edits now happen in Build.
        </div>
      )}

      {brief && (
        <div className="wc-handoff-strip">
          <span className="wc-handoff-chip" title={brief.concept}>
            <Map size={9} strokeWidth={2} />
            <span className="wc-handoff-chip-label">carried over from plan: {brief.title}</span>
          </span>
        </div>
      )}

      <div className="wc-chat-body wc-ideate-body" ref={bodyRef}>
        {rounds.length === 0 && !isGenerating && (
          <div className="wc-chat-empty">
            describe a widget concept below and pick how many variations to brainstorm
          </div>
        )}

        {rounds.length === 0 && isGenerating && (
          <div className="wc-chat-empty wc-status-bar active">
            <span className="wc-status-dot" />
            <span className="wc-status-label">cooking up {count} variation{count > 1 ? "s" : ""}...</span>
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
                    {regeneratingFile === v.file && !readOnly ? (
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
                          onClick={() => setLightboxHtml(v.html)}
                          disabled={isGenerating}
                          title="expand this mockup"
                        >
                          <Maximize2 size={11} strokeWidth={2} />
                          expand
                        </button>
                        <button
                          type="button"
                          className="wc-ideate-action-btn"
                          onClick={() => { setRegeneratingFile(v.file); setRegenPrompt(""); }}
                          disabled={isGenerating || readOnly}
                          title="regenerate this variation"
                        >
                          <RefreshCw size={11} strokeWidth={2} />
                          regenerate
                        </button>
                        <button
                          type="button"
                          className="wc-ideate-action-btn wc-ideate-finalize-btn"
                          onClick={() => onFinalize(v.html)}
                          disabled={isGenerating || readOnly}
                          title="locks Ideate for edits and builds the real widget"
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

        {pendingRound && (
          <div className="wc-ideate-round">
            <div className="wc-msg wc-msg-user">{pendingRound.prompt}</div>
            <div className="wc-ideate-gallery">
              {pendingRound.files.map((file, index) => {
                const variation = pendingRound.variations[index];
                return (
                  <div key={file} className={`wc-ideate-card${variation ? "" : " pending"}`}>
                    <div className="wc-ideate-card-head">variation {variation?.index ?? index + nextIndex}</div>
                    {variation ? (
                      <iframe
                        className="wc-ideate-frame"
                        sandbox="allow-scripts"
                        srcDoc={variation.html}
                        title={`variation ${variation.index}`}
                      />
                    ) : (
                      <div className="wc-ideate-frame wc-ideate-frame-pending">
                        <span className="wc-dot-pulse" />
                        <span className="wc-dot-pulse" style={{ animationDelay: "0.2s" }} />
                        <span className="wc-dot-pulse" style={{ animationDelay: "0.4s" }} />
                      </div>
                    )}
                    <div className="wc-ideate-card-actions">
                      {variation ? (
                        <>
                          <button
                            type="button"
                            className="wc-ideate-action-btn"
                            onClick={() => setLightboxHtml(variation.html)}
                            title="expand this mockup"
                          >
                            <Maximize2 size={11} strokeWidth={2} />
                            expand
                          </button>
                          <button
                            type="button"
                            className="wc-ideate-action-btn wc-ideate-finalize-btn"
                            onClick={() => onFinalize(variation.html)}
                            disabled={readOnly}
                            title="finalize this design and build the real widget"
                          >
                            <Hammer size={11} strokeWidth={2} />
                            finalize → build
                          </button>
                        </>
                      ) : (
                        <span className="wc-ideate-pending-label">waiting for file</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="wc-generating-hint">
            <span className="wc-dot-pulse" />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.2s" }} />
            <span className="wc-dot-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        )}
      </div>
      {lightboxHtml && (
        <MockupLightbox html={lightboxHtml} title="ideate mockup preview" onClose={() => setLightboxHtml(null)} />
      )}

      <div className="wc-chat-footer wc-ideate-footer">
        {rounds.length > 0 && !isGenerating && !readOnly && (
          <button type="button" className="wc-clear-btn" onClick={newSession}>
            reset
          </button>
        )}
        <div className="wc-ideate-count">
          <button
            type="button"
            className="wc-ideate-count-btn"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            disabled={isGenerating || readOnly || count <= 1}
          >
            <Minus size={10} strokeWidth={2} />
          </button>
          <span className="wc-ideate-count-value">{count}</span>
          <button
            type="button"
            className="wc-ideate-count-btn"
            onClick={() => setCount((c) => Math.min(6, c + 1))}
            disabled={isGenerating || readOnly || count >= 6}
          >
            <Plus size={10} strokeWidth={2} />
          </button>
        </div>
        <textarea
          className="wc-chat-input"
          placeholder={
            readOnly ? "review only — continue in Build"
            : isGenerating ? "generating..."
            : brief ? "optional — add details or press send to use the plan... (shift+enter for newline)"
            : "describe the widget concept... (shift+enter for newline)"
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              generate();
            }
          }}
          rows={2}
          disabled={isGenerating || readOnly}
        />
        <button
          type="button"
          className={`wc-send-btn${isGenerating ? " stop" : ""}`}
          onClick={isGenerating ? stop : generate}
          aria-label={isGenerating ? "stop" : "generate"}
          disabled={readOnly || (!isGenerating && !prompt.trim() && !isBriefSubstantive())}
        >
          {isGenerating ? <Square size={10} strokeWidth={2} fill="currentColor" /> : <Send size={12} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
