"use client";

import { useWidget } from "@/components/framework/WidgetContext";
import { MessageCircle, Sparkles, TerminalSquare } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

type Tone = "warm" | "focus" | "bright";

const TONES: Record<
  Tone,
  {
    badge: string;
    detail: string;
    signal: string;
    accent: "accent" | "teal";
  }
> = {
  warm: {
    badge: "open signal",
    detail: "soft check-in ready",
    signal: "good to see you",
    accent: "accent",
  },
  focus: {
    badge: "focus line",
    detail: "clear lane active",
    signal: "locked in",
    accent: "teal",
  },
  bright: {
    badge: "bright ping",
    detail: "high-energy hello",
    signal: "spark mode",
    accent: "accent",
  },
};

function textSetting(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function toneSetting(value: unknown): Tone {
  return value === "focus" || value === "bright" ? value : "warm";
}

function boolSetting(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

const rowStyle: CSSProperties = {
  alignItems: "center",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  display: "flex",
  gap: 8,
  justifyContent: "space-between",
  minWidth: 0,
  padding: "7px 9px",
};

function MiniBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="block-label"
      style={{
        border: "1.5px solid var(--border)",
        borderRadius: 12,
        boxShadow: "2px 2px 0 var(--shadow)",
        color: "var(--accent-cyan)",
        display: "inline-flex",
        marginBottom: 0,
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
        padding: "4px 7px",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="more-row" style={rowStyle}>
      <span
        className="more-meta"
        style={{
          alignItems: "center",
          display: "inline-flex",
          gap: 6,
          minWidth: 0,
        }}
      >
        {icon}
        {label}
      </span>
      <span
        className="block-value"
        style={{
          fontSize: "0.78rem",
          maxWidth: "55%",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function HelloWidget() {
  const { size, settings } = useWidget();
  const name = textSetting(settings.name, "friend");
  const greeting = textSetting(settings.greeting, "hello");
  const note = textSetting(settings.note, "welcome back to the hub");
  const tone = toneSetting(settings.tone);
  const showDetails = boolSetting(settings.showDetails, true);
  const toneCopy = TONES[tone];

  if (size === "S") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 7,
          minWidth: 0,
        }}
      >
        <MiniBadge>
          <MessageCircle size={10} strokeWidth={1.75} />
          {toneCopy.badge}
        </MiniBadge>
        <div
          className={`block-value ${toneCopy.accent}`}
          style={{ fontSize: "1.55rem", lineHeight: 1.05 }}
        >
          {greeting}
        </div>
        <div
          className="block-sub"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div
        style={{
          display: "grid",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
          <div
            style={{
              alignItems: "center",
              background: "var(--bg-nested)",
              border: "1.5px solid var(--border)",
              borderRadius: 14,
              boxShadow: "2px 2px 0 var(--shadow)",
              color: "var(--accent-orange)",
              display: "inline-flex",
              flexShrink: 0,
              height: 38,
              justifyContent: "center",
              width: 38,
            }}
          >
            <MessageCircle size={19} strokeWidth={1.75} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className={`block-value ${toneCopy.accent}`}
              style={{ lineHeight: 1.1 }}
            >
              {greeting}, {name}
            </div>
            <div className="block-sub">{note}</div>
          </div>
        </div>
        {showDetails && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 7,
            }}
          >
            <MiniBadge>
              <Sparkles size={10} strokeWidth={1.75} />
              {toneCopy.signal}
            </MiniBadge>
            <MiniBadge>
              <TerminalSquare size={10} strokeWidth={1.75} />
              {toneCopy.detail}
            </MiniBadge>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
        <div
          style={{
            alignItems: "center",
            background: "var(--bg-nested)",
            border: "1.5px solid var(--border)",
            borderRadius: 16,
            boxShadow: "3px 3px 0 var(--shadow)",
            color: "var(--accent-cyan)",
            display: "inline-flex",
            flexShrink: 0,
            height: 48,
            justifyContent: "center",
            width: 48,
          }}
        >
          <MessageCircle size={24} strokeWidth={1.75} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="block-label" style={{ marginBottom: 4 }}>
            personal ping
          </div>
          <div
            className={`block-value ${toneCopy.accent}`}
            style={{ fontSize: "1.65rem", lineHeight: 1.1 }}
          >
            {greeting}, {name}
          </div>
          <div className="block-sub">{note}</div>
        </div>
      </div>

      {showDetails && (
        <div style={{ display: "grid", gap: 8 }}>
          <div className="more-head">hello packet</div>
          <DetailRow
            icon={<Sparkles size={11} strokeWidth={1.75} />}
            label="tone"
            value={tone}
          />
          <DetailRow
            icon={<MessageCircle size={11} strokeWidth={1.75} />}
            label="signal"
            value={toneCopy.signal}
          />
          <DetailRow
            icon={<TerminalSquare size={11} strokeWidth={1.75} />}
            label="status"
            value={toneCopy.detail}
          />
        </div>
      )}
    </div>
  );
}
