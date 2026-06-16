"use client";

// The widget framework's card shell. Given a manifest (and optionally a
// per-instance config) it renders the sticker/stamp chrome, the label header,
// and provides placement/settings context. Widget content components only
// render their data and read state through useWidget().
//
// Widgets get richer large layouts two ways: branch on useWidget().size inside
// the component, or declare a manifest `detail` component, which the shell
// renders below the main content at L size. Slot Layout's Hover On Expand uses
// transient preview boxes handled by SlotRegion/SlotWidgetCell; the shell only
// receives a boolean so existing detail UI can reveal while expanded.

import {
  resolveSettings,
  type Orientation,
  type SettingsValues,
  type WidgetManifest,
  type WidgetSize,
} from "@/config/widgets";
import type { RegionId } from "@/config/slotLayout";
import { WidgetContext } from "@/components/framework/WidgetContext";

/** the per-instance slice the shell cares about; missing fields fall back
    to the manifest defaults */
export type ShellConfig = {
  size?: WidgetSize;
  orientation?: Orientation;
  settings?: SettingsValues;
  /** Slot Layout only — transient Hover On Expand preview, not persisted */
  hoverExpanded?: boolean;
  /** Slot Layout only — passed through to useWidget().slot, see WidgetContext */
  slot?: { region: RegionId; colSpan: number; rowSpan: number };
};

export function WidgetShell({ manifest, config }: { manifest: WidgetManifest; config?: ShellConfig }) {
  const size = config?.size ?? manifest.defaults.size;
  const orientation = config?.orientation ?? manifest.defaults.orientation;
  const settings = resolveSettings(manifest, config?.settings);

  const Content = manifest.component;
  const Detail = manifest.detail;
  const flags = manifest.flags ?? {};
  const Icon = manifest.icon;

  const hoverExpanded = config?.hoverExpanded ?? false;
  const ctx = { id: manifest.id, size, orientation, settings, hoverExpanded, slot: config?.slot };

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
      {/* Hover On Expand: always-mounted collapsed detail panel that grows
          open via CSS (max-height/opacity/margin-top), mirroring
          DESIGN_VARIATIONS "G"'s .dg-more pattern — no mount/unmount pop */}
      {Detail && size !== "L" && settings.hoverExpand === true && (
        <div className={`size-l-more size-l-more-hoe${hoverExpanded ? " open" : ""}`}>
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
