"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Settings2, Check, Loader2 } from "lucide-react";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs, type ChatBackend } from "@/lib/prefs";
import { MODEL_OPTIONS, sanitizeModelDefaults, type ModelDefaults } from "@/lib/widget-creator/models";
import type { UsageRun } from "@/lib/widget-creator/usage";
import "./ModelSettings.css";

const number = (n: number | null) => n === null ? "not reported" : n.toLocaleString();
type ProviderFilter = UsageRun["harness"] | "all";
const PROVIDER_FILTERS: { id: ProviderFilter; label: string }[] = [
  { id: "all", label: "All providers" }, { id: "claude", label: "Claude" }, { id: "codex", label: "Codex" }, { id: "opencode", label: "OpenCode" },
];
export function ModelSettings() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"defaults" | "usage">("defaults");
  const tabId = useId();
  const [closing, setClosing] = useState(false);
  const [draft, setDraft] = useState<ModelDefaults>(prefs.modelDefaults);
  const [provider, setProvider] = useState(prefs.activeHarness);
  const [chatBackend, setChatBackend] = useState<ChatBackend>(prefs.chatBackend);
  const [saved, setSaved] = useState(false);
  const [customModes, setCustomModes] = useState({ claude: false, codex: false });
  const [runs, setRuns] = useState<UsageRun[]>([]);
  const [error, setError] = useState("");
  const [usageError, setUsageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<number | null>(null);
  const pressedBackdrop = useRef(false);
  useEffect(() => {
    if (!open || closing) return;
    dialog.current?.showModal();
  }, [open, closing]);
  useEffect(() => {
    if (!open || closing || tab !== "usage") return;
    const controller = new AbortController();
    const refresh = () => fetch("/api/widget-creator/usage", { signal: controller.signal })
      .then(async (res) => { if (!res.ok) throw new Error(); const data = await res.json(); if (controller.signal.aborted) return; setRuns(data); setLoaded(true); setUsageError(""); })
      .catch(() => { if (!controller.signal.aborted) setUsageError("Could not load usage history. Retrying automatically…"); });
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [open, closing, tab]);

  function closeMenu() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      dialog.current?.close();
      setClosing(false);
      setOpen(false);
      closeTimer.current = null;
    }, 220);
  }

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);
  // Click-outside-to-close. A native <dialog>'s ::backdrop is a pseudo-element
  // of the dialog itself, so a backdrop click arrives with target === the
  // dialog. The dialog also has padding, which reports that same target, hence
  // the rect test: only a point outside the dialog's own box is really the
  // backdrop. The caller requires this of BOTH the pointerdown and the click,
  // so a drag that starts inside (selecting text, a native select popup) and
  // happens to release outside doesn't close the panel out from under you.
  function isBackdropPoint(e: { target: EventTarget | null; clientX: number; clientY: number }): boolean {
    const el = dialog.current;
    if (!el || e.target !== el) return false;
    const r = el.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }
  async function save() {
    setSaving(true); setSaved(false); setError("");
    const modelDefaults = sanitizeModelDefaults(draft);
    if ((["claude", "codex"] as const).some((id) => draft[id].model !== modelDefaults[id].model || (customModes[id] && !draft[id].model))) { setError("Use a valid model ID: letters, numbers, dots, hyphens, slashes or brackets."); setSaving(false); return; }
    const next = { ...getPrefs(), modelDefaults, activeHarness: provider, chatBackend };
    try {
      const res = await fetch("/api/hub-data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "nutmag-prefs", value: next }) });
      if (!res.ok) throw new Error();
      setPrefs(next); setSaved(true);
    } catch { setError("Settings were not saved. Check the server connection and retry."); }
    finally { setSaving(false); }
  }
  const stageRuns = providerFilter === "all" ? runs : runs.filter((run) => run.harness === providerFilter);
  return <>
    <button type="button" className="model-settings-trigger" aria-label="model settings" onClick={() => { setDraft(getPrefs().modelDefaults); setProvider(getPrefs().activeHarness); setChatBackend(getPrefs().chatBackend); setSaved(false); setCustomModes({ claude: false, codex: false }); setError(""); setOpen(true); }}>
      <Settings2 size={13} /> <span>Models</span>
    </button>
    {(open || closing) && createPortal(<dialog ref={dialog} className={`model-settings-dialog${closing ? " closing" : ""}`} onCancel={(e) => { e.preventDefault(); closeMenu(); }} aria-labelledby="model-settings-title"
      onPointerDown={(e) => { pressedBackdrop.current = isBackdropPoint(e); }}
      onClick={(e) => { if (pressedBackdrop.current && isBackdropPoint(e)) { pressedBackdrop.current = false; closeMenu(); } }}>
      <div className="model-settings-head"><h2 id="model-settings-title">Model settings <span className="model-version">v2.6</span></h2><button type="button" onClick={closeMenu} aria-label="close model settings">×</button></div>
      <div className="model-settings-tabs" role="tablist" aria-label="Model settings">
        {(["defaults", "usage"] as const).map((id) => <button key={id} type="button" role="tab" id={`${tabId}-${id}-tab`} aria-controls={`${tabId}-${id}-panel`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "defaults" : event.key === "End" ? "usage" : id === "defaults" ? "usage" : "defaults";
          setTab(next);
          document.getElementById(`${tabId}-${next}-tab`)?.focus();
        }}>{id === "defaults" ? "Defaults" : "Usage"}</button>)}
      </div>
      <section role="tabpanel" id={`${tabId}-defaults-panel`} aria-labelledby={`${tabId}-defaults-tab`} hidden={tab !== "defaults"} tabIndex={0}>
      <p>Saved defaults for Chat, Plan, Ideate and Build. Your CLI subscription handles access.</p>
      <label className="model-settings-field">Creator provider<select aria-label="Creator provider" value={provider} onChange={(e) => { setProvider(e.target.value as typeof provider); setSaved(false); }}><option value="claude">Claude</option><option value="codex">Codex</option><option value="opencode">OpenCode</option></select></label>
      <label className="model-settings-field">Chat backend<select aria-label="Chat backend" value={chatBackend} onChange={(e) => { setChatBackend(e.target.value as ChatBackend); setSaved(false); }}><option value="auto">Auto — Bonfire, then ask before using a CLI</option><option value="bonfire">Bonfire — local LLM</option><option value="claude">Claude</option><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="off">Off</option></select></label>
      <div className="model-settings-providers">
        {(["claude", "codex"] as const).map((id) => {
          const choice = draft[id];
          const options = MODEL_OPTIONS[id];
          const selected = options.find((o) => o.id === choice.model);
          const custom = customModes[id] || (choice.model !== "" && !selected);
          const supportsEffort = id === "codex" ? Boolean(selected) : ["sonnet", "opus"].includes(choice.model);
          const update = (patch: Partial<typeof choice>) => { setSaved(false); setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } })); };
          return <fieldset key={id}><legend>{id === "claude" ? "Claude Code" : "Codex"}</legend>
            <label className="model-settings-field">Model<select aria-label="Model" value={custom ? "custom" : choice.model} onChange={(e) => { setCustomModes((prev) => ({ ...prev, [id]: e.target.value === "custom" })); update({ model: e.target.value === "custom" ? "" : e.target.value, effort: "default" }); }}>
              <option value="">CLI default</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label} — {o.strength}</option>)}<option value="custom">Custom model ID</option>
            </select></label>
            {custom && <label className="model-settings-field">Model ID<input value={choice.model} maxLength={120} pattern="[a-zA-Z0-9][a-zA-Z0-9._/:\[\]\-]*" onChange={(e) => update({ model: e.target.value })} /></label>}
            <p>{selected?.strength ?? (custom ? "Use an exact model ID supported by your CLI and account." : "Inherit the CLI's configured model.")}</p>
            <label className="model-settings-field">Reasoning effort<select aria-label="Reasoning effort" disabled={!supportsEffort} value={choice.effort} onChange={(e) => update({ effort: e.target.value as typeof choice.effort })}><option value="default">Model default</option><option value="low">Low — focused tasks</option><option value="medium">Medium — balanced</option><option value="high">High — deeper reasoning</option></select></label>
          </fieldset>;
        })}
      </div>
      <p>Model suggestions are guidance, not an account availability check. An unavailable selection reports an error. Provider changes always ask first; saved model changes apply on your next request.</p>
      <div className="model-settings-actions"><button type="button" onClick={closeMenu}>cancel</button><button type="button" className={`model-save${saved ? " saved" : ""}`} disabled={saving} aria-busy={saving} onClick={save}>{saving ? <Loader2 size={14} className="model-saving-icon" /> : saved ? <Check size={14} /> : null}<span aria-live="polite">{saving ? "saving…" : saved ? "defaults saved" : "save defaults"}</span></button></div>
      {error && <p role="alert">{error}</p>}
      </section>
      <section role="tabpanel" id={`${tabId}-usage-panel`} aria-labelledby={`${tabId}-usage-tab`} hidden={tab !== "usage"} tabIndex={0}>
      <h3>Usage by stage</h3>
      <p>Last 200 CLI attempts on this hub, including failures. Counts are reported by the CLI; they are not subscription quota or a bill. Cached input is already included in input. OpenCode and interrupted runs may not report counts.</p>
      {usageError && <p role="alert">{usageError}</p>}
      {!loaded ? !usageError && <p>Loading usage…</p> : runs.length === 0 ? <p>No tracked runs yet. Make a request to start tracking.</p> : <>
        <div className="model-usage-filter" role="group" aria-label="Filter usage by provider">
          {PROVIDER_FILTERS.map(({ id, label }) => {
            const attempts = id === "all" ? runs.length : runs.filter((run) => run.harness === id).length;
            return <button key={id} type="button" className={`model-usage-chip${providerFilter === id ? " selected" : ""}`} aria-pressed={providerFilter === id} onClick={() => setProviderFilter(id)}>{label}<span className="model-usage-count">{attempts}</span></button>;
          })}
        </div>
        {stageRuns.length === 0 ? <p>No tracked runs for this provider yet.</p> : <div className="model-settings-table"><table><thead><tr><th>Stage</th><th>Attempts</th><th>Input</th><th>Output</th><th>Missing counts</th></tr></thead><tbody>
          {(["chat", "plan", "ideate", "build", "fix"] as const).map((stage) => {
            const group = stageRuns.filter((run) => run.stage === stage);
            const sum = (key: "input" | "output") => group.some((run) => run[key] !== null) ? group.reduce((n, run) => n + (run[key] ?? 0), 0) : null;
            return <tr key={stage}><td>{stage}</td><td>{group.length}</td><td>{number(sum("input"))}</td><td>{number(sum("output"))}</td><td>{group.filter((run) => run.input === null || run.output === null).length}</td></tr>;
          })}
        </tbody></table></div>}
        <h3>Recent attempts <span className="model-usage-scope">all providers</span></h3><div className="model-settings-table"><table><thead><tr><th>When / stage</th><th>Provider / model</th><th>Input</th><th>Cached</th><th>Output</th><th>Result</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{new Date(run.startedAt).toLocaleString()}<br />{run.stage}</td><td>{run.harness}<br />{run.model}</td><td>{number(run.input)}</td><td>{number(run.cached)}</td><td>{number(run.output)}</td><td>{run.status}<br />{Math.round(run.durationMs / 1000)}s</td></tr>)}</tbody></table></div>
      </>}
      </section>
    </dialog>, document.body)}
  </>;
}
