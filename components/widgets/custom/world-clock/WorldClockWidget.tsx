"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

type ClockLocation = {
  label: string;
  timeZone: string;
};

type AlarmRule = {
  id: string;
  label: string;
  timeZone: string;
  hour: number;
  minute: number;
};

const DEFAULT_CLOCKS = "Karachi|Asia/Karachi, London|Europe/London, New York|America/New_York, Tokyo|Asia/Tokyo";
const DEFAULT_ALARMS = "Karachi|09:00, Tokyo|21:30";

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
};

const panelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
  boxShadow: "2px 2px 0 var(--shadow)",
};

const buttonResetStyle: CSSProperties = {
  appearance: "none",
  background: "transparent",
  border: 0,
  color: "inherit",
  font: "inherit",
  margin: 0,
  padding: 0,
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function labelFromTimeZone(timeZone: string) {
  const zonePart = timeZone.split("/").pop() ?? timeZone;
  return zonePart.replace(/_/g, " ");
}

function splitSettingList(value: string) {
  return value
    .split(/[\n;,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseClockToken(token: string): ClockLocation | null {
  const separator = token.includes("|") ? "|" : token.includes("=") ? "=" : "";
  const rawLabel = separator ? token.slice(0, token.indexOf(separator)).trim() : "";
  const rawZone = separator ? token.slice(token.indexOf(separator) + 1).trim() : token.trim();
  const timeZone = rawZone || rawLabel;

  if (!isValidTimeZone(timeZone)) return null;

  return {
    label: rawLabel || labelFromTimeZone(timeZone),
    timeZone,
  };
}

function parseClocks(value: string) {
  const seen = new Set<string>();
  const clocks = splitSettingList(value)
    .map(parseClockToken)
    .filter((clock): clock is ClockLocation => Boolean(clock))
    .filter((clock) => {
      const key = normalize(clock.timeZone);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (clocks.length > 0) return clocks.slice(0, 8);

  return splitSettingList(DEFAULT_CLOCKS)
    .map(parseClockToken)
    .filter((clock): clock is ClockLocation => Boolean(clock));
}

function parseAlarmToken(token: string, clocks: ClockLocation[]): AlarmRule | null {
  const match = token.match(/^(.+?)(?:\s*[|@=]\s*|\s+)(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const target = match[1]?.trim() ?? "";
  const hour = Number(match[2]);
  const minute = Number(match[3]);

  if (!target || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const clock =
    clocks.find((item) => normalize(item.label) === normalize(target)) ??
    clocks.find((item) => normalize(item.timeZone) === normalize(target));

  if (!clock) return null;

  return {
    id: `${clock.timeZone}-${hour}-${minute}`,
    label: clock.label,
    timeZone: clock.timeZone,
    hour,
    minute,
  };
}

function parseAlarms(value: string, clocks: ClockLocation[]) {
  return splitSettingList(value)
    .map((token) => parseAlarmToken(token, clocks))
    .filter((alarm): alarm is AlarmRule => Boolean(alarm))
    .slice(0, 12);
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    hour: Number(byType.hour ?? 0),
    minute: Number(byType.minute ?? 0),
    second: Number(byType.second ?? 0),
  };
}

function formatTime(date: Date, timeZone: string, showSeconds: boolean, hourMode: "12" | "24") {
  const options: Intl.DateTimeFormatOptions = {
    hour: hourMode === "12" ? "numeric" : "2-digit",
    minute: "2-digit",
    timeZone,
  };

  if (showSeconds) options.second = "2-digit";
  if (hourMode === "12") options.hour12 = true;
  else options.hourCycle = "h23";

  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function formatDateLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone,
    weekday: "short",
  }).format(date);
}

function formatAlarmTime(alarm: AlarmRule) {
  return `${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")}`;
}

function useClockNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeoutId = window.setTimeout(function tick() {
      setNow(new Date());
      timeoutId = window.setTimeout(tick, 500);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return now;
}

function GlyphLightBar({
  active,
  compact = false,
  onClick,
  phase,
}: {
  active: boolean;
  compact?: boolean;
  onClick: () => void;
  phase: number;
}) {
  const count = compact ? 6 : 10;
  const bars = Array.from({ length: count });

  return (
    <button
      aria-label={active ? "alarm ringing" : "alarm quiet"}
      disabled={!active}
      onClick={active ? onClick : undefined}
      style={{
        ...buttonResetStyle,
        alignItems: "center",
        cursor: active ? "pointer" : "default",
        display: "flex",
        gap: compact ? 3 : 4,
        justifyContent: "center",
        opacity: active ? 1 : 0.72,
        width: "100%",
      }}
      type="button"
    >
      {bars.map((_, index) => {
        const lit = active && (phase + index) % 3 !== 1;
        const hot = active && (phase + index) % 4 === 0;

        return (
          <span
            key={index}
            style={{
              background: lit ? (hot ? "var(--accent-cyan)" : "var(--accent-orange)") : "var(--bg-card)",
              border: "1.5px solid var(--border)",
              borderRadius: 12,
              boxShadow: lit ? "2px 2px 0 var(--shadow)" : "none",
              display: "block",
              height: compact ? 13 : 18,
              opacity: active ? (lit ? 1 : 0.36) : 0.42,
              width: compact ? 6 : 9,
            }}
          />
        );
      })}
    </button>
  );
}

function ClockRow({
  clock,
  date,
  hourMode,
  ringing,
  showSeconds,
}: {
  clock: ClockLocation;
  date: Date;
  hourMode: "12" | "24";
  ringing: boolean;
  showSeconds: boolean;
}) {
  return (
    <div
      className="more-row"
      style={{
        ...panelStyle,
        alignItems: "center",
        display: "grid",
        gap: 8,
        gridTemplateColumns: "minmax(0, 1fr) auto",
        padding: "7px 9px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="block-label" style={{ ...labelStyle, color: ringing ? "var(--accent-orange)" : "var(--text-muted)" }}>
          {clock.label}
        </div>
        <div className="block-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {formatDateLabel(date, clock.timeZone)}
        </div>
      </div>
      <div
        className={ringing ? "block-value accent" : "block-value"}
        style={{ ...monoStyle, fontSize: "1rem", lineHeight: 1, whiteSpace: "nowrap" }}
      >
        {formatTime(date, clock.timeZone, showSeconds, hourMode)}
      </div>
    </div>
  );
}

function AlarmRow({ alarm, ringing }: { alarm: AlarmRule; ringing: boolean }) {
  return (
    <div
      className="more-row"
      style={{
        alignItems: "center",
        display: "grid",
        gap: 8,
        gridTemplateColumns: "minmax(0, 1fr) auto",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="block-label" style={{ ...labelStyle, color: ringing ? "var(--accent-orange)" : "var(--text-muted)" }}>
          {alarm.label}
        </div>
        <div className="block-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {alarm.timeZone}
        </div>
      </div>
      <div className={ringing ? "block-value accent" : "block-value"} style={{ ...monoStyle, fontSize: "0.92rem", whiteSpace: "nowrap" }}>
        {formatAlarmTime(alarm)}
      </div>
    </div>
  );
}

export function WorldClockWidget() {
  const { settings, size } = useWidget();
  const now = useClockNow();
  const [showRinging, setShowRinging] = useState(false);

  const clockSetting = typeof settings.clocks === "string" ? settings.clocks : DEFAULT_CLOCKS;
  const alarmSetting = typeof settings.alarms === "string" ? settings.alarms : DEFAULT_ALARMS;
  const showSeconds = settings.showSeconds === true;
  const hourMode: "12" | "24" = settings.hourMode === "12" ? "12" : "24";

  const clocks = useMemo(() => parseClocks(clockSetting), [clockSetting]);
  const alarms = useMemo(() => parseAlarms(alarmSetting, clocks), [alarmSetting, clocks]);

  const ringingAlarms = useMemo(
    () =>
      alarms.filter((alarm) => {
        const parts = localParts(now, alarm.timeZone);
        return parts.hour === alarm.hour && parts.minute === alarm.minute;
      }),
    [alarms, now],
  );

  const activeAlarmIds = useMemo(() => new Set(ringingAlarms.map((alarm) => alarm.id)), [ringingAlarms]);
  const phase = Math.floor(now.getTime() / 500);
  const firstClock = clocks[0];
  const firstRingingAlarm = ringingAlarms[0] ?? null;
  const hasRinging = ringingAlarms.length > 0;

  useEffect(() => {
    if (!hasRinging) setShowRinging(false);
  }, [hasRinging]);

  if (!firstClock) {
    return (
      <div style={{ alignItems: "center", display: "flex", height: "100%", justifyContent: "center", textAlign: "center" }}>
        <div>
          <div className="block-value" style={monoStyle}>
            --:--
          </div>
          <div className="block-sub">no clocks</div>
        </div>
      </div>
    );
  }

  if (size === "S") {
    return (
      <div
        aria-live={hasRinging ? "assertive" : "polite"}
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: 7,
          height: "100%",
          justifyContent: "center",
          minWidth: 0,
          textAlign: "center",
        }}
      >
        <GlyphLightBar active={hasRinging} compact onClick={() => setShowRinging((value) => !value)} phase={phase} />
        <div className="block-label" style={{ ...labelStyle, color: hasRinging ? "var(--accent-orange)" : "var(--text-muted)" }}>
          {showRinging && firstRingingAlarm ? firstRingingAlarm.label : firstClock.label}
        </div>
        <div className={hasRinging ? "block-value accent" : "block-value"} style={{ ...monoStyle, fontSize: "1.45rem", lineHeight: 1 }}>
          {showRinging && firstRingingAlarm ? formatAlarmTime(firstRingingAlarm) : formatTime(now, firstClock.timeZone, false, hourMode)}
        </div>
        <div className="block-sub" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {hasRinging ? "alarm active" : formatDateLabel(now, firstClock.timeZone)}
        </div>
      </div>
    );
  }

  const visibleClocks = clocks.slice(0, size === "L" ? 8 : 4);

  return (
    <div
      aria-live={hasRinging ? "assertive" : "polite"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 9,
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: 10,
          gridTemplateColumns: "minmax(0, 1fr) minmax(86px, 0.7fr)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="block-label" style={labelStyle}>
            world clock
          </div>
          <div className={hasRinging ? "block-value accent" : "block-value"} style={{ ...monoStyle, fontSize: "1.25rem", lineHeight: 1.05 }}>
            {hasRinging ? "alarm" : formatTime(now, firstClock.timeZone, showSeconds, hourMode)}
          </div>
          <div className="block-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {hasRinging ? `${ringingAlarms.length} ringing` : `${clocks.length} clocks / ${alarms.length} alarms`}
          </div>
        </div>
        <div style={{ ...panelStyle, padding: "8px 9px" }}>
          <GlyphLightBar active={hasRinging} onClick={() => setShowRinging((value) => !value)} phase={phase} />
        </div>
      </div>

      {hasRinging && showRinging && (
        <div style={{ ...panelStyle, padding: "8px 9px" }}>
          <div className="more-head">ringing</div>
          {ringingAlarms.map((alarm) => (
            <AlarmRow alarm={alarm} key={alarm.id} ringing />
          ))}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gap: 7,
          gridTemplateColumns: size === "L" ? "repeat(2, minmax(0, 1fr))" : "1fr",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {visibleClocks.map((clock) => (
          <ClockRow
            clock={clock}
            date={now}
            hourMode={hourMode}
            key={clock.timeZone}
            ringing={ringingAlarms.some((alarm) => alarm.timeZone === clock.timeZone)}
            showSeconds={showSeconds}
          />
        ))}
      </div>

      {size === "L" && (
        <div style={{ ...panelStyle, display: "flex", flexDirection: "column", gap: 7, minHeight: 0, overflow: "hidden", padding: "9px" }}>
          <div className="more-head">armed alarms</div>
          {alarms.length > 0 ? (
            alarms.slice(0, 6).map((alarm) => <AlarmRow alarm={alarm} key={alarm.id} ringing={activeAlarmIds.has(alarm.id)} />)
          ) : (
            <div className="block-sub">no alarms armed</div>
          )}
        </div>
      )}
    </div>
  );
}
