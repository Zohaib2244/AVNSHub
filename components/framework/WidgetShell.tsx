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

import { Component, Suspense, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  resolveSettings,
  type Orientation,
  type SettingsValues,
  type WidgetManifest,
  type WidgetSize,
} from "@/config/widgets";
import type { RegionId } from "@/config/slotLayout";
import { WidgetContext } from "@/components/framework/WidgetContext";

// Catches render errors inside a single widget so a broken custom component
// never crashes the entire dashboard — critical for the agent-generated
// widget playground, where a freshly-written widget can throw at runtime even
// after passing the creator's `tsc` gate (tsc can't catch a runtime throw).
//
// `resetKey` lets a crashed widget recover without a full remount: when the
// user resizes it or changes its settings (or HMR swaps the module after an
// edit), the key changes and the boundary clears its error to give the new
// render another chance, instead of staying stuck on the old failure.
class WidgetErrorBoundary extends Component<
  { id: string; resetKey: string; children: ReactNode },
  { error: Error | null; resetKey: string }
> {
  constructor(props: { id: string; resetKey: string; children: ReactNode }) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { error: Error | null; resetKey: string },
  ) {
    // a changed resetKey means the user/HMR altered this widget — drop the
    // stale error so the new render is attempted
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }
  componentDidCatch(error: Error) {
    // surface it in the console so generated-widget failures are debuggable
    console.error(`[widget:${this.props.id}] render error:`, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="block-label" style={{ color: "var(--status-down)", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
          <span>{this.props.id} — render error</span>
          <span style={{ fontSize: "0.6rem", opacity: 0.7, fontFamily: "var(--font-jetbrains-mono, monospace)" }}>
            {this.state.error.message}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

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

export function WidgetShell({
  manifest,
  config,
  entranceDelay,
}: {
  manifest: WidgetManifest;
  config?: ShellConfig;
  /** seconds to wait before this widget's mount fade+scale-in plays — lets a
      canvas switch cascade widgets in one after another (NutBot first, see
      SlotDashboard) instead of every widget popping in at once. Only affects
      a true mount; resize/hover/settings re-renders don't replay it since
      the animate target ({opacity:1,scale:1}) never changes after that. */
  entranceDelay?: number;
}) {
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
  // "auto" inherits the global widget backdrop default (independent from the
  // canvas's own backdrop mode) via the CSS :not([data-backdrop]) cascade
  // (globals.css) — only set the attribute for an explicit per-widget override
  const cardBackdrop = settings.cardBackdrop !== "auto" ? (settings.cardBackdrop as string) : undefined;

  const body = (
    <>
      {!flags.customHeader && settings.showHeader !== false && (
        <div className="block-label">
          <Icon size={14} strokeWidth={1.75} />
          {manifest.title}
        </div>
      )}
      <WidgetErrorBoundary id={manifest.id} resetKey={`${size}|${orientation}|${JSON.stringify(settings)}`}>
        <Suspense>
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
        </Suspense>
      </WidgetErrorBoundary>
    </>
  );

  return (
    // no `layout` prop — see CLAUDE.md's grid reflow-loop warning. This only
    // tweens opacity/scale on mount, never measures position.
    <motion.div
      id={manifest.id}
      className="capsule"
      data-size={size}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: entranceDelay ?? 0, ease: "easeOut" }}
    >
      <WidgetContext.Provider value={ctx}>
        {flags.plainChrome ? body : (
          <div className={blockClasses} data-backdrop={cardBackdrop}>
            {body}
          </div>
        )}
      </WidgetContext.Provider>
    </motion.div>
  );
}
