"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  addWidget,
  getLayout,
  getServerLayout,
  reorderWidget,
  resetLayout as resetLayoutStore,
  subscribeLayout,
  updateInstance,
  type LayoutState,
} from "@/lib/layout";

type LayoutContextValue = {
  layout: LayoutState;
  /** mutations persist immediately — see lib/layout.ts */
  reorderWidget: typeof reorderWidget;
  updateInstance: typeof updateInstance;
  /** add a widget that exists in the registry but isn't tracked in the layout yet */
  addWidget: typeof addWidget;
  editMode: boolean;
  startEdit: () => void;
  /** exit edit mode (the arrangement is already saved) */
  lockLayout: () => void;
  /** restore the default arrangement and clear the saved one */
  resetLayout: () => void;
  /** the single open popover (settings gear / placement picker) across the
      whole dashboard, keyed by a caller-defined id — opening one closes any
      other, so two settings/add menus can never be open at once */
  activePopover: string | null;
  setActivePopover: (id: string | null) => void;
  /** focus mode: non-null widget id = that widget owns the full frame;
      entering edit mode always clears focus */
  focusWidgetId: string | null;
  enterFocusMode: (id: string) => void;
  exitFocusMode: () => void;
  /** true while a new widget is being compiled and installed — the entire
      canvas is locked and visually disabled until the page reloads */
  isInstalling: boolean;
  setInstalling: (v: boolean) => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const layout = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  const [editMode, setEditMode] = useState(false);
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [focusWidgetId, setFocusWidgetId] = useState<string | null>(null);
  const [isInstalling, setInstalling] = useState(false);

  // entering edit mode always exits focus mode — can't do both at once
  const startEdit = useCallback(() => {
    setFocusWidgetId(null);
    setEditMode(true);
  }, []);
  // leaving edit mode hides every gear/add affordance — drop any open popover
  const lockLayout = useCallback(() => {
    setEditMode(false);
    setActivePopover(null);
  }, []);

  const enterFocusMode = useCallback((id: string) => setFocusWidgetId(id), []);
  const exitFocusMode = useCallback(() => setFocusWidgetId(null), []);

  return (
    <LayoutContext.Provider
      value={{
        layout,
        reorderWidget,
        updateInstance,
        addWidget,
        editMode,
        startEdit,
        lockLayout,
        resetLayout: resetLayoutStore,
        activePopover,
        setActivePopover,
        focusWidgetId,
        enterFocusMode,
        exitFocusMode,
        isInstalling,
        setInstalling,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used inside <LayoutProvider>");
  return ctx;
}
