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
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const layout = useSyncExternalStore(subscribeLayout, getLayout, getServerLayout);
  const [editMode, setEditMode] = useState(false);

  const startEdit = useCallback(() => setEditMode(true), []);
  const lockLayout = useCallback(() => setEditMode(false), []);

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
