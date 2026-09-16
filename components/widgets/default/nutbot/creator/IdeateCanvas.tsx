"use client";

import { confirmProviderSwitch } from "@/lib/widget-creator/confirmSwitch";

import { useEffect, useRef, useState } from "react";
import { Send, Square, RefreshCw, Hammer, Plus, Minus, Map, Maximize2 } from "lucide-react";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { clearSignal, emitWorking } from "@/lib/nutbotSignal";
import { randomId } from "@/lib/uuid";
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
import { useStickToBottom } from "@/lib/widget-creator/useStickToBottom";
import { MockupLightbox } from "./MockupLightbox";
import { ActivityLine, activityFromChunk, formatElapsed, useTicker } from "./RunProgress";

type Variation = { index: number; file: string; html: string };
type Round = { prompt: string; variations: Variation[] };
type PendingRound = { prompt: string; files: string[]; variations: Array<Variation | null> };

type Phase =
  | { id: "idle" }
  | { id: "connecting"; harness: HarnessId }
  | { id: "generating"; harness: HarnessId }
  | { id: "done" }
  | { id: "stopped"; kept: number }
  | { id: "error"; message: string };

type Props = {
  projectId: string;
  activeHarness: HarnessId;
  harnessChain: HarnessId[];
  onFinalize: (html: string) => void;
  /** Leave Ideate for Build without picking a mockup — available at any time
      after entering Ideate, and the only way forward when generation produced
      nothing. */
  onSkipToBuild: () => void;
  /** the project's Plan-mode brief, if any — the actual input to generation
      when the prompt box is left empty, and shown as a "carried over from
      plan" indicator */
  brief?: WidgetBrief;
  /** Ideate session id from the synced project record; also names the
      scratch directory holding generated mockups. */
  ideateSessionId?: string;
  readOnly?: boolean;
};

const PHASE_LABEL: Record<Phase["id"], string> = {
  idle: "ready",
  connecting: "connecting",
  generating: "drawing mockups",
  done: "done",
  stopped: "stopped",
  error: "error",
};

function StatusBar({ phase, progress, elapsed, regenerating }: {
  phase: Phase;
  /** the mockup being regenerated, e.g. "variation 2" — replaces the generic label */
  regenerating: string | null;
  /** mockups finished so far in the running round */
  progress: { ready: number; total: number } | null;
  /** elapsed (running) or last duration (finished), already formatted */
  elapsed: string | null;
}) {
  const isActive = phase.id === "connecting" || phase.id === "generating";
  const harness = (phase as { harness?: HarnessId }).harness;
  return (
    <div className={`wc-status-bar${phase.id === "error" ? " error" : phase.id === "done" ? " done" : isActive ? " active" : ""}`}>
      {isActive && <span className="wc-status-dot" />}
      <span className="wc-status-label">
        {phase.id === "generating" && regenerating ? `regenerating ${regenerating}` : PHASE_LABEL[phase.id]}
        {harness && ` · ${harness}`}
        {isActive && progress && ` · ${progress.ready}/${progress.total} ready`}
        {phase.id === "stopped" && (phase.kept ? ` · kept ${phase.kept} finished mockup${phase.kept > 1 ? "s" : ""}` : " · nothing finished yet")}
        {phase.id === "error" && ` · ${(phase as { message: string }).message}`}
      </span>
      {elapsed && <span className="wc-status-time">{elapsed}</span>}
    </div>
  );
}

async function streamIdeate(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onSwitch: (from: HarnessId, to: HarnessId, reason: string) => void,
  onHarnessStart: (harness: HarnessId) => void,
  /** harness output as it streams — used for the "what is it doing" line */
  onChunk?: (text: string) => void,
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
      } else if (event === "chunk") {
        onChunk?.(payload.text as string);
      } else if (event === "switch_required") {
        confirmProviderSwitch(payload, signal);
      } else if (event === "switch") {
        onSwitch(payload.from as HarnessId, payload.to as HarnessId, payload.reason as string);
      } else if (event === "error") {
        result = { ok: false, message: payload.message as string };
      }
    }
  }

  return result ?? { ok: false, message: "stream ended without a result" };
}

export function IdeateCanvas({ projectId, activeHarness, harnessChain, onFinalize, onSkipToBuild, brief, ideateSessionId, readOnly = false }: Props) {
  const roundsKey = projectIdeateKey(projectId);

  const sessionId = ideateSessionId ?? null;
  const [rounds, setRounds] = useState<Round[]>(() => loadProjectBlob<Round[]>(roundsKey) ?? []);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(3);
  const [phase, setPhase] = useState<Phase>({ id: "idle" });
  const [regeneratingFile, setRegeneratingFile] = useState<string | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [pendingRound, setPendingRound] = useState<PendingRound | null>(null);
  // run timing + live activity for the loaders
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // same value as startedAt, readable from the async run's finally block
  const startedAtRef = useRef<number | null>(null);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  // the mockup currently being regenerated (its card shows a spinner overlay)
  const [regenActiveFile, setRegenActiveFile] = useState<string | null>(null);
  const [lightboxHtml, setLightboxHtml] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { ref: bodyRef, onScroll: onBodyScroll } = useStickToBottom<HTMLDivElement>([rounds.length, pendingRound, phase]);

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
    const id = randomId();
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

  const nextIndex = Math.max(0, ...rounds.flatMap((r) => r.variations.map((v) => v.index))) + 1;
  const isGenerating = phase.id === "connecting" || phase.id === "generating";
  const now = useTicker(isGenerating);
  const pendingReady = pendingRound ? pendingRound.variations.filter(Boolean).length : 0;
  const statusElapsed = isGenerating && startedAt !== null
    ? formatElapsed(now - startedAt)
    : lastDuration !== null ? formatElapsed(lastDuration) : null;

  function beginRun(at: number) {
    startedAtRef.current = at;
    setStartedAt(at);
    setLastDuration(null);
    setActivity(null);
  }

  function endRun(at: number) {
    if (startedAtRef.current !== null) setLastDuration(at - startedAtRef.current);
    startedAtRef.current = null;
    setStartedAt(null);
    setActivity(null);
  }

  function onChunk(text: string) {
    const next = activityFromChunk(text);
    if (next) setActivity(next === "explaining the change" ? "describing the mockups" : next);
  }

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

  /** `requestedAt`: when the user asked — taken in the event handler */
  async function generate(requestedAt: number) {
    if (isGenerating || readOnly) return;
    if (!sessionId) return;
    // Allow empty prompt if brief is substantial (from Plan); require it otherwise
    const hasPrompt = prompt.trim();
    if (!hasPrompt && !isBriefSubstantive()) return;
    const userPrompt = prompt.trim();
    // Transcript label for the round — an empty prompt means "generate from
    // the carried-over plan", which should read as that, not as a blank bubble.
    const roundLabel = userPrompt || `from plan: ${brief?.title ?? "brief"}`;
    const expectedFiles = Array.from({ length: count }, (_, i) => `variation-${nextIndex + i}.html`);
    setPrompt("");
    setPhase({ id: "connecting", harness: activeHarness });
    beginRun(requestedAt);
    emitWorking();
    setWorkingProjectId(projectId);

    const abort = new AbortController();
    abortRef.current = abort;
    startProgressPolling(roundLabel, expectedFiles, sessionId);

    try {
      const result = await streamIdeate(
        { sessionId, prompt: userPrompt, count, startIndex: nextIndex, harness: activeHarness, harnessChain, brief },
        abort.signal,
        (_from, to) => setPhase({ id: "connecting", harness: to }),
        (harness) => setPhase({ id: "generating", harness }),
        onChunk,
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

      setRounds((prev) => [...prev, { prompt: roundLabel, variations }]);
      updateProject(projectId, { hasIdeateRounds: true });
      clearPendingPoll();
      setPendingRound(null);
      setPhase({ id: "done" });
      clearSignal();
      setWorkingProjectId(null);
    } catch (err) {
      clearSignal();
      setWorkingProjectId(null);
      // a user stop is recorded by stop() itself (with what was kept)
      if ((err as Error).name !== "AbortError") {
        setPhase({ id: "error", message: (err as Error).message ?? "request failed" });
      }
    } finally {
      clearPendingPoll();
      abortRef.current = null;
      setRegenActiveFile(null);
      endRun(Date.now());
    }
  }

  /** `requestedAt`: when the user asked — taken in the event handler */
  async function regenerate(file: string, index: number, requestedAt: number) {
    if (!regenPrompt.trim() || isGenerating || readOnly) return;
    if (!sessionId) return;
    const instruction = regenPrompt.trim();
    setRegenPrompt("");
    setRegeneratingFile(null);
    setRegenActiveFile(file);
    setPhase({ id: "connecting", harness: activeHarness });
    beginRun(requestedAt);
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
        onChunk,
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
      // a user stop is recorded by stop() itself (with what was kept)
      if ((err as Error).name !== "AbortError") {
        setPhase({ id: "error", message: (err as Error).message ?? "request failed" });
      }
    } finally {
      clearPendingPoll();
      abortRef.current = null;
      setRegenActiveFile(null);
      endRun(Date.now());
    }
  }

  function stop() {
    abortRef.current?.abort();
    clearPendingPoll();
    // mockups that already finished are real files — keep them as a round
    // instead of throwing them away with the rest of the stopped run
    const finished = (pendingRound?.variations ?? []).filter((v): v is Variation => v !== null);
    if (pendingRound && finished.length > 0) {
      const label = pendingRound.prompt;
      setRounds((prev) => [...prev, { prompt: label, variations: finished }]);
      updateProject(projectId, { hasIdeateRounds: true });
    }
    setPendingRound(null);
    clearSignal();
    setWorkingProjectId(null);
    setPhase({ id: "stopped", kept: finished.length });
  }

  function newSession() {
    if (isGenerating || readOnly) return;
    const oldSessionId = sessionId;
    if (oldSessionId) fetch(`/api/widget-creator/ideate/file?session=${oldSessionId}`, { method: "DELETE" }).catch(() => {});
    const id = randomId();
    updateProject(projectId, { ideateSessionId: id });
    removeProjectBlob(roundsKey);
    setRounds([]);
    setPendingRound(null);
    setPhase({ id: "idle" });
    setRegeneratingFile(null);
  }

  return (
    <div className="wc-chat">
      <StatusBar
        phase={phase}
        progress={pendingRound ? { ready: pendingReady, total: pendingRound.files.length } : null}
        elapsed={statusElapsed}
        regenerating={regenActiveFile ? regenActiveFile.replace(".html", "").replace("-", " ") : null}
      />

      {readOnly && (
        <div className="wc-readonly-banner">
          Ideate has been locked. You can review and expand mockups, but edits now happen in Build.
        </div>
      )}

      {(brief || !readOnly) && (
        <div className="wc-handoff-strip">
          {brief && (
            <span className="wc-handoff-chip" title={brief.concept}>
              <Map size={9} strokeWidth={2} />
              <span className="wc-handoff-chip-label">carried over from plan: {brief.title}</span>
            </span>
          )}
          {!readOnly && (
            <button
              type="button"
              className="wc-ideate-skip-btn"
              onClick={onSkipToBuild}
              disabled={isGenerating}
              title="go straight to Build without picking a mockup — the plan brief still carries over"
            >
              skip
              <Hammer size={9} strokeWidth={2} />
              build
            </button>
          )}
        </div>
      )}

      <div className="wc-chat-body wc-ideate-body" ref={bodyRef} onScroll={onBodyScroll}>
        {rounds.length === 0 && !isGenerating && (
          <div className="wc-chat-empty">
            {phase.id === "error" ? (
              <>
                nothing was generated. retry below with a different provider, or move on —
                Build works fine without a mockup, and your plan still carries over.
                {!readOnly && (
                  <button type="button" className="wc-ideate-skip-btn wc-ideate-skip-btn--inline" onClick={onSkipToBuild}>
                    skip
                    <Hammer size={9} strokeWidth={2} />
                    build
                  </button>
                )}
              </>
            ) : isBriefSubstantive()
              ? "your plan is carried over — just press send to generate mockups from it (the box below is only for extra notes)"
              : "describe a widget concept below and pick how many variations to brainstorm"}
          </div>
        )}


        {rounds.map((round, ri) => (
          <div key={ri} className="wc-ideate-round">
            <div className="wc-msg wc-msg-user">{round.prompt}</div>
            <div className="wc-ideate-gallery">
              {round.variations.map((v) => (
                <div key={v.file} className={`wc-ideate-card${regenActiveFile === v.file ? " regenerating" : ""}`}>
                  <div className="wc-ideate-card-head">variation {v.index}</div>
                  {regenActiveFile === v.file && (
                    <div className="wc-ideate-regen-overlay" role="status">
                      <span className="wc-spinner" aria-hidden="true" />
                      regenerating{statusElapsed ? ` · ${statusElapsed}` : ""}
                    </div>
                  )}
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
                            if (e.key === "Enter") regenerate(v.file, v.index, Date.now());
                            if (e.key === "Escape") setRegeneratingFile(null);
                          }}
                          disabled={isGenerating}
                        />
                        <button
                          type="button"
                          className="wc-add-btn"
                          onClick={() => regenerate(v.file, v.index, Date.now())}
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
                      <div className="wc-ideate-frame wc-ideate-frame-pending" role="status">
                        <span className="wc-spinner" aria-hidden="true" />
                        <span className="wc-ideate-pending-text">drawing variation {index + nextIndex}</span>
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
                        <span className="wc-ideate-pending-label">in progress{statusElapsed ? ` · ${statusElapsed}` : ""}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isGenerating && (
          <ActivityLine
            text={regenActiveFile
              ? `${activity ?? "starting"} · regenerating ${regenActiveFile.replace(".html", "")}`
              : `${activity ?? "starting"}${pendingRound ? ` · ${pendingReady} of ${pendingRound.files.length} ready` : ""}`}
          />
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
              generate(Date.now());
            }
          }}
          rows={2}
          disabled={isGenerating || readOnly}
        />
        <button
          type="button"
          className={`wc-send-btn${isGenerating ? " stop" : ""}`}
          onClick={isGenerating ? stop : () => generate(Date.now())}
          aria-label={isGenerating ? "stop" : "generate"}
          disabled={readOnly || (!isGenerating && !prompt.trim() && !isBriefSubstantive())}
        >
          {isGenerating ? <Square size={10} strokeWidth={2} fill="currentColor" /> : <Send size={12} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
