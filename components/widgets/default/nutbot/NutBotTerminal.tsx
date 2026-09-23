"use client";
import "./NutBotTerminal.css";
import "./creator/WidgetCreatorPanel.css";
import "./chat/NutBotChat.css";

// NutBot's full terminal: log, chat, shells (sidebar + live pty), and widget creator.
// Visited tabs stay mounted (display:none when inactive) so ptys and streams survive tab switches.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Maximize2, Minimize2 } from "lucide-react";
import { NutBotFaceV2 } from "@/components/widgets/default/nutbot/NutBotFaceV2";
import { ModelSettings } from "@/components/widgets/default/nutbot/ModelSettings";
import { ShellsScreen } from "@/components/widgets/default/nutbot/ShellsScreen";
import { WidgetCreatorPanel } from "@/components/widgets/default/nutbot/creator/WidgetCreatorPanel";
import { NutBotChat } from "@/components/widgets/default/nutbot/chat/NutBotChat";
import { getPrefs, getServerPrefs, setPrefs, subscribePrefs } from "@/lib/prefs";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { useWidget } from "@/components/framework/WidgetContext";
import { useServiceLog, type ServiceLogLine } from "@/lib/nutbot/useServiceLog";

export const LOG_MESSAGES = [
  "[ok] homelab uplink ... stable",
  "[ok] spotify.auth ... connected",
  "[ok] github.sync ... up to date",
  "[info] checking jellyfin sessions...",
  "[ok] jellyfin ... 2 active sessions",
  "[info] arr stack queue ... items pending",
  "[ok] storage apps ... nominal",
  "[info] nutbot v2.6 ready",
];

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

/** short relative age — a live feed can sit untouched for hours, so a line with
    no age reads as "just now" and makes a quiet feed look stuck */
function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function ServiceLogRow({ line, tick }: { line: ServiceLogLine; tick: number }) {
  void tick; // re-render hook so relative ages stay honest without their own timer
  const body = (
    <>
      <span className={`term-tag term-tag-${line.level}`}>[{line.level}]</span>{" "}
      <span className="term-svc">{line.service}</span> {line.text}
      {line.repeat > 1 && <span className="term-repeat">×{line.repeat}</span>}
      <span className="term-age">{ago(line.at)}</span>
    </>
  );
  // Replayed backlog renders instantly: animating 200 rows in at once on
  // connect is both ugly and a needless layout storm.
  if (!line.live) return <div className="term-line">{body}</div>;
  return (
    <motion.div
      className="term-line"
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      {body}
    </motion.div>
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
      if (e.key === "Escape" && isFocusMode && !document.querySelector("dialog[open]")) exitFocusMode();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFocusMode, exitFocusMode]);

  const { settings } = useWidget();
  const realtime = settings.realtimeLog === true;
  const maxLines = Math.max(5, Math.min(200, Number(settings.logMaxLines) || 40));
  const feed = useServiceLog({
    enabled: realtime,
    lifecycle: settings.logLifecycle !== false,
    stdout: settings.logStdout === true,
    mute: typeof settings.logMute === "string" ? settings.logMute : "",
    maxLines,
  });

  // Relative ages must age even when no new line arrives — without this a feed
  // that goes quiet freezes every timestamp at whatever it said on arrival.
  const [ageTick, setAgeTick] = useState(0);
  useEffect(() => {
    if (!realtime) return;
    const id = setInterval(() => setAgeTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [realtime]);

  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const logIndex = useRef(0);
  const logId = useRef(0);

  // The canned ticker is the `realtime: false` presentation — decorative, and
  // deliberately still running so the widget reads as alive on a fresh install
  // where nobody has opted into the real feed yet.
  useEffect(() => {
    if (realtime) return;
    const id = setInterval(() => {
      setLogLines((prev) => {
        const entry = { id: logId.current++, text: LOG_MESSAGES[logIndex.current % LOG_MESSAGES.length] };
        logIndex.current += 1;
        const next = [...prev, entry];
        return next.length > maxLines ? next.slice(next.length - maxLines) : next;
      });
    }, 1800);
    return () => clearInterval(id);
  }, [realtime, maxLines]);

  const [activeTab, setActiveTab] = useState<MainTab>("log");
  // geometry of the sliding tab highlight, measured from the active button
  const tabsRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // `activeTab` is what the user clicked (drives the tab bar's highlight, so it
  // reacts instantly); `displayedTab` is what the body is actually showing.
  // They diverge only for the ~110ms fade-out below.
  const [displayedTab, setDisplayedTab] = useState<MainTab>("log");
  const [tabPhase, setTabPhase] = useState<"idle" | "out">("idle");
  const reduceMotion = useReducedMotion();
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
        // restore straight to the stored tab — no fade from "log" on load
        setActiveTab(tab);
        setDisplayedTab(tab);
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

  // Measure the active tab so the highlight can slide to it. Re-measured when
  // the tab bar resizes (widget resize, focus mode's --nb-scale bump, or the
  // icons dropping out under 280px).
  useEffect(() => {
    const nav = tabsRef.current;
    if (!nav) return;
    const measure = () => {
      const button = nav.querySelector<HTMLElement>(`.term-tab[data-tab="${activeTab}"]`);
      if (button) setIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeTab]);

  // Tab switches run fade-out -> swap -> fade-in, NOT a crossfade. The body
  // restyles per tab (block vs flex, 7px/8px/0 padding, overflow auto vs
  // hidden), so any moment with two panels visible re-lays-out the outgoing
  // one under the incoming tab's container rules — that snap was the jank.
  // Swapping while everything is at opacity 0 hides the restyle completely,
  // and means exactly one panel is ever in flow.
  function selectTab(tab: MainTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    // clicking back to the panel that's still on screen mid-fade cancels the
    // fade-out instead of completing it and blinking the same tab back in
    setTabPhase(tab === displayedTab ? "idle" : "out");
  }

  // Failsafe: onAnimationComplete is the normal way out of the "out" phase,
  // but it never fires if the element is hidden mid-flight (widget resized to
  // S, canvas switched). Without this the body would stay blank.
  useEffect(() => {
    if (tabPhase !== "out") return;
    const t = window.setTimeout(() => {
      setDisplayedTab(activeTab);
      setTabPhase("idle");
    }, 400);
    return () => window.clearTimeout(t);
  }, [tabPhase, activeTab]);

  // Only the log tab is a scrolling feed that should pin to the bottom. Firing
  // this for every tab yanked chat/creator/shells to the bottom on each switch.
  //
  // Pin only when the reader is already at the bottom. The demo ticker capped
  // itself at 7 lines so there was never scrollback to lose; the real feed
  // keeps 200, and force-scrolling would drag someone out of history every
  // time a container so much as reports a health check.
  useEffect(() => {
    if (displayedTab !== "log") return;
    const el = bodyRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 48) el.scrollTop = el.scrollHeight;
  }, [logLines, feed.lines, displayedTab]);

  // deliberately keyed to displayedTab, not activeTab — see the fade-out effect
  const isShells   = displayedTab === "shells";
  const isCreator  = displayedTab === "creator";
  const isChat     = displayedTab === "chat";
  // which way the new tab lies relative to the old one, so the fade carries a
  // small directional nudge instead of blinking in place
  const switchDir =
    Math.sign(TAB_ORDER.indexOf(activeTab) - TAB_ORDER.indexOf(displayedTab)) || 1;

  if (!mountedTabs.has(activeTab)) {
    const next = new Set(mountedTabs);
    next.add(activeTab);
    setMountedTabs(next);
  }

  return (
    <div className="nutbot-terminal">
      <header className="term-header">
        <div className="term-toolbar">
          <div className="term-identity">
            <div className="nutbot-v2-scale nutbot-v2-scale-nano" aria-hidden="true"><NutBotFaceV2 compact /></div>
            <span className="term-title">NUTBOT <span className="term-version">v2.6</span></span>
          </div>
          <div className="term-actions">
            <ModelSettings />
            <button type="button" className={`term-focus-btn${isFocusMode ? " active" : ""}`}
              onClick={() => (isFocusMode ? exitFocusMode() : enterFocusMode("nutbot"))}
              aria-label={isFocusMode ? "exit focus mode" : "focus mode"}
              title={isFocusMode ? "exit focus mode (Esc)" : "expand NutBot"}>
              {isFocusMode ? <Minimize2 size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}
            </button>
          </div>
        </div>
        <nav className="term-tabs" aria-label="NutBot views" ref={tabsRef}>
          {/* one pill that slides between tabs — each tab used to fade in its
              own, so the highlight jumped rather than travelled */}
          <span
            aria-hidden="true"
            className={`term-tab-indicator${indicator ? " ready" : ""}`}
            style={indicator ? { transform: `translateX(${indicator.left}px)`, width: indicator.width } : undefined}
          />
          {TAB_ORDER.map((tab) => <button key={tab} type="button"
            data-tab={tab}
            className={`term-tab${activeTab === tab ? " active" : ""}`}
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => selectTab(tab)}>
            <span className="term-tab-content">
              <span className="term-tab-icon" aria-hidden="true">{{ log: "◈", chat: "◎", shells: "⌨", creator: "✦" }[tab]}</span>
              {tab}
            </span>
          </button>)}
        </nav>
      </header>

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
            /* `display` is plain style, never animated. The old code drove it
               through framer's transitionEnd, which raced on fast switching and
               left panels stacked in normal flow. */
            style={tab === displayedTab ? undefined : { display: "none" }}
            aria-hidden={tab === displayedTab ? undefined : true}
            initial={false}
            animate={
              tab === displayedTab
                ? (tabPhase === "idle"
                    ? { opacity: 1, x: 0 }
                    : { opacity: 0, x: -6 * switchDir })
                : { opacity: 0, x: 6 * switchDir }
            }
            transition={{
              duration: reduceMotion ? 0 : tabPhase === "out" ? 0.11 : 0.17,
              ease: tabPhase === "out" ? [0.4, 0, 1, 1] : [0, 0, 0.2, 1],
            }}
            onAnimationComplete={() => {
              if (tab !== displayedTab || tabPhase !== "out") return;
              setDisplayedTab(activeTab);
              setTabPhase("idle");
            }}
          >
            {tab === "log" && (realtime ? (
              <>
                <div className={`term-feed-status${feed.status.connected ? " live" : ""}`}>
                  <span className="term-feed-dot" aria-hidden="true" />
                  <span>{feed.status.connected ? "live · docker" : feed.status.detail}</span>
                </div>
                {feed.lines.length === 0 ? (
                  <div className="term-line term-feed-empty">
                    {feed.status.connected
                      ? "no service activity yet — the feed is idle, not stuck"
                      : "waiting for the docker event stream…"}
                  </div>
                ) : (
                  feed.lines.map((line) => (
                    <ServiceLogRow key={line.id} line={line} tick={ageTick} />
                  ))
                )}
                <span className="term-caret" aria-hidden="true" />
              </>
            ) : (
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
            ))}

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
