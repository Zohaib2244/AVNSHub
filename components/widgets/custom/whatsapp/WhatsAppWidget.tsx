"use client";

import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";
import { timeAgo } from "@/lib/format";
import { useState, useRef, useEffect, type CSSProperties, type KeyboardEvent } from "react";
import { Send, Users, Wifi, WifiOff } from "lucide-react";

interface WAMessage {
  id: string;
  senderName: string;
  body: string;
  timestamp: number; // unix seconds
  fromMe: boolean;
}

interface WAData {
  messages: WAMessage[];
  groupName: string;
  participantCount: number;
  connected: boolean;
  error?: string;
}

// ── shared sub-components ────────────────────────────────────────────────────

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      aria-label={connected ? "connected" : "disconnected"}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: connected ? "var(--accent-cyan)" : "var(--accent-orange)",
        flexShrink: 0,
      }}
    />
  );
}

function MessageBubble({
  msg,
  compact = false,
}: {
  msg: WAMessage;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: msg.fromMe ? "flex-end" : "flex-start",
        gap: 2,
      }}
    >
      {!msg.fromMe && !compact && (
        <span
          className="block-label"
          style={{
            fontSize: "0.56rem",
            color: "var(--accent-cyan)",
            marginBottom: 0,
          }}
        >
          {msg.senderName}
        </span>
      )}
      <div
        style={{
          maxWidth: "88%",
          background: msg.fromMe ? "var(--accent-orange)" : "var(--bg-nested)",
          border: `1.5px solid ${msg.fromMe ? "var(--accent-orange)" : "var(--border)"}`,
          borderRadius: msg.fromMe ? "12px 12px 4px 12px" : "4px 12px 12px 12px",
          boxShadow: "2px 2px 0 var(--shadow)",
          color: msg.fromMe ? "var(--bg-card)" : "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: compact ? "0.65rem" : "0.7rem",
          lineHeight: 1.45,
          padding: compact ? "4px 8px" : "5px 10px",
          wordBreak: "break-word",
        }}
      >
        {compact ? `${msg.fromMe ? "" : `${msg.senderName}: `}${msg.body}` : msg.body}
      </div>
      <span
        className="block-sub"
        style={{ fontSize: "0.54rem", opacity: 0.5, lineHeight: 1 }}
      >
        {timeAgo(msg.timestamp * 1000)}
      </span>
    </div>
  );
}

const inputRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  marginTop: "auto",
  paddingTop: 8,
  borderTop: "1.5px solid var(--border)",
};

const textInputStyle: CSSProperties = {
  flex: 1,
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.7rem",
  lineHeight: 1,
  minWidth: 0,
  outline: "none",
  padding: "6px 10px",
};

const sendButtonStyle = (hasText: boolean, sending: boolean): CSSProperties => ({
  alignItems: "center",
  background: hasText && !sending ? "var(--accent-orange)" : "var(--bg-nested)",
  border: `1.5px solid ${hasText && !sending ? "var(--accent-orange)" : "var(--border)"}`,
  borderRadius: 10,
  boxShadow: hasText && !sending ? "2px 2px 0 var(--shadow)" : "none",
  color: hasText && !sending ? "var(--bg-card)" : "var(--text-muted)",
  cursor: hasText && !sending ? "pointer" : "default",
  display: "flex",
  flexShrink: 0,
  justifyContent: "center",
  padding: "6px 8px",
  transition: "background 0.1s, border-color 0.1s",
});

// ── main widget ──────────────────────────────────────────────────────────────

export function WhatsAppWidget() {
  const { size, settings } = useWidget();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const groupId = String(settings.groupId ?? "").trim();
  const limit = size === "S" ? 1 : size === "M" ? 5 : 20;
  const url = `/api/whatsapp?limit=${limit}${groupId ? `&groupId=${encodeURIComponent(groupId)}` : ""}`;

  const { data, refresh } = usePolling<WAData>(url, 10_000);

  useEffect(() => {
    if (size === "L" && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.messages, size]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, message: input.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "send failed");
      }
      setInput("");
      refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "send failed");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // ── error / loading states ─────────────────────────────────────────────────

  if (!data) {
    return (
      <div className="block-sub" style={{ opacity: 0.5 }}>
        connecting to bridge...
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="block-sub" style={{ color: "var(--accent-orange)" }}>
        {data.error}
      </div>
    );
  }

  const messages = data.messages ?? [];
  const lastMsg = messages[messages.length - 1];

  // ── S — glanceable single stat ─────────────────────────────────────────────

  if (size === "S") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ConnectionDot connected={data.connected} />
          <span
            className="block-value"
            style={{
              fontSize: "0.85rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.groupName || "whatsapp group"}
          </span>
        </div>
        {lastMsg ? (
          <div
            className="block-sub"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            <span style={{ color: "var(--accent-cyan)", marginRight: 4 }}>
              {lastMsg.fromMe ? "you" : lastMsg.senderName}:
            </span>
            {lastMsg.body}
          </div>
        ) : (
          <div className="block-sub" style={{ opacity: 0.45 }}>
            no messages
          </div>
        )}
        {lastMsg && (
          <div className="block-sub" style={{ opacity: 0.5, fontSize: "0.56rem" }}>
            {timeAgo(lastMsg.timestamp * 1000)}
          </div>
        )}
      </div>
    );
  }

  // ── M — compact list + send ────────────────────────────────────────────────

  if (size === "M") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ConnectionDot connected={data.connected} />
          <span
            className="block-value"
            style={{
              fontSize: "0.85rem",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.groupName || "whatsapp group"}
          </span>
          {data.participantCount > 0 && (
            <span
              className="block-sub"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexShrink: 0,
              }}
            >
              <Users size={11} strokeWidth={1.75} />
              {data.participantCount}
            </span>
          )}
        </div>

        {/* messages */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
          }}
        >
          {messages.length === 0 ? (
            <div className="block-sub" style={{ opacity: 0.45 }}>
              no messages yet
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} compact />
            ))
          )}
        </div>

        {/* send */}
        <div style={inputRowStyle}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={data.connected ? "message..." : "disconnected"}
            disabled={!data.connected || sending}
            style={textInputStyle}
            aria-label="send message"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending || !data.connected}
            aria-label="send"
            style={sendButtonStyle(!!input.trim() && data.connected, sending)}
          >
            <Send size={13} strokeWidth={1.75} />
          </button>
        </div>
        {sendError && (
          <div className="block-sub" style={{ color: "var(--accent-orange)", fontSize: "0.6rem" }}>
            {sendError}
          </div>
        )}
      </div>
    );
  }

  // ── L — full chat view ─────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingBottom: 8,
          borderBottom: "1.5px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {data.connected ? (
          <Wifi size={14} strokeWidth={1.75} style={{ color: "var(--accent-cyan)", flexShrink: 0 }} />
        ) : (
          <WifiOff size={14} strokeWidth={1.75} style={{ color: "var(--accent-orange)", flexShrink: 0 }} />
        )}
        <span
          className="block-value"
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {data.groupName || "whatsapp group"}
        </span>
        {data.participantCount > 0 && (
          <span
            className="block-sub"
            style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
          >
            <Users size={12} strokeWidth={1.75} />
            {data.participantCount} members
          </span>
        )}
        <span
          className="block-label"
          style={{
            fontSize: "0.58rem",
            color: data.connected ? "var(--accent-cyan)" : "var(--accent-orange)",
            flexShrink: 0,
            marginBottom: 0,
          }}
        >
          {data.connected ? "connected" : "disconnected"}
        </span>
      </div>

      {/* messages */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          paddingRight: 2,
        }}
      >
        {messages.length === 0 ? (
          <div className="block-sub" style={{ opacity: 0.45 }}>
            no messages yet
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* send */}
      <div style={{ flexShrink: 0 }}>
        <div style={inputRowStyle}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={data.connected ? "send as AVNBot · enter to send" : "bridge disconnected"}
            disabled={!data.connected || sending}
            style={{ ...textInputStyle, fontSize: "0.72rem" }}
            aria-label="send message"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending || !data.connected}
            aria-label="send"
            style={sendButtonStyle(!!input.trim() && data.connected, sending)}
          >
            <Send size={14} strokeWidth={1.75} />
          </button>
        </div>
        {sendError && (
          <div
            className="block-sub"
            style={{ color: "var(--accent-orange)", fontSize: "0.6rem", marginTop: 4 }}
          >
            {sendError}
          </div>
        )}
      </div>
    </div>
  );
}
