"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Maximize2, Paperclip, PlusCircle, Send, Square, Map, Wand2, ChevronDown, ChevronUp, X } from "lucide-react";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { clearSignal, emitWidgetCreated, emitWorking } from "@/lib/nutbotSignal";
import {
  placeWidgetAuto,
  unplaceWidgetTemporarily,
  restorePlacementSnapshot,
  getPlacementSnapshot,
  getRegionsThatFitWidget,
  type PlacementSnapshot,
} from "@/lib/slotLayout";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { getManifest } from "@/config/widgets";
import { isValidSlug } from "@/lib/widget-creator/slug";
import { useStickToBottom } from "@/lib/widget-creator/useStickToBottom";
import {
  updateProject,
  setWorkingProjectId,
  CREATOR_RESTORE_PROJECT_KEY,
  projectMessagesKey,
  loadProjectBlob,
  saveProjectBlob,
  removeProjectBlob,
  pullProjectBlob,
  type WidgetBrief,
  type ProjectMode,
} from "@/lib/widget-creator/projectStore";
import { MockupLightbox } from "./MockupLightbox";
import { renderMessageText } from "./ToolChipLine";

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
  | { role: "sibling_read"; paths: string[] }
  | { role: "ok"; text: string }
  | { role: "error"; text: string }
  | { role: "action"; text: string; action: "reload" | "open-widget-manager" | "sync-skills" };

type DoneRecord = { slug: string; registered: boolean };

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
  /** Build-mode CLI session from the synced project record, tagged with the
      target slug it belongs to so remounts can resume safely. */
  buildSession?: { id: string; forSlug: string | null };
  /** Finished-but-not-fully-installed build state from the project record. */
  pendingInstall?: DoneRecord;
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

function StatusBar({ phase, modeLabel }: { phase: Phase; modeLabel: string }) {
  const isActive = phase.id === "connecting" || phase.id === "generating" || phase.id === "tsc";
  const harness = (phase as { harness?: HarnessId }).harness;
  const label = phase.id === "idle" || phase.id === "done" ? `${modeLabel} mode · ${PHASE_LABEL[phase.id]}` : PHASE_LABEL[phase.id];
  return (
    <div className={`wc-status-bar${phase.id === "error" ? " error" : phase.id === "done" ? " done" : isActive ? " active" : ""}`}>
      {isActive && <span className="wc-status-dot" />}
      <span className="wc-status-label">
        {label}
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

export function ChatCanvas({
  projectId,
  settings,
  onSettingsChange,
  activeHarness,
  harnessChain,
  initialPrompt,
  brief,
  entryMode,
  buildSession,
  pendingInstall,
}: Props) {
  const [showMockupPreview, setShowMockupPreview] = useState(false);
  const [lightboxHtml, setLightboxHtml] = useState<string | null>(null);
  const MESSAGES_KEY  = projectMessagesKey(projectId);
  const pendingInstallSlug = pendingInstall?.slug ?? null;
  const pendingInstallRegistered = pendingInstall?.registered ?? false;

  const [messages, setMessages] = useState<Message[]>(() => loadProjectBlob<Message[]>(MESSAGES_KEY) ?? []);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [doneWidgetId, setDoneWidgetId] = useState<string | null>(() => pendingInstallSlug);
  const [pendingRegistration, setPendingRegistration] = useState(() => Boolean(pendingInstallSlug && !pendingInstallRegistered));
  const [phase, setPhase] = useState<Phase>(() => (pendingInstallSlug ? { id: "done" } : { id: "idle" }));
  // If the pending-install widget is already placed on the canvas (e.g. the
  // page reloaded after install+placement, or the user placed it from Widget
  // Manager), start in the "added ✓" state instead of offering a redundant
  // "add to layout" button for a widget that's already on screen.
  const [added, setAdded] = useState(() =>
    Boolean(pendingInstallSlug && getPlacementSnapshot(pendingInstallSlug).kind !== "none"),
  );
  const [adding, setAdding] = useState(false);
  const [editHidden, setEditHidden] = useState(false);
  const hiddenEditRef = useRef<{ slug: string; snapshot: PlacementSnapshot } | null>(null);
  const { setInstalling, setHubCoreTab } = useLayout();
  const { ref: bodyRef, onScroll: onBodyScroll } = useStickToBottom<HTMLDivElement>([messages, phase]);
  // Chat image attachments (data URLs) for the next send — screenshots and
  // design references the harness views via its Read tool. Not persisted.
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdxRef = useRef(-1);
  const hasDesignReference = Boolean(settings.designReferenceHtml);
  const isEditMode = Boolean(settings.editSlug);
  const modeLabel = isEditMode ? "edit" : "build";

  function fail(message: string) {
    clearSignal();
    setWorkingProjectId(null);
    setPhase({ id: "error", message });
    setMessages((prev) => [...prev, { role: "error", text: message }]);
  }

  function placementFailureMessage(slug: string): Message {
    const manifest = getManifest(slug);
    if (!manifest) {
      return {
        role: "action",
        action: "reload",
        text: `"${slug}" was installed, but it is not in the loaded registry yet.`,
      };
    }

    if (getRegionsThatFitWidget(slug).length === 0) {
      return {
        role: "action",
        action: "open-widget-manager",
        text: `"${manifest.title}" is installed, but no canvas region has room for it.`,
      };
    }

    return {
      role: "error",
      text: `couldn't place "${slug}" automatically. Try add to layout again, or reload the page if the registry just changed.`,
    };
  }

  function reportPlacementFailure(slug: string) {
    setMessages((prev) => [...prev, placementFailureMessage(slug)]);
  }

  async function runMessageAction(action: "reload" | "open-widget-manager" | "sync-skills") {
    if (action === "reload") {
      window.location.reload();
    } else if (action === "open-widget-manager") {
      setHubCoreTab("widgets");
    } else if (action === "sync-skills") {
      try {
        const res = await fetch("/api/widget-creator/sync-skills", { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        setMessages((prev) => [
          ...prev,
          body.ok
            ? { role: "ok", text: "[ok] skills regenerated. resubmit your prompt." }
            : { role: "error", text: body.error ?? `skill regeneration failed (${res.status})` },
        ]);
      } catch (error) {
        setMessages((prev) => [...prev, { role: "error", text: `skill regeneration failed: ${(error as Error).message}` }]);
      }
    }
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
    saveProjectBlob(MESSAGES_KEY, messages);
  }, [messages, MESSAGES_KEY]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await pullProjectBlob<Message[]>(MESSAGES_KEY);
      if (cancelled || !remote || !Array.isArray(remote)) return;
      setMessages((current) => {
        if (current.length > remote.length) return current;
        if (JSON.stringify(current) === JSON.stringify(remote)) return current;
        return remote;
      });
    })();
    return () => { cancelled = true; };
  }, [MESSAGES_KEY]);

  useEffect(() => {
    setDoneWidgetId(pendingInstallSlug);
    setPendingRegistration(Boolean(pendingInstallSlug && !pendingInstallRegistered));
    setPhase((current) => {
      if (pendingInstallSlug && current.id === "idle") return { id: "done" };
      if (!pendingInstallSlug && current.id === "done") return { id: "idle" };
      return current;
    });
  }, [pendingInstallSlug, pendingInstallRegistered]);

  const MAX_ATTACHED_IMAGES = 4;

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_ATTACHED_IMAGES - attachedImages.length;
    for (const file of Array.from(files).slice(0, Math.max(0, remaining))) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl === "string") {
          setAttachedImages((prev) => prev.length >= MAX_ATTACHED_IMAGES ? prev : [...prev, dataUrl]);
        }
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function generate() {
    const inFlight = phase.id === "connecting" || phase.id === "generating" || phase.id === "tsc";
    const promptText = prompt.trim();
    if ((!promptText && !hasDesignReference) || inFlight) return;

    const validationError = validateSettings(settings);
    if (validationError) {
      fail(validationError);
      return;
    }

    const imagesForRequest = attachedImages;
    const userText = (promptText || "(build from the finalized design reference)")
      + (imagesForRequest.length ? `  [+${imagesForRequest.length} image${imagesForRequest.length > 1 ? "s" : ""}]` : "");
    setPrompt("");
    setAttachedImages([]);

    const attemptedSlug = (settings.editSlug || settings.slug || "").trim() || null;
    let hadTscErrors = false;

    setDoneWidgetId(null);
    setAdded(false);
    setPendingRegistration(false);
    updateProject(projectId, { pendingInstall: undefined });

    const currentTarget = (settings.editSlug || settings.slug || "").trim() || null;
    const sessionForRequest = buildSession && buildSession.forSlug === currentTarget ? buildSession.id : null;
    if (buildSession && buildSession.forSlug !== currentTarget) {
      updateProject(projectId, { buildSession: undefined });
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
          prompt: promptText,
          harness: activeHarness,
          harnessChain,
          sessionId: sessionForRequest ?? undefined,
          projectMeta: { concept: brief?.concept, entryMode },
          images: imagesForRequest.length ? imagesForRequest : undefined,
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
                updateProject(projectId, { buildSession: { id: newSessionId, forSlug: slug } });
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
                updateProject(projectId, { pendingInstall: { slug, registered } });
                // promote project to Created in the store
                updateProject(projectId, {
                  hasBuildOutput: true,
                  slug,
                  displayName: settings.name ?? slug,
                  activeMode: "build",
                  workflowMode: "build",
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
          } else if (event === "sibling_read") {
            // fires mid-stream, potentially several times in one run — collapse
            // into a single running message instead of one bubble per read
            const path = payload.path as string;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "sibling_read") {
                if (last.paths.includes(path)) return prev;
                return [...prev.slice(0, -1), { role: "sibling_read", paths: [...last.paths, path] }];
              }
              return [...prev, { role: "sibling_read", paths: [path] }];
            });
          } else if (event === "error") {
            clearSignal();
            setWorkingProjectId(null);
            if (payload.code === "skill-missing") {
              const message = payload.message as string;
              setPhase({ id: "error", message });
              setMessages((prev) => [...prev, { role: "action", action: "sync-skills", text: message }]);
            } else {
              fail(payload.message as string);
            }
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
    const keepInstall = doneWidgetId
      ? { slug: doneWidgetId, registered: !pendingRegistration }
      : pendingInstall;
    setMessages([]);
    setPhase(keepInstall ? { id: "done" } : { id: "idle" });
    setDoneWidgetId(keepInstall?.slug ?? null);
    setAdded((current) => keepInstall ? current : false);
    setPendingRegistration(Boolean(keepInstall && !keepInstall.registered));
    updateProject(projectId, keepInstall ? { pendingInstall: keepInstall, buildSession: undefined } : { pendingInstall: undefined, buildSession: undefined });
    if (!keepInstall) {
      try { sessionStorage.removeItem(PENDING_ADD_KEY); } catch {}
    }
    removeProjectBlob(MESSAGES_KEY);
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
        if (pendingInstall?.slug === slug || doneWidgetId === slug) {
          updateProject(projectId, { pendingInstall: { slug, registered: true } });
        }
        if (doneWidgetId === slug) {
          setAdded(true);
          setPendingRegistration(false);
          setAdding(false);
        }
      } else {
        setAdding(false);
        reportPlacementFailure(slug);
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
    try {
      sessionStorage.setItem(PENDING_ADD_KEY, JSON.stringify({ slug, projectId }));
      sessionStorage.setItem(CREATOR_RESTORE_PROJECT_KEY, JSON.stringify({ projectId }));
    } catch {}
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
        try {
          sessionStorage.removeItem(PENDING_ADD_KEY);
          sessionStorage.removeItem(CREATOR_RESTORE_PROJECT_KEY);
        } catch {}
        setInstalling(false);
        setAdding(false);
        setMessages((prev) => [
          ...prev,
          { role: "error", text: `couldn't install "${slug}": ${body.error ?? `server error ${res.status}`}` },
        ]);
        return;
      }
    } catch (err) {
      try {
        sessionStorage.removeItem(PENDING_ADD_KEY);
        sessionStorage.removeItem(CREATOR_RESTORE_PROJECT_KEY);
      } catch {}
      setInstalling(false);
      setAdding(false);
      setMessages((prev) => [...prev, { role: "error", text: `couldn't install "${slug}": ${(err as Error).message}` }]);
      return;
    }
    setPendingRegistration(false);
    if (pendingInstall?.slug === slug || doneWidgetId === slug) {
      updateProject(projectId, { pendingInstall: { slug, registered: true } });
    }
    const ok = await placeWithRetry(slug, 8, 250);
    // Deliberately NOT clearing CREATOR_RESTORE_PROJECT_KEY here on success —
    // writing config/customComponentMap.tsx triggers a Fast Refresh full
    // page reload that Next fires asynchronously, sometime after this call
    // returns. WidgetCreatorPanel's mount-time restore effect consumes and
    // clears the key itself once that reload actually lands; clearing it
    // early here raced it and left the reload landing on the Projects List.
    try {
      sessionStorage.removeItem(PENDING_ADD_KEY);
    } catch {}
    setInstalling(false);
    setAdding(false);
    if (ok) setAdded(true);
    else reportPlacementFailure(slug);
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
      reportPlacementFailure(slug);
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
      <StatusBar phase={phase} modeLabel={modeLabel} />

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
          <button
            type="button"
            className="wc-preview-expand"
            onClick={() => setLightboxHtml(settings.designReferenceHtml ?? null)}
            title="expand mockup preview"
          >
            <Maximize2 size={11} strokeWidth={2} />
          </button>
          <iframe
            className="wc-handoff-preview-frame"
            sandbox="allow-scripts"
            srcDoc={settings.designReferenceHtml}
            title="finalized mockup reference"
          />
        </div>
      )}

      <div className="wc-chat-body" ref={bodyRef} onScroll={onBodyScroll}>
        {messages.length === 0 && !isGenerating && (
          <div className="wc-chat-empty">
            {isEditMode
              ? "describe changes to this widget here"
              : "fill in the settings on the left, then describe your widget here"}
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
                <div className="wc-code">{renderMessageText(msg.text)}</div>
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
          if (msg.role === "sibling_read") {
            return (
              <div key={i} className="wc-msg wc-msg-audit">
                <div className="wc-msg-audit-head">[read audit] the harness looked at another widget&apos;s code, even though the skill says it shouldn&apos;t need to — if it seemed confused about something, that gap belongs in the skill file, not in reading this:</div>
                {msg.paths.map((p, j) => (
                  <div key={j} className="wc-audit-line">{p}</div>
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
          if (msg.role === "action") {
            const label = msg.action === "reload"
              ? "reload"
              : msg.action === "open-widget-manager"
                ? "open widget manager"
                : "regenerate skills";
            return (
              <div key={i} className="wc-msg wc-msg-action">
                <span>{msg.text}</span>
                <button type="button" className="wc-msg-action-btn" onClick={() => void runMessageAction(msg.action)}>
                  {label}
                </button>
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

      {attachedImages.length > 0 && (
        <div className="wc-attach-strip">
          {attachedImages.map((img, i) => (
            <div key={i} className="wc-attach-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview, next/image gains nothing */}
              <img src={img} alt={`attachment ${i + 1}`} />
              <button
                type="button"
                className="wc-attach-remove"
                onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))}
                aria-label="remove image"
              >
                <X size={9} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="wc-chat-footer">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        <button
          type="button"
          className="wc-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={isGenerating || attachedImages.length >= MAX_ATTACHED_IMAGES}
          title="attach screenshots / design references — the AI views them before making changes"
          aria-label="attach images"
        >
          <Paperclip size={12} strokeWidth={2} />
        </button>
        {isDoneOrError && (
          <>
            <button type="button" className="wc-clear-btn" onClick={clearChat}>
              clear chat
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
          placeholder={
            isGenerating
              ? "generating..."
              : isEditMode
                ? "describe the edit... (shift+enter for newline)"
                : hasDesignReference
                  ? "optional notes — or just hit send to build the finalized mockup"
                  : "describe your widget... (shift+enter for newline)"
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
          disabled={isGenerating}
        />
        <button
          type="button"
          className={`wc-send-btn${isGenerating ? " stop" : ""}`}
          onClick={isGenerating ? stop : generate}
          aria-label={isGenerating ? "stop" : "generate"}
          disabled={!isGenerating && !prompt.trim() && !hasDesignReference}
        >
          {isGenerating ? <Square size={10} strokeWidth={2} fill="currentColor" /> : <Send size={12} strokeWidth={2} />}
        </button>
      </div>
      {lightboxHtml && (
        <MockupLightbox html={lightboxHtml} title="finalized mockup reference" onClose={() => setLightboxHtml(null)} />
      )}
    </div>
  );
}
