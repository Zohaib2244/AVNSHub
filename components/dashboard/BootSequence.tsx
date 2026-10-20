"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getPrefs } from "@/lib/prefs";
import { emitThinking, emitBootComplete } from "@/lib/nutbotSignal";
import { NutBotFaceV2 } from "@/components/widgets/default/nutbot/NutBotFaceV2";
import "@/components/widgets/default/nutbot/NutBotFaceWidget.css";
import type { HomelabStatus, HostTelemetry } from "@/lib/homelab";
import packageJson from "@/package.json";

const APP_VERSION = packageJson.version;

// Reading sessionStorage during render would diverge from the server's render
// (which always sees "not booted"), causing a hydration mismatch. Defer the
// check to a layout effect, which only runs on the client and fires before
// paint — so a returning-within-session visitor never sees the overlay flash.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type LineType = "header" | "divider" | "ok" | "warn" | "default";

type Status = {
  homelab: HomelabStatus | null;
  homelabLoaded: boolean;
  sys: HostTelemetry | null;
  sysLoaded: boolean;
  /** "ok" = credentials work, "unset" = no credentials, "fail" = request failed */
  spotify: "ok" | "unset" | "fail" | null;
};

/** pad a check name to the log's value column */
const row = (name: string, value: string) => `  ${name.padEnd(33)}${value}`;

const FLAVOR_LINES = [
  "  waking nutbot up...",
  "  polishing chunky blocks...",
  "  counting sticker shadows...",
  "  reticulating splines...",
  "  asking nutbot nicely...",
  "  warming up the CRT...",
];

// picked once per module load (stable for the boot, varies across page loads)
const flavorLine = FLAVOR_LINES[Math.floor(Math.random() * FLAVOR_LINES.length)];

// Every status here comes from a real request made while the log animates.
// A check that hasn't answered yet shows "..." and one that failed says so —
// nothing is hard-coded to "OK".
function buildLines(status: Status): { text: string; type: LineType }[] {
  let sys = { text: row("system.telemetry", "..."), type: "default" as LineType };
  let storage = { text: row("storage.mounts", "..."), type: "default" as LineType };
  if (status.sysLoaded) {
    if (status.sys) {
      const cpu = Math.round(status.sys.cpu.used_pct);
      const mem = Math.round(status.sys.memory.used_pct);
      sys = { text: row("system.telemetry", `OK   cpu ${cpu}% · mem ${mem}%`), type: "ok" };
      const drives = status.sys.drives.filter((d) => d.mount === "/" || d.mount.startsWith("/mnt/"));
      const full = drives.filter((d) => d.used_pct >= 95);
      const missing = status.sys.missing_mounts ?? [];
      storage = missing.length
        ? { text: row("storage.mounts", `FAIL ${missing.join(", ")} not mounted`), type: "warn" }
        : full.length
        ? { text: row("storage.mounts", `WARN ${full.map((d) => `${d.mount} ${Math.round(d.used_pct)}%`).join(", ")}`), type: "warn" }
        : { text: row("storage.mounts", `OK   ${drives.length} mounted`), type: "ok" };
    } else {
      sys = { text: row("system.telemetry", "FAIL unavailable"), type: "warn" };
      storage = { text: row("storage.mounts", "FAIL unavailable"), type: "warn" };
    }
  }

  let homelab = { text: row("homelab.ping", "..."), type: "default" as LineType };
  if (status.homelabLoaded) {
    const services = status.homelab?.services ?? [];
    if (services.length === 0) {
      homelab = { text: row("homelab.ping", "SKIP no status source"), type: "default" };
    } else {
      const up = services.filter((svc) => svc.status === "up").length;
      const total = services.length;
      homelab = up === total
        ? { text: row("homelab.ping", `OK   ${up}/${total} up`), type: "ok" }
        : { text: row("homelab.ping", `WARN ${up}/${total} up`), type: "warn" };
    }
  }

  const spotify: { text: string; type: LineType } = {
    ok: { text: row("spotify.auth", "OK"), type: "ok" as LineType },
    unset: { text: row("spotify.auth", "SKIP not configured"), type: "default" as LineType },
    fail: { text: row("spotify.auth", "FAIL"), type: "warn" as LineType },
    pending: { text: row("spotify.auth", "..."), type: "default" as LineType },
  }[status.spotify ?? "pending"];

  return [
    { text: `AVN HUB / v${APP_VERSION}  ——  IDENTITY RUNTIME`, type: "header" },
    { text: "────────────────────────────────────────", type: "divider" },
    sys,
    storage,
    homelab,
    spotify,
    { text: flavorLine, type: "default" },
    { text: "  rendering dashboard...", type: "default" },
  ];
}

const LINE_COUNT = 8;

const colorFor: Record<LineType, string> = {
  header:  "var(--text-primary)",
  divider: "var(--text-muted)",
  ok:      "var(--accent-cyan)",
  warn:    "var(--accent-orange)",
  default: "var(--text-muted)",
};

// short ascending sine arpeggio — synthesized, no bundled audio asset
function playBootChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [440, 660, 880].forEach((freq, i) => {
      const t = now + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
    setTimeout(() => ctx.close(), 700);
  } catch {
    // audio blocked (autoplay policy) or unavailable — silent no-op
  }
}

export function BootSequence() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<Status>({
    homelab: null, homelabLoaded: false, sys: null, sysLoaded: false, spotify: null,
  });

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const LINES = useMemo(() => buildLines(status), [status]);

  useIsomorphicLayoutEffect(() => {
    if (sessionStorage.getItem("nutmag-booted") || !getPrefs().bootSequence) {
      setDone(true);
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const beginExit = useCallback(() => {
    clearAllTimers();
    setExiting(true);
    emitBootComplete();
    if (getPrefs().bootChime) playBootChime();
    const t = setTimeout(() => {
      setDone(true);
      sessionStorage.setItem("nutmag-booted", "1");
    }, 550);
    timeoutsRef.current.push(t);
  }, [clearAllTimers]);

  const skip = useCallback(() => {
    if (exiting || done) return;
    setVisibleLines(LINE_COUNT);
    beginExit();
  }, [beginExit, done, exiting]);

  // fetch real homelab / system / spotify state in the background so the boot
  // log reports true state; anything that fails is shown as FAIL, not OK
  useEffect(() => {
    if (done) return;
    let cancelled = false;
    fetch("/api/homelab")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => { if (!cancelled) setStatus((s) => ({ ...s, homelab: data, homelabLoaded: true })); });
    fetch("/api/system-stats")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => { if (!cancelled) setStatus((s) => ({ ...s, sys: data, sysLoaded: true })); });
    // GET uses the server's SPOTIFY_* env vars; credentials entered only in a
    // widget's settings aren't known here, so those read as "not configured"
    fetch("/api/now-playing")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => (data && typeof data === "object" && "notConfigured" in data ? "unset" : "ok"))
      .catch(() => "fail")
      .then((spotify) => { if (!cancelled) setStatus((s) => ({ ...s, spotify: spotify as Status["spotify"] })); });
    return () => { cancelled = true; };
  }, [done]);

  useEffect(() => {
    if (done) return;

    emitThinking();

    let i = 0;
    tickRef.current = setInterval(() => {
      i++;
      setVisibleLines(i);
      if (i >= LINE_COUNT) {
        if (tickRef.current) clearInterval(tickRef.current);
        const t = setTimeout(beginExit, 500);
        timeoutsRef.current.push(t);
      }
    }, 180);

    return clearAllTimers;
  }, [done, beginExit, clearAllTimers]);

  useEffect(() => {
    if (done) return;
    function handleKey() { skip(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [done, skip]);

  if (done) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] cursor-pointer"
      onClick={skip}
      role="presentation"
    >
      {/* The two halves meet at the exact vertical centre — where the log text
          sits — so the accent seam stays invisible while booting and only
          lights up as the panels split apart on exit; otherwise it draws a line
          straight through the text. */}
      <motion.div
        className="absolute inset-x-0 top-0 h-1/2"
        style={{ background: "var(--bg-page)", borderBottom: `2px solid ${exiting ? "var(--accent-orange)" : "transparent"}` }}
        animate={{ y: exiting ? "-100%" : 0 }}
        transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: "var(--bg-page)", borderTop: `2px solid ${exiting ? "var(--accent-orange)" : "transparent"}` }}
        animate={{ y: exiting ? "100%" : 0 }}
        transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
      />

      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ opacity: exiting ? 0 : 1 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center gap-6">
          <div className="nutbot-v2-scale nutbot-v2-scale-s shrink-0">
            <NutBotFaceV2 compact />
          </div>
          <div className="w-[26rem] font-[family-name:var(--font-display)] text-sm leading-7 select-none">
            {LINES.slice(0, visibleLines).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.12 }}
                style={{ color: colorFor[line.type] }}
              >
                {line.text}
              </motion.div>
            ))}
            {!exiting && visibleLines < LINE_COUNT && (
              <motion.span
                className="inline-block w-2 h-[1em] bg-[var(--accent-orange)] align-middle"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
            )}
          </div>
        </div>

        {visibleLines > 0 && !exiting && (
          <div
            className="absolute bottom-4 right-6 text-[0.65rem] tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            click or press any key to skip
          </div>
        )}
      </motion.div>
    </div>
  );
}
