"use client";

// Client side of NutBot's realtime log.
//
// The feed this replaces ticked a canned line every 1.8s, which meant the UI
// never had to think about time. Real service activity is the opposite: a burst
// when something happens, then silence for hours. That drives the three things
// this hook exists to get right —
//   * `live` marks lines that arrived while watching, so the replayed backlog
//     can render instantly instead of animating 250 rows in at once
//   * repeats collapse into a count rather than appending duplicate rows
//   * `status` distinguishes "nothing is happening" from "the feed is broken",
//     which a silent feed cannot otherwise express

import { useEffect, useMemo, useRef, useState } from "react";

export type LogLevel = "ok" | "info" | "warn" | "err" | "log";

export type ServiceLogLine = {
  id: number;
  at: number;
  level: LogLevel;
  service: string;
  text: string;
  source: "lifecycle" | "stdout";
  repeat: number;
  /** arrived while this client was watching (vs. replayed from the buffer) */
  live: boolean;
};

export type FeedStatus = { connected: boolean; detail: string };

/** hard ceiling regardless of the widget's own setting — the server ring
    buffer is 250, and holding more than this client-side buys nothing */
const MAX_LINES = 200;
// stable identities so the off state doesn't hand consumers a fresh array each render
const EMPTY_LINES: ServiceLogLine[] = [];
const OFF_STATUS: FeedStatus = { connected: false, detail: "off" };

/** "redis, -db" -> matches any service name containing either fragment */
function muteMatcher(raw: string): (service: string) => boolean {
  const patterns = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return () => false;
  return (service) => {
    const name = service.toLowerCase();
    return patterns.some((p) => name.includes(p));
  };
}

export function useServiceLog(options: {
  enabled: boolean;
  lifecycle: boolean;
  stdout: boolean;
  mute: string;
  maxLines: number;
}): { lines: ServiceLogLine[]; status: FeedStatus } {
  const { enabled, lifecycle, stdout, mute, maxLines } = options;
  const limit = Math.max(1, Math.min(MAX_LINES, Math.floor(maxLines) || MAX_LINES));
  const active = enabled && (lifecycle || stdout);
  const [lines, setLines] = useState<ServiceLogLine[]>([]);
  const [status, setStatus] = useState<FeedStatus>({ connected: false, detail: "off" });
  // Lines replayed from the server buffer arrive in the same burst as the
  // initial status frame; anything after that first tick is genuinely live.
  const replayingRef = useRef(true);

  useEffect(() => {
    // No setState in the effect body — the "off" shape is derived at the
    // return instead, so disabling the feed can't cascade a render.
    if (!active) return;

    replayingRef.current = true;
    const params = new URLSearchParams({
      lifecycle: lifecycle ? "1" : "0",
      stdout: stdout ? "1" : "0",
    });
    const source = new EventSource(`/api/service-log?${params}`);

    // The backlog replays synchronously on connect; give it one macrotask to
    // land before treating arrivals as live, so it renders without animation.
    const settle = setTimeout(() => {
      replayingRef.current = false;
    }, 250);

    source.onmessage = (message) => {
      let event: unknown;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!event || typeof event !== "object") return;
      const payload = event as Record<string, unknown>;

      if (payload.type === "status") {
        setStatus({ connected: Boolean(payload.connected), detail: String(payload.detail ?? "") });
        return;
      }

      if (payload.type === "repeat") {
        const id = Number(payload.id);
        setLines((prev) =>
          prev.map((line) =>
            line.id === id ? { ...line, repeat: Number(payload.repeat), at: Number(payload.at) } : line,
          ),
        );
        return;
      }

      if (payload.type === "line" && payload.line && typeof payload.line === "object") {
        const incoming = payload.line as Omit<ServiceLogLine, "live">;
        const line: ServiceLogLine = { ...incoming, live: !replayingRef.current };
        setLines((prev) => {
          // EventSource reconnects on its own, and the server replays its whole
          // ring buffer to every new connection — so without this an idle
          // network blip would duplicate the entire feed. Ids are assigned
          // server-side and monotonic, which makes them the natural identity.
          if (prev.some((existing) => existing.id === line.id)) return prev;
          const next = [...prev, line];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
      }
    };

    source.onerror = () => {
      // EventSource reconnects on its own; report it so silence stays legible
      setStatus({ connected: false, detail: "reconnecting" });
    };

    return () => {
      clearTimeout(settle);
      source.close();
    };
  }, [active, lifecycle, stdout]);

  const isMuted = useMemo(() => muteMatcher(mute), [mute]);
  const visible = useMemo(() => {
    const kept = lines.filter((line) => !isMuted(line.service));
    // Trim at display time rather than on ingest: muting a chatty service
    // should reveal more history, not leave the list short.
    return kept.length > limit ? kept.slice(kept.length - limit) : kept;
  }, [lines, isMuted, limit]);

  if (!active) return { lines: EMPTY_LINES, status: OFF_STATUS };
  return { lines: visible, status };
}
