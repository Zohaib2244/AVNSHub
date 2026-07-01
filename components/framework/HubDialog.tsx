"use client";

// Global confirmation dialog styled with AVN Hub tokens.
// Rendered once inside LayoutProvider; any module can trigger it via showHubDialog().

import { useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getDialogConfig,
  getServerDialogConfig,
  subscribeDialog,
  dismissHubDialog,
} from "@/lib/hubDialog";

export function HubDialog() {
  const config = useSyncExternalStore(subscribeDialog, getDialogConfig, getServerDialogConfig);

  return (
    <AnimatePresence>
      {config && (
        <motion.div
          className="hub-dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) dismissHubDialog();
          }}
        >
          <motion.div
            className="hub-dialog"
            initial={{ scale: 0.93, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 4 }}
            transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.6 }}
          >
            <div className="hub-dialog-title">{config.title}</div>
            <p className="hub-dialog-body">{config.body}</p>
            <div className="hub-dialog-actions">
              <button type="button" className="hub-dialog-cancel" onClick={dismissHubDialog}>
                cancel
              </button>
              <button
                type="button"
                className="hub-dialog-confirm"
                onClick={() => {
                  const fn = config.onConfirm;
                  dismissHubDialog();
                  fn();
                }}
              >
                {config.confirmLabel ?? "confirm"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
