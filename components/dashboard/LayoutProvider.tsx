"use client";

import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import {
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
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const layout = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  const [editMode, setEditMode] = useState(false);
  const [activePopover, setActivePopover] = useState<string | null>(null);

  const startEdit = useCallback(() => setEditMode(true), []);
  // leaving edit mode hides every gear/add affordance — drop any open popover
  const lockLayout = useCallback(() => {
    setEditMode(false);
    setActivePopover(null);
  }, []);

  return (
    <LayoutContext.Provider
      value={{
        layout,
        reorderWidget,
        updateInstance,
        editMode,
        startEdit,
        lockLayout,
        resetLayout: resetLayoutStore,
        activePopover,
        setActivePopover,
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
