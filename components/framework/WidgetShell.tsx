"use client";

// The widget framework's card shell. Given a manifest (and optionally a
// per-instance config), it renders the sticker/stamp chrome, the label
// header, and the expansion machinery — widget content components only
// render their data and read placement state through useWidget().

import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  resolveSettings,
  type ExpandDirection,
  type ExpandMode,
  type Orientation,
  type SettingsValues,
  type WidgetManifest,
  type WidgetSize,
} from "@/config/widgets";
import type { CascadeOverride } from "@/lib/gridCascade";
import { WidgetContext } from "@/components/framework/WidgetContext";
import { WidgetOverlay } from "@/components/framework/WidgetOverlay";
import { MicroView } from "@/components/framework/MicroView";

/** the per-instance slice the shell cares about; missing fields fall back
    to the manifest defaults */
export type ShellConfig = {
  size?: WidgetSize;
  orientation?: Orientation;
  expand?: ExpandMode;
  expandDirection?: ExpandDirection;
  settings?: SettingsValues;
};

const CLOSE_DELAY_MS = 150;
const LAYOUT_TRANSITION = { duration: 0.35, ease: [0.4, 0, 0.2, 1] } as const;

/** clicks on interactive content shouldn't also trigger the overlay */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest("button, a, input, select, textarea, [role='button'], [contenteditable]")
  );
}

export function WidgetShell({
  manifest,
  config,
  cascade,
  grown,
  onHoverChange,
}: {
  manifest: WidgetManifest;
  config?: ShellConfig;
  /** active span/size override from the cascade engine, if this instance is involved */
  cascade?: CascadeOverride;
  /** true when this instance is the one being hovered (vs. a displaced neighbor) */
  grown?: boolean;
  /** for expand:"grow" widgets — reports hover state up to Dashboard's cascade engine */
  onHoverChange?: (hovering: boolean) => void;
}) {
  const size = cascade?.size ?? config?.size ?? manifest.defaults.size;
  const orientation = config?.orientation ?? manifest.defaults.orientation;
  const settings = resolveSettings(manifest, config?.settings);
  const micro = cascade?.micro ?? false;
  // an expansion mode is only honored when the widget ships expanded content
  // or drives its own size tiers via "grow"
  const expand: ExpandMode =
    manifest.expandedComponent || manifest.expandModes.includes("grow")
      ? (config?.expand ?? manifest.defaults.expand)
      : "none";
  const hoverActive = expand === "hover" || expand === "grow";

  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);

  function hoverEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (expand !== "grow") setFlyoutOpen(true);
    // Dashboard reacts with span overrides: tier-bump cascade for "grow",
    // +1 row span for "hover" so the inline expand pushes rows below down
    onHoverChange?.(true);
  }

  function hoverLeave(e: MouseEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) {
    // the expansion this triggers can resize the row tracks it spans, which
    // shifts this capsule's own box under a stationary pointer; the browser
    // then re-fires mouseleave with the pointer's last position even though
    // it's still over the (moved) capsule. Ignore those — only a leave whose
    // coordinates are actually outside the current box is real, otherwise
    // this oscillates: leave -> revert -> snap back under pointer -> enter -> …
    if ("clientX" in e) {
      const rect = capsuleRef.current?.getBoundingClientRect();
      if (rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        return;
      }
    }
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (expand !== "grow") setFlyoutOpen(false);
      onHoverChange?.(false);
    }, CLOSE_DELAY_MS);
  }

  function handleClick(e: MouseEvent) {
    if (expand !== "overlay" || isInteractive(e.target)) return;
    setOverlayOpen(true);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (expand !== "overlay" || e.key !== "Enter" || isInteractive(e.target)) return;
    setOverlayOpen(true);
  }

  const Content = manifest.component;
  const Expanded = manifest.expandedComponent;
  const flags = manifest.flags ?? {};
  const Icon = manifest.icon;

  const isOpen = flyoutOpen || overlayOpen || grown === true;
  const ctx = { id: manifest.id, size, orientation, settings, inOverlay: false, micro, expanded: isOpen };

  const blockClasses = [
    "block",
    flags.accent ? "accent-left" : "",
    flags.className ?? "",
    expand !== "none" ? "block-expandable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  let body: ReactNode;
  if (micro) {
    body = <MicroView Content={Content} Icon={Icon} title={manifest.title} />;
  } else if (flags.plainChrome) {
    body = <Content />;
  } else {
    body = (
      <>
        {!flags.customHeader && (
          <div className="block-label">
            <Icon size={14} strokeWidth={1.75} />
            {manifest.title}
          </div>
        )}
        <Content />
        {/* hover expansion lives inside the card — the animated height
            grows the card, the grid row grows with it, and surrounding
            widgets reflow to make room (the original capsule feel) */}
        {expand === "hover" && Expanded && (
          <AnimatePresence initial={false}>
            {flyoutOpen && (
              <motion.div
                className="inline-expand"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={LAYOUT_TRANSITION}
              >
                <div className="inline-expand-body">
                  <Expanded />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </>
    );
  }

  return (
    <div
      ref={capsuleRef}
      id={manifest.id}
      className={`capsule${isOpen ? " open" : ""}`}
      onMouseEnter={hoverActive ? hoverEnter : undefined}
      onMouseLeave={hoverActive ? hoverLeave : undefined}
      onFocus={hoverActive ? hoverEnter : undefined}
      onBlur={hoverActive ? hoverLeave : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={expand === "overlay" ? 0 : undefined}
    >
      {flags.plainChrome && !micro ? (
        <WidgetContext.Provider value={ctx}>{body}</WidgetContext.Provider>
      ) : (
        <div className={blockClasses}>
          <WidgetContext.Provider value={ctx}>{body}</WidgetContext.Provider>
        </div>
      )}

      {expand === "overlay" && Expanded && (
        <WidgetOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} title={manifest.title} Icon={Icon}>
          <WidgetContext.Provider value={{ ...ctx, expanded: true, inOverlay: true }}>
            <Expanded />
          </WidgetContext.Provider>
        </WidgetOverlay>
      )}
    </div>
  );
}
