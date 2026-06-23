"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";
import { ImageUploadSlot } from "./ImageUploadSlot";
import { CUSTOM_WIDGETS } from "@/config/customWidgets";
import { slugify } from "@/lib/widget-creator/slug";

type Props = {
  settings: GenerateSettings;
  onChange: (patch: Partial<GenerateSettings>) => void;
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

const LUCIDE_SUGGESTIONS = [
  "Box", "Cloud", "Cpu", "Database", "Globe", "HardDrive", "Heart", "Home",
  "Music", "Rss", "Server", "Smile", "Star", "Sun", "Tv", "Zap",
  "Activity", "Bell", "Camera", "Clock", "Code", "Eye", "Film",
  "Map", "Package", "Terminal", "Wifi", "Wind",
];

const SIZE_OPTIONS = ["S", "M", "L"] as const;
const ORI_OPTIONS = ["h", "v"] as const;
const HOE_MODES = ["both", "width", "height"] as const;

const IMAGE_KEY_MAP = { S: "sImageRef", M: "mImageRef", L: "lImageRef" } as const;

export function SettingsPane({ settings, onChange }: Props) {
  const [perSizeTab, setPerSizeTab] = useState<"S" | "M" | "L">("S");
  const isEditMode = Boolean(settings.editSlug);
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
    <div className="wc-settings">
      <Section title="mode">
        <div className="wc-row wc-row-spread">
          <div className="wc-toggle-group">
            <button
              type="button"
              className={`wc-toggle-btn${!isEditMode ? " active" : ""}`}
              onClick={() => onChange({ editSlug: undefined })}
            >create</button>
            <button
              type="button"
              className={`wc-toggle-btn${isEditMode ? " active" : ""}${customIds.length === 0 ? " disabled" : ""}`}
              onClick={() => {
                const first = customIds[0];
                if (first) onChange({ editSlug: first });
              }}
              disabled={customIds.length === 0}
              title={customIds.length === 0 ? "no custom widgets yet" : "edit an existing widget"}
            >edit</button>
          </div>
          {isEditMode && customIds.length > 0 && (
            <select
              className="wc-select"
              value={settings.editSlug ?? ""}
              onChange={(e) => onChange({ editSlug: e.target.value })}
            >
              {customIds.map((id) => (
                <option key={id} value={id}>
                  {CUSTOM_WIDGETS[id]?.title ?? id} (#{id})
                </option>
              ))}
            </select>
          )}
        </div>
      </Section>

      {!isEditMode && (
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
                  onChange({ name, slug: slugify(name) });
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
              onChange={(e) => onChange({ slug: e.target.value })}
            />
          </div>
        </Section>
      )}

      {!isEditMode && (
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

      {!isEditMode && (
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

      {!isEditMode && (
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
