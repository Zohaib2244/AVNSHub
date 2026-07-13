"use client";
import "./NutBotTerminal.css";
import "./creator/WidgetCreatorPanel.css";
import "./chat/NutBotChat.css";

// NutBot's full terminal: log, chat, shells (sidebar + live pty), and widget creator.
// Visited tabs stay mounted (display:none when inactive) so ptys and streams survive tab switches.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { Maximize2, Minimize2 } from "lucide-react";
import { NutBotFaceV2 } from "@/components/widgets/default/nutbot/NutBotFaceV2";
import { NutBotModelPicker } from "@/components/widgets/default/nutbot/NutBotModelPicker";
import { ShellsScreen } from "@/components/widgets/default/nutbot/ShellsScreen";
import { NutBotChat } from "@/components/widgets/default/nutbot/chat/NutBotChat";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs } from "@/lib/prefs";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { LOG_MESSAGES } from "@/components/widgets/default/nutbot/nutbotLogs";

const WidgetCreatorPanel = dynamic(
  () => import("@/components/widgets/default/nutbot/creator/WidgetCreatorPanel").then((module) => module.WidgetCreatorPanel),
  { ssr: false },
);

type MainTab = "log" | "chat" | "shells" | "creator";
type LogLine = { id: number; text: string };

// "[ok] spotify.auth ... connected" → colored tag + rest (see .term-tag-*)
function renderLogLine(text: string) {
  const m = text.match(/^\[(\w+)\]\s?(.*)$/);
  if (!m) return text;
  return (
    <>
      <span className={`term-tag term-tag-${m[1]}`}>[{m[1]}]</span> {m[2]}
    </>
  );
}

const NUTBOT_TAB_KEY = "nutmag-nutbot-tab";
const TAB_ORDER: MainTab[] = ["log", "chat", "shells", "creator"];

function sanitizeTab(raw: string | null): MainTab {
  if (raw === "log" || raw === "chat" || raw === "shells" || raw === "creator") return raw;
  // old shell-N ids map to shells
  if (raw?.startsWith("shell")) return "shells";
  return "log";
}

export function NutBotTerminal() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const { focusWidgetId, enterFocusMode, exitFocusMode } = useLayout();
  const isFocusMode = focusWidgetId === "nutbot";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isFocusMode) exitFocusMode();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFocusMode, exitFocusMode]);

  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const logIndex = useRef(0);
  const logId = useRef(0);

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

  const [activeTab, setActiveTab] = useState<MainTab>("log");
  const [mountedTabs, setMountedTabs] = useState<Set<MainTab>>(() => new Set(["log"]));
  const skipTabWrite = useRef(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let t: number | undefined;
    try {
      const stored = sessionStorage.getItem(NUTBOT_TAB_KEY);
      const tab = sanitizeTab(stored);
      t = window.setTimeout(() => {
        skipTabWrite.current = false;
        setActiveTab(tab);
      }, 0);
    } catch {
      skipTabWrite.current = false;
    }
    return () => { if (t !== undefined) window.clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (skipTabWrite.current) return;
    try { sessionStorage.setItem(NUTBOT_TAB_KEY, activeTab); } catch {}
  }, [activeTab]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logLines, activeTab]);

  const isShells   = activeTab === "shells";
  const isCreator  = activeTab === "creator";
  const isChat     = activeTab === "chat";
  const activeTabIndex = TAB_ORDER.indexOf(activeTab);

  if (!mountedTabs.has(activeTab)) {
    const next = new Set(mountedTabs);
    next.add(activeTab);
    setMountedTabs(next);
  }

  function panelAnimate(tab: MainTab) {
    if (tab === activeTab) return { opacity: 1, x: 0, display: "flex" };
    return {
      opacity: 0,
      x: 10 * Math.sign(TAB_ORDER.indexOf(tab) - activeTabIndex),
      transitionEnd: { display: "none" },
    };
  }

  return (
    <div className="nutbot-terminal">
      {/* ── single combined row: title + tabs + controls ── */}
      <div className="term-row">
        <span className="term-title">NUTBOT V2.3</span>

        <div className="term-tabs">
          {(["log", "chat", "shells", "creator"] as MainTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`term-tab${activeTab === tab ? " active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {/* sliding background pill — layoutId makes Framer animate it between tabs */}
              {activeTab === tab && (
                <motion.div
                  layoutId="term-tab-bg"
                  className="term-tab-bg"
                  transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.6 }}
                />
              )}
              <span className="term-tab-content">
                {tab === "log"     && <span className="term-tab-icon">◈</span>}
                {tab === "chat"    && <span className="term-tab-icon">◎</span>}
                {tab === "shells"  && <span className="term-tab-icon">⌨</span>}
                {tab === "creator" && <span className="term-tab-icon">✦</span>}
                {tab}
              </span>
            </button>
          ))}
        </div>

        <div className="term-row-right">
          <NutBotModelPicker />
          <button
            type="button"
            className={`term-focus-btn${isFocusMode ? " active" : ""}`}
            onClick={() => (isFocusMode ? exitFocusMode() : enterFocusMode("nutbot"))}
            aria-label={isFocusMode ? "exit focus mode" : "focus mode"}
            title={isFocusMode ? "exit focus mode (Esc)" : "focus mode"}
          >
            {isFocusMode ? <Minimize2 size={11} strokeWidth={2} /> : <Maximize2 size={11} strokeWidth={2} />}
          </button>
          <div className="nutbot-v2-scale nutbot-v2-scale-nano">
            <NutBotFaceV2 compact />
          </div>
        </div>
      </div>

      {/* ── body ── */}
      <div
        className={[
          "term-body",
          isShells  ? "term-body-shells"  : "",
          isCreator ? "term-body-creator" : "",
          isChat    ? "term-body-chat"    : "",
        ].filter(Boolean).join(" ")}
        ref={bodyRef}
      >
        {TAB_ORDER.map((tab) => mountedTabs.has(tab) && (
          <motion.div
            key={tab}
            className="term-tab-panel"
            initial={false}
            animate={panelAnimate(tab)}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            {tab === "log" && (
              <>
                <AnimatePresence initial={false}>
                  {logLines.map((line) => (
                    <motion.div
                      key={line.id}
                      className="term-line"
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {renderLogLine(line.text)}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <span className="term-caret" aria-hidden="true" />
              </>
            )}

            {tab === "chat" && <NutBotChat />}

            {tab === "shells" && <ShellsScreen />}

            {tab === "creator" && (
              prefs.creatorEnabled ? (
                <WidgetCreatorPanel />
              ) : (
                <div className="term-disabled">
                  <span>Widget Creator is turned off</span>
                  <button type="button" className="term-disabled-btn" onClick={() => setPrefs({ creatorEnabled: true })}>
                    turn on
                  </button>
                </div>
              )
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
