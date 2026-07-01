"use client";

import { type CSSProperties } from "react";
import { RefreshCw } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};

const panelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
  padding: "8px 9px",
};

const barOuterStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  height: 9,
  overflow: "hidden",
};

const iconButtonStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  display: "inline-flex",
  height: 25,
  justifyContent: "center",
  minWidth: 25,
  padding: 0,
};

type UsageMetric = {
  id: "session5h" | "weekly7d";
  label: string;
  percent: number | null;
  resetAt: string | null;
  resetMins: number | null;
};

type ClaudeUsagePayload = {
  ok: boolean;
  source: string;
  path: string;
  updatedAt: string | null;
  updatedAgoMs: number | null;
  metrics: UsageMetric[];
  error?: string;
};

const FALLBACK_METRICS: UsageMetric[] = [
  { id: "session5h", label: "5-hour", percent: null, resetAt: null, resetMins: null },
  { id: "weekly7d", label: "weekly", percent: null, resetAt: null, resetMins: null },
];

function numberSetting(value: unknown, fallback: number, min: number, max: number): number {
  const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, next));
}

function textSetting(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function clampPercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

function formatPercent(value: number | null): string {
  const percent = clampPercent(value);
  if (percent === null) return "--";
  if (percent >= 10 || percent % 1 === 0) return `${Math.round(percent)}%`;
  return `${percent.toFixed(1)}%`;
}

function formatReset(mins: number | null): string {
  if (mins === null) return "reset unknown";
  if (mins <= 0) return "resets now";

  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const minutes = Math.floor(mins % 60);

  if (days > 0 && hours > 0) return `resets in ${days}d ${hours}h`;
  if (days > 0) return `resets in ${days}d`;
  if (hours > 0 && minutes > 0) return `resets in ${hours}h ${minutes}m`;
  if (hours > 0) return `resets in ${hours}h`;
  return `resets in ${minutes}m`;
}

function formatAge(ms: number | null): string {
  if (ms === null) return "not synced";
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusColor(percent: number | null, stale: boolean): string {
  if (percent === null || stale) return "var(--text-muted)";
  if (percent >= 85) return "var(--accent-orange)";
  if (percent >= 60) return "var(--text-primary)";
  return "var(--accent-cyan)";
}

function pickPrimary(metrics: UsageMetric[]): UsageMetric {
  return metrics.reduce((best, metric) => {
    const bestPercent = clampPercent(best.percent) ?? -1;
    const nextPercent = clampPercent(metric.percent) ?? -1;
    return nextPercent > bestPercent ? metric : best;
  }, metrics[0] ?? FALLBACK_METRICS[0]);
}

function UsageBar({ metric, stale }: { metric: UsageMetric; stale: boolean }) {
  const percent = clampPercent(metric.percent);
  const color = statusColor(percent, stale);

  return (
    <div style={panelStyle}>
      <div style={{ alignItems: "baseline", display: "flex", gap: 6, justifyContent: "space-between", minWidth: 0 }}>
        <span className="block-label" style={labelStyle}>
          {metric.label}
        </span>
        <span className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.62rem" }}>
          {formatReset(metric.resetMins)}
        </span>
      </div>

      <div
        aria-label={`${metric.label} Claude usage`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
        role="meter"
        style={barOuterStyle}
      >
        <div
          style={{
            background: color,
            borderRadius: 12,
            height: "100%",
            width: `${percent ?? 0}%`,
          }}
        />
      </div>

      <div style={{ alignItems: "baseline", display: "flex", gap: 8, justifyContent: "space-between", minWidth: 0 }}>
        <span className="block-value" style={{ ...monoStyle, color, fontSize: "0.82rem" }}>
          {formatPercent(percent)}
        </span>
        <span
          className="block-sub"
          style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.62rem", textAlign: "right" }}
        >
          {percent === null ? "waiting for Claude Code" : `${formatPercent(100 - percent)} left`}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        height: "100%",
        justifyContent: "center",
        minWidth: 0,
        textAlign: "center",
      }}
    >
      <div className="block-label" style={labelStyle}>
        claude usage
      </div>
      <div className="block-value" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "1.25rem" }}>
        {label}
      </div>
      <div className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.62rem" }}>
        local cache
      </div>
    </div>
  );
}

export function ClaudeUsageWidget() {
  const { size, settings } = useWidget();
  const pollSeconds = numberSetting(settings.pollSeconds, 60, 15, 600);
  const staleAfterMins = numberSetting(settings.staleAfterMins, 20, 1, 1440);
  const cachePath = textSetting(settings.cachePath, "");
  const requestBody = cachePath ? { cachePath } : undefined;
  const { data, refresh } = usePolling<ClaudeUsagePayload>("/api/claude-usage", pollSeconds * 1000, requestBody);

  if (!data) return <EmptyState label="syncing" />;

  const metrics = data.metrics.length > 0 ? data.metrics : FALLBACK_METRICS;
  const primary = pickPrimary(metrics);
  const isStale = data.updatedAgoMs === null || data.updatedAgoMs > staleAfterMins * 60000;
  const primaryPercent = clampPercent(primary.percent);
  const primaryColor = statusColor(primaryPercent, isStale);
  const statusText = !data.ok ? data.error ?? "not connected" : isStale ? "stale" : "live";

  if (size === "S") {
    return (
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          height: "100%",
          justifyContent: "center",
          minWidth: 0,
          textAlign: "center",
        }}
      >
        <div className="block-label" style={labelStyle}>
          {primary.label}
        </div>
        <div className="block-value" style={{ ...monoStyle, color: primaryColor, fontSize: "1.85rem", lineHeight: 1 }}>
          {formatPercent(primaryPercent)}
        </div>
        <div className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.62rem" }}>
          {statusText}
        </div>
        <div className="block-sub" style={{ ...labelStyle, fontSize: "0.56rem" }}>
          {formatReset(primary.resetMins)}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: "100%",
        justifyContent: "center",
        minWidth: 0,
        padding: "0 2px",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <span className="block-label" style={labelStyle}>
            Claude Code
          </span>
          <span className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.62rem" }}>
            {statusText} - updated {formatAge(data.updatedAgoMs)}
          </span>
        </div>
        <button aria-label="Refresh Claude usage" onClick={refresh} style={iconButtonStyle} title="Refresh" type="button">
          <RefreshCw aria-hidden="true" size={13} strokeWidth={2.2} />
        </button>
      </div>

      {metrics.map((metric) => (
        <UsageBar key={metric.id} metric={metric} stale={isStale || !data.ok} />
      ))}
    </div>
  );
}
