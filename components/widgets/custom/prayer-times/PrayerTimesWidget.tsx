"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";
import { useCanvasSyncedState } from "@/lib/canvasStore";

type PrayerName = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";
const PRAYER_NAMES: PrayerName[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

type PrayerTime = { name: PrayerName; time: Date };
type Schedule = {
  nextIdx: number;
  currentIdx: number;
  nextTime: Date;
  minutesRemaining: number;
  closing: boolean;
};

type AladhanResponse = {
  data?: {
    timings?: Record<string, string>;
    date?: { readable?: string };
    meta?: { timezone?: string };
  };
};

type CachedTimes = {
  timings: Record<PrayerName, string>;
  fetchedAt: number;
  locationLabel: string;
};

type GeoState =
  | { kind: "pending" }
  | { kind: "coords"; lat: number; lon: number }
  | { kind: "none" };

function buildDefaultCache(): CachedTimes | null {
  return null;
}

function sanitizeCache(raw: unknown): CachedTimes | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.fetchedAt !== "number" || typeof r.locationLabel !== "string") return null;
  const rawTimings = r.timings;
  if (!rawTimings || typeof rawTimings !== "object") return null;
  const t = rawTimings as Record<string, unknown>;
  const timings = {} as Record<PrayerName, string>;
  for (const name of PRAYER_NAMES) {
    const value = t[name];
    if (typeof value !== "string") return null;
    timings[name] = value;
  }
  return { timings, fetchedAt: r.fetchedAt, locationLabel: r.locationLabel };
}

function hasCompleteTimings(raw: Record<string, string> | undefined | null): raw is Record<PrayerName, string> {
  if (!raw) return false;
  return PRAYER_NAMES.every((name) => typeof raw[name] === "string");
}

function parseTimeToday(hhmm: string, base: Date): Date {
  const clean = hhmm.split(" ")[0];
  const parts = clean.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const d = new Date(base);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function formatTime12(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function localDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const labelFontStyle: CSSProperties = { fontFamily: "var(--font-dot-gothic), monospace" };

const emptyWrapStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  height: "100%",
  justifyContent: "center",
  padding: "6px 10px",
  textAlign: "center",
  minWidth: 0,
};

const emptyMsgStyle: CSSProperties = {
  ...monoStyle,
  color: "var(--text-muted)",
  fontSize: "var(--fs-micro)",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const retryBtnStyle: CSSProperties = {
  ...labelFontStyle,
  background: "none",
  border: "1.5px solid var(--accent-orange)",
  borderRadius: 8,
  color: "var(--accent-orange)",
  cursor: "pointer",
  flex: "0 0 auto",
  fontSize: "var(--fs-micro)",
  letterSpacing: "0.08em",
  padding: "4px 10px",
  textTransform: "uppercase",
};

const metaStyle: CSSProperties = {
  ...labelFontStyle,
  color: "var(--text-muted-dim)",
  fontSize: "0.6rem",
  letterSpacing: "0.04em",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const staleBadgeStyle: CSSProperties = {
  ...labelFontStyle,
  background: "var(--bg-nested)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text-muted-dim)",
  flex: "0 0 auto",
  fontSize: "0.55rem",
  letterSpacing: "0.08em",
  padding: "1px 5px",
  textTransform: "uppercase",
};

function pillStyle(closing: boolean): CSSProperties {
  return {
    alignItems: "center",
    background: closing
      ? "color-mix(in srgb, var(--accent-orange) 14%, transparent)"
      : "color-mix(in srgb, var(--accent-orange) 8%, transparent)",
    border: "1.5px solid var(--accent-orange)",
    borderRadius: 20,
    display: "flex",
    gap: 6,
    minWidth: 0,
    padding: "5px 10px",
  };
}

function dotStyle(pulsing: boolean, accented: boolean): CSSProperties {
  return {
    animation: pulsing ? "prayer-times-pulse 1.1s ease-in-out infinite" : undefined,
    background: accented ? "var(--accent-orange)" : "var(--text-muted-dim)",
    borderRadius: "50%",
    flex: "0 0 auto",
    height: 6,
    width: 6,
  };
}

function rowWrapStyle(kind: "normal" | "current" | "next"): CSSProperties {
  return {
    alignItems: "center",
    background: kind === "current" ? "color-mix(in srgb, var(--accent-orange) 10%, transparent)" : "transparent",
    border: kind === "next" ? "1.5px solid var(--accent-orange)" : "1.5px solid transparent",
    borderRadius: 6,
    display: "flex",
    justifyContent: "space-between",
    minWidth: 0,
  };
}

export function PrayerTimesWidget() {
  const { preset, size, box, settings } = useWidget();
  const view: "badge" | "column" =
    preset === "badge" ? "badge" : preset === "column" ? "column" : size === "S" ? "badge" : "column";

  const manualCity = typeof settings.manualCity === "string" ? settings.manualCity.trim() : "";
  const notifyEnabled = settings.notify !== false;

  const [locationAttempt, setLocationAttempt] = useState(0);
  const [geo, setGeo] = useState<GeoState>({ kind: "pending" });

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeo({ kind: "none" });
      return;
    }
    let cancelled = false;
    setGeo({ kind: "pending" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setGeo({ kind: "coords", lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        if (cancelled) return;
        setGeo({ kind: "none" });
      },
      { maximumAge: 60 * 60 * 1000, timeout: 10_000 },
    );
    return () => {
      cancelled = true;
    };
  }, [locationAttempt]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const hasCoords = geo.kind === "coords";
  const useCity = !hasCoords && manualCity.length > 0;
  const hasLocation = hasCoords || useCity;

  const datePart = localDateParam(now);
  const apiUrl = hasCoords
    ? `/api/prayer-times?lat=${geo.lat}&lon=${geo.lon}&date=${datePart}`
    : useCity
      ? `/api/prayer-times?city=${encodeURIComponent(manualCity)}&date=${datePart}`
      : "/api/prayer-times";

  const { data, refresh } = usePolling<AladhanResponse>(apiUrl, 24 * 60 * 60 * 1000);

  const liveTimings = data?.data?.timings;
  const liveComplete = hasCompleteTimings(liveTimings);
  const liveLocationLabel = hasCoords ? data?.data?.meta?.timezone ?? "your location" : manualCity;

  const [cache, setCache] = useCanvasSyncedState<CachedTimes | null>(
    "prayer-times-cache",
    buildDefaultCache,
    sanitizeCache,
  );

  useEffect(() => {
    if (!liveComplete || !liveTimings) return;
    setCache({ timings: liveTimings, fetchedAt: Date.now(), locationLabel: liveLocationLabel });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liveTimings/liveLocationLabel derive from data
  }, [data]);

  const displayedTimings: Record<PrayerName, string> | null = liveComplete
    ? liveTimings
    : (cache?.timings ?? null);
  const isStale = !liveComplete && !!cache;
  const displayLocationLabel = liveComplete ? liveLocationLabel : (cache?.locationLabel ?? liveLocationLabel);

  const [showRetry, setShowRetry] = useState(false);
  useEffect(() => {
    if (displayedTimings) {
      setShowRetry(false);
      return;
    }
    const t = setTimeout(() => setShowRetry(true), 4000);
    return () => clearTimeout(t);
  }, [displayedTimings, apiUrl]);

  const dayKey = now.toDateString();
  const prayers = useMemo<PrayerTime[] | null>(() => {
    if (!displayedTimings) return null;
    return PRAYER_NAMES.map((name) => ({ name, time: parseTimeToday(displayedTimings[name], now) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only recompute when the day rolls over
  }, [displayedTimings, dayKey]);

  const schedule = useMemo<Schedule | null>(() => {
    if (!prayers) return null;
    let nextIdx = prayers.findIndex((p) => p.time.getTime() > now.getTime());
    let wrapped = false;
    if (nextIdx === -1) {
      nextIdx = 0;
      wrapped = true;
    }
    const currentIdx = (nextIdx - 1 + PRAYER_NAMES.length) % PRAYER_NAMES.length;
    let nextTime = prayers[nextIdx].time;
    if (wrapped) nextTime = new Date(nextTime.getTime() + 24 * 60 * 60 * 1000);
    const msRemaining = Math.max(0, nextTime.getTime() - now.getTime());
    const minutesRemaining = Math.round(msRemaining / 60_000);
    const closing = msRemaining > 0 && msRemaining <= 15 * 60 * 1000;
    return { nextIdx, currentIdx, nextTime, minutesRemaining, closing };
  }, [prayers, now]);

  const notificationsBlocked =
    notifyEnabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "denied";

  useEffect(() => {
    if (!notifyEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [notifyEnabled]);

  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!notifyEnabled || !prayers) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const key = now.toDateString();
    for (const p of prayers) {
      const diffMs = now.getTime() - p.time.getTime();
      if (diffMs >= 0 && diffMs < 60_000) {
        const notifyKey = `${key}-${p.name}`;
        if (!notifiedRef.current.has(notifyKey)) {
          notifiedRef.current.add(notifyKey);
          try {
            new Notification(`${p.name} - it's time`);
          } catch {
            // permission or platform may still refuse; skip silently
          }
        }
      }
    }
  }, [now, prayers, notifyEnabled]);

  function requestLocation() {
    setLocationAttempt((n) => n + 1);
  }

  function renderBadge(list: PrayerTime[], sched: Schedule): ReactNode {
    const next = list[sched.nextIdx];
    const showMeta = !box || box.height > 78;
    const compact = !!box && box.height <= 70;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", justifyContent: "center", minWidth: 0, padding: "0 2px" }}>
        <div style={pillStyle(sched.closing)}>
          <span style={dotStyle(sched.closing, true)} />
          <span
            style={{
              ...monoStyle,
              color: "var(--text-primary)",
              fontSize: compact ? "var(--fs-micro)" : "var(--fs-body)",
              fontWeight: 500,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {next.name} in <span style={{ color: "var(--accent-orange)" }}>{formatCountdown(sched.minutesRemaining)}</span>
          </span>
        </div>
        {showMeta && (
          <div style={metaStyle}>
            {sched.closing ? "closing in" : "next up"} - {formatTime12(next.time)}
            {isStale ? " - stale" : ""}
          </div>
        )}
      </div>
    );
  }

  function renderColumn(list: PrayerTime[], sched: Schedule): ReactNode {
    const next = list[sched.nextIdx];
    const roomy = !!box && box.height > 300;
    const showFooter = !!box && box.height > 260;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 2px" }}>
          <span style={{ ...labelFontStyle, color: "var(--text-muted-dim)", fontSize: "var(--fs-micro)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            next prayer
          </span>
          <span
            style={{
              ...monoStyle,
              color: "var(--accent-orange)",
              fontSize: roomy ? "1.5rem" : "1rem",
              fontWeight: 500,
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {next.name}
            {sched.closing && (
              <span style={{ ...labelFontStyle, color: "var(--accent-orange)", fontSize: "0.55rem", letterSpacing: "0.1em", marginLeft: 6, textTransform: "uppercase" }}>
                closing soon
              </span>
            )}
          </span>
          <span
            style={{
              ...monoStyle,
              color: sched.closing ? "var(--accent-orange)" : "var(--text-muted)",
              fontSize: roomy ? "var(--fs-lead)" : "var(--fs-micro)",
            }}
          >
            in {formatCountdown(sched.minutesRemaining)}
          </span>
        </div>
        <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", gap: 2, justifyContent: "space-between", minHeight: 0, overflowY: "auto", padding: "0 2px" }}>
          {list.map((p, idx) => {
            const kind: "normal" | "current" | "next" = idx === sched.currentIdx ? "current" : idx === sched.nextIdx ? "next" : "normal";
            const isClosingRow = idx === sched.nextIdx && sched.closing;
            return (
              <div key={p.name} style={{ ...rowWrapStyle(kind), padding: roomy ? "6px 10px" : "3px 8px" }}>
                <span
                  style={{
                    ...labelFontStyle,
                    alignItems: "center",
                    color: kind === "normal" ? "var(--text-muted)" : "var(--text-primary)",
                    display: "flex",
                    fontSize: roomy ? "var(--fs-body)" : "var(--fs-micro)",
                    gap: 5,
                    letterSpacing: "0.08em",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={dotStyle(isClosingRow, kind !== "normal")} />
                  {p.name}
                </span>
                <span
                  style={{
                    ...monoStyle,
                    color: "var(--text-primary)",
                    flex: "0 0 auto",
                    fontSize: roomy ? "var(--fs-body)" : "var(--fs-micro)",
                    fontWeight: 500,
                  }}
                >
                  {formatTime12(p.time)}
                </span>
              </div>
            );
          })}
        </div>
        {showFooter && (
          <div style={{ alignItems: "center", display: "flex", gap: 6, minWidth: 0, padding: "0 2px" }}>
            <MapPin size={11} strokeWidth={1.75} style={{ color: "var(--text-muted-dim)", flex: "0 0 auto" }} />
            <span style={{ ...metaStyle, flex: "1 1 auto", minWidth: 0 }}>
              {notificationsBlocked ? "notifications blocked" : notifyEnabled ? "notifications on" : "notifications off"}
              {displayLocationLabel ? ` - ${displayLocationLabel}` : ""}
            </span>
            {isStale && <span style={staleBadgeStyle}>stale</span>}
          </div>
        )}
      </div>
    );
  }

  let content: ReactNode;
  if (!hasLocation) {
    content = (
      <div style={emptyWrapStyle}>
        <span style={emptyMsgStyle}>no location set</span>
        <button type="button" style={retryBtnStyle} onClick={requestLocation}>
          enable location
        </button>
      </div>
    );
  } else if (!(prayers && schedule)) {
    content = showRetry ? (
      <div style={emptyWrapStyle}>
        <span style={emptyMsgStyle}>unable to load times</span>
        <button type="button" style={retryBtnStyle} onClick={refresh}>
          retry
        </button>
      </div>
    ) : (
      <div style={emptyWrapStyle}>
        <span style={emptyMsgStyle}>loading times...</span>
      </div>
    );
  } else {
    const readyPrayers = prayers;
    const readySchedule = schedule;
    content = view === "badge" ? renderBadge(readyPrayers, readySchedule) : renderColumn(readyPrayers, readySchedule);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, width: "100%" }}>
      <style>{`
@keyframes prayer-times-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-orange) 55%, transparent); }
  50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-orange) 0%, transparent); }
}
`}</style>
      {content}
    </div>
  );
}
