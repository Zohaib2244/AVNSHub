"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";
import { ImageUploadSlot } from "./ImageUploadSlot";
import { WidgetPicker } from "./WidgetPicker";
import { CUSTOM_WIDGETS } from "@/config/customWidgets";
import customRegistryRaw from "@/config/customRegistry.json";
import { slugify, isValidSlug } from "@/lib/widget-creator/slug";
import { renameWidgetPlacement } from "@/lib/slotLayout";
import { LUCIDE_SUGGESTIONS } from "@/lib/widget-creator/lucideSuggestions";

// kept in sync with PanelMode in WidgetCreatorPanel but defined locally to
// avoid a circular import when SettingsPane is used from CreatorWorkspace
type SettingsPaneMode = "create" | "edit" | "ideate" | "plan";

type Props = {
  settings: GenerateSettings;
  onChange: (patch: Partial<GenerateSettings>) => void;
  mode: SettingsPaneMode;
  onModeChange: (mode: SettingsPaneMode) => void;
  /** When false the mode-toggle Section is hidden (used by CreatorWorkspace,
      where mode is controlled by the pipeline bar instead). */
  showModeToggle?: boolean;
  /** When true the entire settings form is locked — used during AI generation
      to prevent settings from changing mid-build. */
  disabled?: boolean;
};

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="wc-section">
      <button type="button" className="wc-section-head" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <ChevronDown size={11} strokeWidth={2} className={open ? "wc-chevron open" : "wc-chevron"} />
      </button>
      {open && <div className="wc-section-body">{children}</div>}
    </div>
  );
}

const SIZE_OPTIONS = ["S", "M", "L"] as const;
const ORI_OPTIONS = ["h", "v"] as const;
const HOE_MODES = ["both", "width", "height"] as const;

const IMAGE_KEY_MAP = { S: "sImageRef", M: "mImageRef", L: "lImageRef" } as const;

type RawRegistryEntry = {
  title: string;
  iconName: string;
  sizes: string[];
  orientations: string[];
  defaults: { size: string; orientation: string };
  settings?: { key: string; label: string; type: string }[];
};

const RAW_REGISTRY = customRegistryRaw as Record<string, RawRegistryEntry>;

/** Edit-mode identity form — title/icon/sizes/orientations/defaults/slug for
    an already-generated custom widget, saved via the deterministic
    update-meta route (no LLM involved, so it can never break the component).
    The widget's own settings schema is shown read-only below — only the
    generator (re-describing the widget) can change what that schema offers. */
function EditMetaForm({ id, onIdChange }: { id: string; onIdChange: (newId: string) => void }) {
  const entry = RAW_REGISTRY[id];
  const [title, setTitle] = useState(entry?.title ?? "");
  const [iconName, setIconName] = useState(entry?.iconName ?? "");
  const [sizes, setSizes] = useState<string[]>(entry?.sizes ?? ["S", "M", "L"]);
  const [orientations, setOrientations] = useState<string[]>(entry?.orientations ?? ["h"]);
  const [defaultSize, setDefaultSize] = useState(entry?.defaults?.size ?? "M");
  const [defaultOrientation, setDefaultOrientation] = useState(entry?.defaults?.orientation ?? "h");
  const [slug, setSlug] = useState(id);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [prevId, setPrevId] = useState(id);

  // re-derive the form whenever the target widget changes (picker switch)
  if (id !== prevId) {
    const next = RAW_REGISTRY[id];
    setPrevId(id);
    setTitle(next?.title ?? "");
    setIconName(next?.iconName ?? "");
    setSizes(next?.sizes ?? ["S", "M", "L"]);
    setOrientations(next?.orientations ?? ["h"]);
    setDefaultSize(next?.defaults?.size ?? "M");
    setDefaultOrientation(next?.defaults?.orientation ?? "h");
    setSlug(id);
    setStatus("idle");
    setError("");
  }

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    if (next.length > 0) setList(next);
  }

  async function handleSave() {
    const trimmedSlug = slug.trim();
    if (!isValidSlug(trimmedSlug)) {
      setStatus("error");
      setError(`invalid slug "${trimmedSlug}" — use only lowercase letters, numbers, and hyphens`);
      return;
    }
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/widget-creator/update-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title,
          iconName,
          sizes,
          orientations,
          defaultSize,
          defaultOrientation,
          newSlug: trimmedSlug !== id ? trimmedSlug : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(data.error ?? `save failed (${res.status})`);
        return;
      }
      if (data.id && data.id !== id) {
        renameWidgetPlacement(id, data.id);
        onIdChange(data.id);
      }
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError((err as Error).message ?? "save failed");
    }
  }

  const settingsSchema = entry?.settings ?? [];

  return (
    <Section title="current configuration">
      {settingsSchema.length > 0 && (
        <div className="wc-meta-readonly">
          <span className="wc-field-label">widget settings schema (read-only — re-describe the widget to change)</span>
          <div className="wc-meta-schema-list">
            {settingsSchema.map((f) => (
              <span key={f.key} className="wc-meta-schema-chip">{f.label} · {f.type}</span>
            ))}
          </div>
        </div>
      )}

      <div className="wc-row-pair">
        <div className="wc-field">
          <span className="wc-field-label">title</span>
          <input className="wc-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="wc-field">
          <span className="wc-field-label">icon</span>
          <input
            className="wc-input"
            list="wc-icon-list"
            value={iconName}
            onChange={(e) => setIconName(e.target.value)}
          />
          <datalist id="wc-icon-list">
            {LUCIDE_SUGGESTIONS.map((i) => <option key={i} value={i} />)}
          </datalist>
        </div>
      </div>

      <div className="wc-field">
        <span className="wc-field-label">slug</span>
        <input className="wc-input" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </div>

      <div className="wc-row wc-row-spread">
        <div className="wc-inline-label">sizes</div>
        <div className="wc-toggle-group">
          {SIZE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`wc-toggle-btn${sizes.includes(s) ? " active" : ""}`}
              onClick={() => toggle(sizes, setSizes, s)}
            >{s}</button>
          ))}
        </div>
        <div className="wc-inline-label">ori</div>
        <div className="wc-toggle-group">
          {ORI_OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              className={`wc-toggle-btn${orientations.includes(o) ? " active" : ""}`}
              onClick={() => toggle(orientations, setOrientations, o)}
            >{o}</button>
          ))}
        </div>
      </div>

      <div className="wc-row wc-row-spread">
        <div className="wc-inline-label">default size</div>
        <div className="wc-toggle-group">
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              className={`wc-toggle-btn${defaultSize === s ? " active" : ""}`}
              onClick={() => setDefaultSize(s)}
            >{s}</button>
          ))}
        </div>
        <div className="wc-inline-label">default ori</div>
        <div className="wc-toggle-group">
          {orientations.map((o) => (
            <button
              key={o}
              type="button"
              className={`wc-toggle-btn${defaultOrientation === o ? " active" : ""}`}
              onClick={() => setDefaultOrientation(o)}
            >{o}</button>
          ))}
        </div>
      </div>

      <div className="wc-row wc-row-spread">
        <button type="button" className="wc-add-btn" onClick={handleSave} disabled={status === "saving"}>
          {status === "saving" ? "saving..." : "save"}
        </button>
        {status === "saved" && <span className="wc-added-hint">saved ✓</span>}
        {status === "error" && <span className="wc-msg-error-tag">{error}</span>}
      </div>
    </Section>
  );
}

export function SettingsPane({ settings, onChange, mode, onModeChange, showModeToggle = true, disabled = false }: Props) {
  const [perSizeTab, setPerSizeTab] = useState<"S" | "M" | "L">("S");
  const [slugTouched, setSlugTouched] = useState(() => Boolean(settings.slug) && settings.slug !== slugify(settings.name ?? ""));
  const [prevIdentity, setPrevIdentity] = useState({ name: settings.name, slug: settings.slug });
  if (settings.name !== prevIdentity.name || settings.slug !== prevIdentity.slug) {
    setPrevIdentity({ name: settings.name, slug: settings.slug });
    setSlugTouched(Boolean(settings.slug) && settings.slug !== slugify(settings.name ?? ""));
  }
  const isCreateMode = mode === "create";
  const isEditMode = mode === "edit";
  const isIdeateMode = mode === "ideate";
  const isPlanMode = mode === "plan";
  const customIds = Object.keys(CUSTOM_WIDGETS);

  function toggleSize(s: string) {
    const current = settings.sizes ?? ["S", "M", "L"];
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    onChange({ sizes: next.length > 0 ? next : current });
  }

  function toggleOri(o: string) {
    const current = settings.orientations ?? ["h"];
    const next = current.includes(o) ? current.filter((x) => x !== o) : [...current, o];
    onChange({ orientations: next.length > 0 ? next : current });
  }

  const descKey = perSizeTab === "S" ? "sDescription" : perSizeTab === "M" ? "mDescription" : "lDescription";
  const descValue = (settings[descKey as keyof GenerateSettings] as string) ?? "";
  const imageKey = IMAGE_KEY_MAP[perSizeTab];
  const imageValue = (settings[imageKey as keyof GenerateSettings] as string | null) ?? null;

  return (
    <div
      className="wc-settings"
      style={disabled ? { opacity: 0.45, pointerEvents: "none", userSelect: "none" } : undefined}
      aria-disabled={disabled || undefined}
    >
      {showModeToggle && <Section title="mode">
        <div className="wc-row">
          <div className="wc-toggle-group">
            <button
              type="button"
              className={`wc-toggle-btn${isCreateMode ? " active" : ""}`}
              onClick={() => {
                onChange({ editSlug: undefined });
                onModeChange("create");
              }}
            >create</button>
            <button
              type="button"
              className={`wc-toggle-btn${isEditMode ? " active" : ""}${customIds.length === 0 ? " disabled" : ""}`}
              onClick={() => {
                const first = settings.editSlug && customIds.includes(settings.editSlug) ? settings.editSlug : customIds[0];
                if (first) onChange({ editSlug: first });
                onModeChange("edit");
              }}
              disabled={customIds.length === 0}
              title={customIds.length === 0 ? "no custom widgets yet" : "edit an existing widget"}
            >edit</button>
            <button
              type="button"
              className={`wc-toggle-btn${isIdeateMode ? " active" : ""}`}
              onClick={() => onModeChange("ideate")}
              title="brainstorm HTML/CSS mockups before building"
            >ideate</button>
            <button
              type="button"
              className={`wc-toggle-btn${isPlanMode ? " active" : ""}`}
              onClick={() => onModeChange("plan")}
              title="chat with AI to figure out what to build"
            >plan</button>
          </div>
        </div>
      </Section>}

      {isIdeateMode && (
        <Section title="about ideate mode">
          <p className="wc-ideate-help">
            Describe a widget concept and how many variations to brainstorm. Each
            variation renders live as an HTML/CSS mockup (animations included) —
            no real component yet. Regenerate one in place, or finalize a design
            to switch into create mode with it as the build reference.
          </p>
        </Section>
      )}

      {isPlanMode && (
        <Section title="about plan mode">
          <p className="wc-ideate-help">
            Chat with AI to figure out what to build. Describe a use case or vague
            idea — get concept suggestions, then a structured brief. Click
            &ldquo;Build this&rdquo; to jump into create mode with the settings
            pre-filled, or &ldquo;Visualize first&rdquo; to generate mockups in
            ideate mode before committing to a build.
          </p>
        </Section>
      )}

      {isEditMode && customIds.length > 0 && (
        <Section title="target widget">
          <WidgetPicker
            value={settings.editSlug ?? ""}
            options={customIds.map((id) => ({ id, label: `${CUSTOM_WIDGETS[id]?.title ?? id} (#${id})` }))}
            onChange={(id) => onChange({ editSlug: id })}
          />
        </Section>
      )}

      {isEditMode && settings.editSlug && (
        <EditMetaForm id={settings.editSlug} onIdChange={(newId) => onChange({ editSlug: newId })} />
      )}

      {isCreateMode && (
        <Section title="identity">
          <div className="wc-row-pair">
            <div className="wc-field">
              <span className="wc-field-label">name</span>
              <input
                className="wc-input"
                placeholder="weather"
                value={settings.name ?? ""}
                onChange={(e) => {
                  const name = e.target.value;
                  onChange(slugTouched ? { name } : { name, slug: slugify(name) });
                }}
              />
            </div>
            <div className="wc-field">
              <span className="wc-field-label">icon</span>
              <input
                className="wc-input"
                placeholder="Cloud"
                list="wc-icon-list"
                value={settings.icon ?? ""}
                onChange={(e) => onChange({ icon: e.target.value })}
              />
              <datalist id="wc-icon-list">
                {LUCIDE_SUGGESTIONS.map((i) => <option key={i} value={i} />)}
              </datalist>
            </div>
          </div>
          <div className="wc-field">
            <span className="wc-field-label">slug</span>
            <input
              className="wc-input"
              placeholder="auto-derived"
              value={settings.slug ?? ""}
              onChange={(e) => {
                setSlugTouched(true);
                onChange({ slug: e.target.value });
              }}
            />
          </div>
        </Section>
      )}

      {isCreateMode && (
        <Section title="sizes & layout">
          <div className="wc-row wc-row-spread">
            <div className="wc-inline-label">sizes</div>
            <div className="wc-toggle-group">
              {SIZE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`wc-toggle-btn${(settings.sizes ?? ["S","M","L"]).includes(s) ? " active" : ""}`}
                  onClick={() => toggleSize(s)}
                >{s}</button>
              ))}
            </div>
            <div className="wc-inline-label">ori</div>
            <div className="wc-toggle-group">
              {ORI_OPTIONS.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`wc-toggle-btn${(settings.orientations ?? ["h"]).includes(o) ? " active" : ""}`}
                  onClick={() => toggleOri(o)}
                >{o}</button>
              ))}
            </div>
          </div>
          <div className="wc-row wc-row-spread">
            <div className="wc-inline-label">hover expand</div>
            <button
              type="button"
              className={`wc-toggle-btn${settings.hoe ? " active" : ""}`}
              onClick={() => onChange({ hoe: !settings.hoe })}
            >{settings.hoe ? "on" : "off"}</button>
            {settings.hoe && (
              <div className="wc-toggle-group">
                {HOE_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`wc-toggle-btn${(settings.hoeMode ?? "both") === m ? " active" : ""}`}
                    onClick={() => onChange({ hoeMode: m })}
                  >{m}</button>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {isCreateMode && (
        <Section title="per-size content">
          <div className="wc-size-tabs">
            {(["S", "M", "L"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`wc-size-tab${perSizeTab === s ? " active" : ""}`}
                onClick={() => setPerSizeTab(s)}
              >{s}</button>
            ))}
          </div>
          <textarea
            className="wc-textarea"
            placeholder={`What should the ${perSizeTab} size show?`}
            value={descValue}
            onChange={(e) => onChange({ [descKey]: e.target.value } as Partial<GenerateSettings>)}
            rows={3}
          />
          <ImageUploadSlot
            label={perSizeTab}
            value={imageValue}
            onChange={(v) => onChange({ [imageKey]: v } as Partial<GenerateSettings>)}
          />
        </Section>
      )}

      {isCreateMode && (
        <Section title="data source" defaultOpen={false}>
          <div className="wc-field">
            <span className="wc-field-label">endpoint url</span>
            <input
              className="wc-input"
              placeholder="/api/my-widget"
              value={settings.dataUrl ?? ""}
              onChange={(e) => onChange({ dataUrl: e.target.value })}
            />
          </div>
          <div className="wc-field">
            <span className="wc-field-label">response shape</span>
            <textarea
              className="wc-textarea"
              placeholder="{ temp: number, city: string }"
              value={settings.dataShape ?? ""}
              onChange={(e) => onChange({ dataShape: e.target.value })}
              rows={2}
            />
          </div>
        </Section>
      )}
    </div>
  );
}
