"use client";
import "./NutBotTerminal.css";
import "./creator/WidgetCreatorPanel.css";

// NutBot's full terminal: an ambient log ticker, one or more REAL cross-platform
// shell tabs (each a live pty on the host via /api/nutbot-shell), and the widget
// creator. Lives in the face widget's click-to-expand overlay, so the shells
// only mount when the terminal is actually open.
//
// Shell tabs stay mounted (hidden with display:none) while you switch tabs, so
// the underlying pty session and its scrollback survive — a tab is only torn
// down when you close it.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { NutBotFaceV2 } from "@/components/widgets/default/nutbot/NutBotFaceV2";
import { RealShell } from "@/components/widgets/default/nutbot/RealShell";
import { HarnessPill } from "@/components/widgets/default/nutbot/creator/HarnessPill";
import { WidgetCreatorPanel } from "@/components/widgets/default/nutbot/creator/WidgetCreatorPanel";

export const LOG_MESSAGES = [
  "[ok] homelab uplink ... stable",
  "[ok] spotify.auth ... connected",
  "[ok] github.sync ... up to date",
  "[info] checking jellyfin sessions...",
  "[ok] jellyfin ... 2 active sessions",
  "[info] arr stack queue ... items pending",
  "[ok] storage apps ... nominal",
  "[info] nutbot v2.1 idle, awaiting input...",
];

type TabKind = "log" | "shell" | "creator";
type TerminalTab = { id: string; title: string; kind: TabKind };
type LogLine = { id: number; text: string };

const NUTBOT_TAB_KEY = "nutmag-nutbot-tab";
const INITIAL_TABS: TerminalTab[] = [
  { id: "log", title: "log", kind: "log" },
  { id: "shell-1", title: "shell 1", kind: "shell" },
  { id: "creator", title: "creator", kind: "creator" },
];

export function NutBotTerminal() {
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const logIndex = useRef(0);
  const logId = useRef(0);
  const skipTabWrite = useRef(true);

  useEffect(() => {
    const id = setInterval(() => {
      setLogLines((prev) => {
        const entry = { id: logId.current++, text: LOG_MESSAGES[logIndex.current % LOG_MESSAGES.length] };
        logIndex.current += 1;
        const next = [...prev, entry];
        return next.length > 7 ? next.slice(next.length - 7) : next;
      });
    }, 1800);
    return () => clearInterval(id);
  }, []);

  const [tabs, setTabs] = useState<TerminalTab[]>(() => INITIAL_TABS);
  const [activeTab, setActiveTab] = useState("log");
  const shellCount = useRef(1);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let restoreTimer: number | undefined;
    try {
      const stored = sessionStorage.getItem(NUTBOT_TAB_KEY);
      if (stored && INITIAL_TABS.some((tab) => tab.id === stored)) {
        restoreTimer = window.setTimeout(() => {
          skipTabWrite.current = false;
          setActiveTab(stored);
        }, 0);
      } else {
        skipTabWrite.current = false;
      }
    } catch {
      skipTabWrite.current = false;
    }
    return () => {
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
    };
  }, []);

  useEffect(() => {
    if (skipTabWrite.current) return;
    try { sessionStorage.setItem(NUTBOT_TAB_KEY, activeTab); } catch {}
  }, [activeTab]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logLines, activeTab]);

  function addShellTab() {
    shellCount.current += 1;
    const id = `shell-${shellCount.current}`;
    const title = `shell ${shellCount.current}`;
    // insert the new shell just before the creator tab so creator stays last
    setTabs((prev) => {
      const creatorIdx = prev.findIndex((t) => t.kind === "creator");
      const tab: TerminalTab = { id, title, kind: "shell" };
      if (creatorIdx === -1) return [...prev, tab];
      return [...prev.slice(0, creatorIdx), tab, ...prev.slice(creatorIdx)];
    });
    setActiveTab(id);
  }

  function closeTab(id: string) {
    setTabs((prev) => prev.filter((tab) => tab.id !== id));
    setActiveTab((current) => (current === id ? "log" : current));
  }

  const activeKind = tabs.find((t) => t.id === activeTab)?.kind ?? "log";
  const shellTabs = tabs.filter((t) => t.kind === "shell");

  return (
    <div className="nutbot-terminal">
      <div className="term-row">
        <div className="term-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`term-tab${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.title}
              {/* only shell tabs are closeable, and never the last remaining one */}
              {tab.kind === "shell" && shellTabs.length > 1 && (
                <X
                  size={10}
                  strokeWidth={2}
                  className="term-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                />
              )}
            </button>
          ))}
          <button type="button" className="term-tab term-tab-add" onClick={addShellTab} aria-label="new shell tab">
            <Plus size={12} strokeWidth={2} />
          </button>
        </div>

        <HarnessPill />
        <div className="nutbot-v2-scale nutbot-v2-scale-nano">
          <NutBotFaceV2 compact />
        </div>
      </div>

      <div
        className={`term-body${activeKind === "shell" ? " term-body-real" : ""}${activeKind === "creator" ? " term-body-creator" : ""}`}
        ref={bodyRef}
      >
        {activeKind === "log" && (
          <AnimatePresence initial={false}>
            {logLines.map((line) => (
              <motion.div
                key={line.id}
                className="term-line"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                {line.text}
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {activeKind === "creator" && <WidgetCreatorPanel />}

        {/* shells stay mounted across tab switches so their pty + scrollback
            persist; only the active one is visible */}
        {shellTabs.map((tab) => (
          <div
            key={tab.id}
            className="term-shell-pane"
            style={{ display: activeTab === tab.id ? "block" : "none" }}
          >
            <RealShell />
          </div>
        ))}
      </div>
    </div>
  );
}
