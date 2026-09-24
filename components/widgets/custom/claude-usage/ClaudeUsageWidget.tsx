"use client";

import { type CSSProperties, useState } from "react";
import { Clock } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";
import { formatDuration } from "@/lib/format";

type UsageWindow = {
  percentUsed: number;
  resetsAt: string | null;
  resetsLabel: string | null;
};

type ClaudeUsageResponse = {
  available: boolean;
  session: UsageWindow | null;
  week: UsageWindow | null;
  fetchedAt: string;
  error?: string;
};

type Tab = "session" | "week";

const labelStyle: CSSProperties = {
  color: "var(--text-muted-dim)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const tabRowStyle: CSSProperties = {
  display: "flex",
  flex: "0 0 auto",
  gap: 4,
  justifyContent: "flex-end",
};

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    background: active ? "var(--accent-cyan)" : "var(--bg-nested)",
    border: `1.5px solid ${active ? "var(--accent-cyan)" : "var(--border)"}`,
    borderRadius: 6,
    color: active ? "var(--bg-card)" : "var(--text-muted-dim)",
    cursor: "pointer",
    fontFamily: "var(--font-dot-gothic), monospace",
    fontSize: "0.62rem",
    letterSpacing: "0.08em",
    padding: "3px 8px",
    textTransform: "uppercase",
    transition: "color 0.15s, border-color 0.15s, background 0.15s",
  };
}

function barTrackStyle(height: number): CSSProperties {
  return {
    background: "var(--bg-nested)",
    border: "1px solid var(--border)",
    borderRadius: height,
    flex: "0 0 auto",
    height,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  };
}

function barFillStyle(percent: number, warn: boolean): CSSProperties {
  return {
    background: warn ? "var(--accent-orange)" : "var(--accent-cyan)",
    borderRadius: 5,
    height: "100%",
    width: `${Math.max(0, Math.min(100, percent))}%`,
  };
}

function percentLeft(win: UsageWindow): number {
  return Math.max(0, Math.min(100, 100 - win.percentUsed));
}

function resetClockText(win: UsageWindow): string {
  if (win.resetsAt) {
    const parsed = new Date(win.resetsAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
  }
  return win.resetsLabel ?? "";
}

function countdownText(win: UsageWindow): string | null {
  if (!win.resetsAt) return null;
  const ms = new Date(win.resetsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return formatDuration(Math.max(0, Math.round(ms / 1000)));
}

export function ClaudeUsageWidget() {
  const { size } = useWidget();
  const [tab, setTab] = useState<Tab>("session");
  const { data } = usePolling<ClaudeUsageResponse>("/api/claude-usage", 60_000);

  const win = data ? (tab === "session" ? data.session : data.week) : null;

  const tabs = (
    <div style={tabRowStyle}>
      <button onClick={() => setTab("session")} style={tabBtnStyle(tab === "session")} type="button">
        {size === "S" ? "5H" : "5 Hour"}
      </button>
      <button onClick={() => setTab("week")} style={tabBtnStyle(tab === "week")} type="button">
        {size === "S" ? "WK" : "Weekly"}
      </button>
    </div>
  );

  if (!data) {
    return (
      <div style={{ alignItems: "center", display: "flex", height: "100%", justifyContent: "center" }}>
        <span style={{ ...labelStyle, color: "var(--text-muted)" }}>checking usage...</span>
      </div>
    );
  }

  if (!data.available || !win) {
    return (
      <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 6, height: "100%", justifyContent: "center", padding: "0 12px", textAlign: "center" }}>
        <span style={{ ...labelStyle, color: "var(--text-muted)" }}>claude cli unavailable</span>
        {data.error && size !== "S" && (
          <span style={{ ...monoStyle, color: "var(--text-muted-dim)", fontSize: "var(--fs-micro)", overflowWrap: "anywhere" }}>
            {data.error}
          </span>
        )}
      </div>
    );
  }

  const left = percentLeft(win);
  const warn = left < 50;
  const countdown = countdownText(win);

  if (size === "S") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", justifyContent: "center", minWidth: 0, overflow: "hidden" }}>
        {tabs}
        <div style={{ alignItems: "baseline", display: "flex", gap: 6, minWidth: 0 }}>
          <span className="block-value" style={{ ...monoStyle, color: warn ? "var(--accent-orange)" : "var(--text-primary)", flex: "0 0 auto", fontFamily: "var(--font-dot-gothic), monospace", fontSize: "1.6rem", lineHeight: 1 }}>
            {left}%
          </span>
          <span style={labelStyle}>left</span>
        </div>
        <div style={barTrackStyle(7)}>
          <div style={barFillStyle(left, warn)} />
        </div>
        {countdown && (
          <div style={{ alignItems: "center", color: "var(--text-muted)", display: "flex", gap: 4, fontSize: "var(--fs-micro)", ...monoStyle }}>
            <Clock size={11} strokeWidth={1.75} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{countdown}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minWidth: 0, overflow: "hidden" }}>
      {tabs}
      <div style={{ alignItems: "center", display: "flex", flex: "1 1 auto", gap: 20, minHeight: 0 }}>
        <span className="block-value" style={{ ...monoStyle, color: warn ? "var(--accent-orange)" : "var(--text-primary)", flex: "0 0 auto", fontFamily: "var(--font-dot-gothic), monospace", fontSize: "var(--fs-stat)", lineHeight: 1 }}>
          {left}%
        </span>
        <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "var(--fs-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {win.percentUsed}% used
          </span>
          <div style={barTrackStyle(8)}>
            <div style={barFillStyle(left, warn)} />
          </div>
          <div style={{ alignItems: "center", color: "var(--text-muted)", display: "flex", gap: 5, fontSize: "var(--fs-micro)", minWidth: 0, ...monoStyle }}>
            <Clock size={11} strokeWidth={1.75} style={{ flex: "0 0 auto" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              resets {resetClockText(win)}
              {countdown ? ` - in ${countdown}` : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
