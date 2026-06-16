"use client";
import "./NutBotTerminal.css";
import "./creator/WidgetCreatorPanel.css";

// NutBot's full terminal — log ticker, mock shell tabs, and the optional
// xterm real shell. Lives in the face widget's click-to-expand overlay, so
// xterm only mounts when the terminal is actually open.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { NutBotFace } from "@/components/widgets/default/nutbot/NutBotFace";
import { RealShell } from "@/components/widgets/default/nutbot/RealShell";
import { HarnessPill } from "@/components/widgets/default/nutbot/creator/HarnessPill";
import { WidgetCreatorPanel } from "@/components/widgets/default/nutbot/creator/WidgetCreatorPanel";

const SHELL_WS_URL = process.env.NEXT_PUBLIC_NUTBOT_SHELL_URL;

export const LOG_MESSAGES = [
  "[ok] homelab uplink ... stable",
  "[ok] spotify.auth ... connected",
  "[ok] github.sync ... up to date",
  "[info] checking jellyfin sessions...",
  "[ok] jellyfin ... 2 active sessions",
  "[info] arr stack queue ... items pending",
  "[ok] storage apps ... nominal",
  "[info] nutbot v1.4 idle, awaiting input...",
];

const HELP_TEXT = "available: help, whoami, neofetch, ls, date, echo <text>, clear";
const PROMPT = "nutmag@homeserver:~$";

function runCommand(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const [bin, ...args] = trimmed.split(/\s+/);

  switch (bin.toLowerCase()) {
    case "help":
      return HELP_TEXT;
    case "whoami":
      return "nutmag2469";
    case "neofetch":
      return "os: nutos | host: a very nutty home server | shell: nutbot-sh";
    case "ls":
      return "now-playing/  homelab/  github-activity/  nutbot.exe";
    case "date":
      return new Date().toString();
    case "echo":
      return args.join(" ");
    case "clear":
      return null;
    default:
      return `nutbot: command not found: ${bin} (real shell access coming soon)`;
  }
}

type ShellState = { history: { cmd: string; output: string }[]; input: string };
type LogLine = { id: number; text: string };

export function NutBotTerminal() {
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

  const [tabs, setTabs] = useState(() => [
    { id: "log", title: "log" },
    { id: "shell-1", title: "shell 1" },
    ...(SHELL_WS_URL ? [{ id: "real-shell", title: "real shell" }] : []),
    { id: "creator", title: "creator" },
  ]);
  const [activeTab, setActiveTab] = useState("log");
  const [shells, setShells] = useState<Record<string, ShellState>>({ "shell-1": { history: [], input: "" } });
  const shellCount = useRef(1);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logLines, shells, activeTab]);

  function addShellTab() {
    shellCount.current += 1;
    const id = `shell-${shellCount.current}`;
    setTabs((prev) => [...prev, { id, title: `shell ${shellCount.current}` }]);
    setShells((prev) => ({ ...prev, [id]: { history: [], input: "" } }));
    setActiveTab(id);
  }

  function closeTab(id: string) {
    setTabs((prev) => prev.filter((tab) => tab.id !== id));
    setShells((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setActiveTab((current) => (current === id ? "log" : current));
  }

  function updateInput(id: string, value: string) {
    setShells((prev) => ({ ...prev, [id]: { ...prev[id], input: value } }));
  }

  function submitCommand(id: string) {
    setShells((prev) => {
      const shell = prev[id];
      const output = runCommand(shell.input);

      if (output === null) {
        return { ...prev, [id]: { history: [], input: "" } };
      }

      return { ...prev, [id]: { history: [...shell.history, { cmd: shell.input, output }], input: "" } };
    });
  }

  const activeShell = shells[activeTab];

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
              {tab.id.startsWith("shell-") && (
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
        <NutBotFace />
      </div>

      <div className={`term-body${activeTab === "real-shell" ? " term-body-real" : ""}${activeTab === "creator" ? " term-body-creator" : ""}`} ref={bodyRef}>
        {activeTab === "log" ? (
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
        ) : activeTab === "creator" ? (
          <WidgetCreatorPanel />
        ) : activeTab === "real-shell" ? (
          <RealShell wsUrl={SHELL_WS_URL ?? ""} />
        ) : (
          activeShell?.history.map((entry, i) => (
            <div key={i}>
              <div className="term-line">
                <span className="term-prompt-prefix">{PROMPT}</span> {entry.cmd}
              </div>
              {entry.output && <div className="term-line term-output">{entry.output}</div>}
            </div>
          ))
        )}

        {activeTab !== "log" && activeTab !== "real-shell" && activeTab !== "creator" && activeShell && (
          <div className="term-prompt">
            <span className="term-prompt-prefix">{PROMPT}</span>
            <input
              className="term-input"
              value={activeShell.input}
              onChange={(e) => updateInput(activeTab, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCommand(activeTab);
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label="nutbot shell input"
            />
          </div>
        )}
      </div>
    </div>
  );
}
