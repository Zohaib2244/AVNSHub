"use client";

// The widget framework's card shell. Given a manifest (and optionally a
// per-instance config) it renders the sticker/stamp chrome, the label header,
// and provides placement/settings context. Widget content components only
// render their data and read state through useWidget().
//
// There is NO hover/click expansion — widgets are resizable and rearrangeable,
// nothing more. A widget gets a richer large layout two ways: branch on
// useWidget().size inside the component, or declare a manifest `detail`
// component, which the shell renders below the main content at L size.

import {
  resolveSettings,
  type Orientation,
  type SettingsValues,
  type WidgetManifest,
  type WidgetSize,
} from "@/config/widgets";
import { WidgetContext } from "@/components/framework/WidgetContext";

/** the per-instance slice the shell cares about; missing fields fall back
    to the manifest defaults */
export type ShellConfig = {
  size?: WidgetSize;
  orientation?: Orientation;
  settings?: SettingsValues;
};

export function WidgetShell({ manifest, config }: { manifest: WidgetManifest; config?: ShellConfig }) {
  const size = config?.size ?? manifest.defaults.size;
  const orientation = config?.orientation ?? manifest.defaults.orientation;
  const settings = resolveSettings(manifest, config?.settings);

  const Content = manifest.component;
  const Detail = manifest.detail;
  const flags = manifest.flags ?? {};
  const Icon = manifest.icon;

  const ctx = { id: manifest.id, size, orientation, settings };

  const blockClasses = ["block", flags.accent ? "accent-left" : "", flags.className ?? ""].filter(Boolean).join(" ");

  const body = (
    <>
      {!flags.customHeader && (
        <div className="block-label">
          <Icon size={14} strokeWidth={1.75} />
          {manifest.title}
        </div>
      )}
      <Content />
      {/* detail content shows once the card is large enough to hold it */}
      {Detail && size === "L" && (
        <div className="size-l-more">
          <Detail />
        </div>
      )}
    </>
  );

  return (
    <div id={manifest.id} className="capsule" data-size={size}>
      <WidgetContext.Provider value={ctx}>
        {flags.plainChrome ? body : <div className={blockClasses}>{body}</div>}
      </WidgetContext.Provider>
    </div>
  );
}
