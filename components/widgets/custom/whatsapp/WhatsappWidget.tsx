"use client";

import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageCircle, RefreshCw, Send, Users, WifiOff } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";

type NutbotBackend = "bonfire" | "claude" | "codex" | "opencode";
type NutbotTrigger = "latest" | "mention";

const MENTION_RE = /@nutbot\b/i;
const NUTBOT_CONTEXT_MESSAGES = 10;

function lastHandledKey(groupId: string): string {
  return `nutmag-whatsapp-lastid-${groupId}`;
}

function conversationKey(groupId: string): string {
  return `nutmag-whatsapp-conv-${groupId}`;
}

function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

type WhatsAppResponse = {
  connected?: boolean;
  online?: boolean;
  error?: string;
  groupName?: string;
  name?: string;
  subject?: string;
  participantCount?: number;
  participantsCount?: number;
  memberCount?: number;
  participants?: unknown;
  messages?: unknown;
};

type NormalizedMessage = {
  id: string;
  fromMe: boolean;
  sender: string;
  text: string;
  timestamp: string;
};

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 8,
  justifyContent: "space-between",
  minWidth: 0,
};

const titleWrapStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 7,
  minWidth: 0,
};

const groupTitleStyle: CSSProperties = {
  ...monoStyle,
  color: "var(--text-primary)",
  fontSize: "0.9rem",
  fontWeight: 700,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const metaRowStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  minWidth: 0,
};

const iconButtonStyle: CSSProperties = {
  alignItems: "center",
  appearance: "none",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  display: "inline-flex",
  flex: "0 0 auto",
  height: 28,
  justifyContent: "center",
  padding: 0,
  width: 28,
};

const noticeStyle: CSSProperties = {
  ...labelStyle,
  alignItems: "center",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  display: "flex",
  gap: 6,
  padding: "6px 8px",
};

const listStyle: CSSProperties = {
  display: "flex",
  flex: "1 1 auto",
  flexDirection: "column",
  gap: 6,
  minHeight: 0,
  overflowY: "auto",
  paddingRight: 2,
};

const composerStyle: CSSProperties = {
  display: "flex",
  flex: "0 0 auto",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const composerRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  minWidth: 0,
};

const inputStyle: CSSProperties = {
  ...monoStyle,
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  color: "var(--text-primary)",
  flex: "1 1 120px",
  fontSize: "0.78rem",
  minWidth: 0,
  outline: "none",
  padding: "7px 9px",
};

const sendButtonBaseStyle: CSSProperties = {
  ...iconButtonStyle,
  flex: "0 0 auto",
  height: 34,
  width: 38,
};

const setupStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  height: "100%",
  justifyContent: "center",
  minHeight: 0,
  textAlign: "center",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function clampLimit(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 20;
  return Math.min(50, Math.max(5, Math.round(parsed)));
}

function isValidBridgeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function compactJid(value: string): string {
  return value.split("@")[0] || value;
}

function nestedText(value: unknown): string | null {
  if (typeof value === "string") return asString(value);
  if (!isRecord(value)) return null;

  const extended = isRecord(value.extendedTextMessage) ? value.extendedTextMessage : null;
  const image = isRecord(value.imageMessage) ? value.imageMessage : null;
  const video = isRecord(value.videoMessage) ? value.videoMessage : null;

  return (
    asString(value.conversation) ??
    asString(extended?.text) ??
    asString(image?.caption) ??
    asString(video?.caption)
  );
}

function messageText(item: Record<string, unknown>): string {
  return (
    asString(item.body) ??
    asString(item.text) ??
    asString(item.content) ??
    nestedText(item.message) ??
    "[unsupported message]"
  );
}

function messageSender(item: Record<string, unknown>, fromMe: boolean): string {
  if (fromMe) return "me";

  const key = isRecord(item.key) ? item.key : null;
  const sender = isRecord(item.sender) ? item.sender : null;

  return compactJid(
    asString(item.pushName) ??
      asString(item.senderName) ??
      asString(item.author) ??
      asString(sender?.name) ??
      asString(item.sender) ??
      asString(key?.participant) ??
      asString(item.participant) ??
      asString(item.from) ??
      "unknown",
  );
}

function messageTimeMs(item: Record<string, unknown>): number | null {
  const raw = item.timestamp ?? item.messageTimestamp ?? item.time ?? item.createdAt;
  const numeric = asNumber(raw);
  if (numeric !== null) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;

  const text = asString(raw);
  if (!text) return null;

  const parsed = new Date(text).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function messageTime(item: Record<string, unknown>): string {
  const ms = messageTimeMs(item);
  const date = ms === null ? null : new Date(ms);

  if (!date || Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function normalizeMessages(value: unknown): NormalizedMessage[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry, index): NormalizedMessage | null => {
      if (!isRecord(entry)) return null;
      const key = isRecord(entry.key) ? entry.key : null;
      const timestampMs = messageTimeMs(entry);
      const fromMe =
        asBoolean(entry.fromMe) ??
        asBoolean(entry.isFromMe) ??
        asBoolean(entry.me) ??
        asBoolean(key?.fromMe) ??
        false;
      const id =
        asString(entry.id) ??
        asString(key?.id) ??
        `${messageTime(entry)}-${index}`;

      return {
        id,
        fromMe,
        sender: messageSender(entry, fromMe),
        text: messageText(entry),
        timestamp: messageTime(entry),
        timestampMs,
      } as NormalizedMessage & { timestampMs: number | null };
    })
    .filter((message): message is NormalizedMessage & { timestampMs: number | null } => message !== null);

  if (normalized.some((message) => message.timestampMs !== null)) {
    normalized.sort((a, b) => (b.timestampMs ?? -Infinity) - (a.timestampMs ?? -Infinity));
  }

  return normalized.map((message) => ({
    id: message.id,
    fromMe: message.fromMe,
    sender: message.sender,
    text: message.text,
    timestamp: message.timestamp,
  }));
}

function participantCount(data: WhatsAppResponse | null): number | null {
  if (!data) return null;

  return (
    asNumber(data.participantCount) ??
    asNumber(data.participantsCount) ??
    asNumber(data.memberCount) ??
    (Array.isArray(data.participants) ? data.participants.length : null)
  );
}

function SetupPlaceholder({ text }: { text: string }) {
  return (
    <div style={setupStyle}>
      <WifiOff aria-hidden="true" size={22} strokeWidth={1.8} style={{ color: "var(--text-muted)" }} />
      <div className="more-head">setup needed</div>
      <div className="block-sub" style={{ maxWidth: 260 }}>
        {text}
      </div>
    </div>
  );
}

function StatusPill({
  connected,
  error,
  hasData,
}: {
  connected: boolean | null;
  error: string;
  hasData: boolean;
}) {
  const label = error ? "error" : connected === false ? "offline" : hasData ? "connected" : "checking";
  const color = error || connected === false ? "var(--accent-orange)" : "var(--accent-cyan)";

  return (
    <span style={{ ...labelStyle, alignItems: "center", color, display: "inline-flex", gap: 4 }}>
      {connected === false || error ? (
        <WifiOff aria-hidden="true" size={12} strokeWidth={1.8} />
      ) : (
        <MessageCircle aria-hidden="true" size={12} strokeWidth={1.8} />
      )}
      {label}
    </span>
  );
}

function MessageBubble({ message }: { message: NormalizedMessage }) {
  return (
    <div
      style={{
        alignSelf: message.fromMe ? "flex-end" : "flex-start",
        background: "var(--bg-nested)",
        border: `1.5px solid ${message.fromMe ? "var(--accent-cyan)" : "var(--border)"}`,
        borderRadius: 14,
        boxShadow: "2px 2px 0 var(--shadow)",
        maxWidth: "94%",
        minWidth: 0,
        padding: "6px 8px",
      }}
    >
      <div style={{ ...metaRowStyle, justifyContent: "space-between" }}>
        <span style={{ ...labelStyle, color: message.fromMe ? "var(--accent-cyan)" : "var(--text-muted)" }}>
          {message.sender}
        </span>
        <span style={labelStyle}>{message.timestamp}</span>
      </div>
      <div
        style={{
          ...monoStyle,
          color: "var(--text-primary)",
          fontSize: "0.74rem",
          lineHeight: 1.35,
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
        }}
      >
        {message.text}
      </div>
    </div>
  );
}

export function WhatsappWidget() {
  const { orientation, settings, size } = useWidget();
  const bridgeUrl = typeof settings.bridgeUrl === "string" ? settings.bridgeUrl.trim() : "";
  const groupId = typeof settings.groupId === "string" ? settings.groupId.trim() : "";
  const displayName = typeof settings.displayName === "string" && settings.displayName.trim()
    ? settings.displayName.trim()
    : "group chat";
  const limit = clampLimit(settings.limit);
  const draftMode = settings.draftMode !== false;
  const nutbotReplyEnabled = settings.nutbotReplyEnabled === true;
  const nutbotTrigger: NutbotTrigger = settings.nutbotTrigger === "latest" ? "latest" : "mention";
  const nutbotPollSeconds = Math.min(300, Math.max(10, Number(settings.nutbotPollSeconds) || 30));
  const nutbotAutoSend = settings.nutbotAutoSend === true;
  const nutbotReplyPrefix = settings.nutbotReplyPrefix !== false;
  const nutbotBackend: NutbotBackend =
    settings.nutbotBackend === "claude" || settings.nutbotBackend === "codex" || settings.nutbotBackend === "opencode"
      ? settings.nutbotBackend
      : "bonfire";
  const nutbotBonfireNsfw = settings.nutbotBonfireNsfw === true;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [nutbotStatus, setNutbotStatus] = useState("");
  const nutbotBusyRef = useRef(false);

  const pollUrl = useMemo(() => {
    const params = new URLSearchParams({
      bridgeUrl,
      groupId,
      limit: String(limit),
    });
    return `/api/whatsapp?${params.toString()}`;
  }, [bridgeUrl, groupId, limit]);

  const pollIntervalMs = nutbotReplyEnabled ? nutbotPollSeconds * 1000 : 15_000;
  const { data, refresh } = usePolling<WhatsAppResponse>(pollUrl, pollIntervalMs);

  const messages = useMemo(() => normalizeMessages(data?.messages), [data?.messages]);
  const visibleCount = size === "S" ? 3 : size === "M" ? 8 : limit;
  const visibleMessages = messages.slice(0, visibleCount);
  const configured = bridgeUrl.length > 0 && groupId.length > 0;
  const validBridge = !bridgeUrl || isValidBridgeUrl(bridgeUrl);
  const responseError = typeof data?.error === "string" ? data.error : "";
  const connected = asBoolean(data?.connected) ?? asBoolean(data?.online);
  const groupName = data?.groupName || data?.subject || data?.name || displayName;
  const count = participantCount(data);
  const canSend = configured && validBridge && draft.trim().length > 0 && !sending;
  const compact = size === "M" || orientation === "v";

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending || !configured || !validBridge) return;

    setSending(true);
    setSendError("");

    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bridgeUrl, groupId, message }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; success?: boolean } | null;

      if (!res.ok || payload?.error) {
        throw new Error(payload?.error ?? `send failed (${res.status})`);
      }

      setDraft("");
      refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "send failed");
    } finally {
      setSending(false);
    }
  }

  // shared by manual send (above) and NutBot's auto-send path below — posts
  // straight to the bridge, no draft-state involvement
  async function postWhatsappMessage(message: string): Promise<void> {
    const res = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bridgeUrl, groupId, message }),
    });
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok || payload?.error) {
      throw new Error(payload?.error ?? `send failed (${res.status})`);
    }
  }

  // NutBot reading + replying: on every poll tick (interval = nutbotPollSeconds
  // while this is on), look at the newest non-self message. If it's new (not
  // already handled) and matches the trigger mode, ask /api/nutbot-chat for a
  // reply — same backend abstraction (bonfire/claude/codex/opencode) the NutBot
  // chat tab uses — then either auto-send it or drop it into the draft box for
  // manual review. One Bonfire conversation per WhatsApp group persists across
  // replies (so its memory layer can build context over time); harness
  // backends are stateless per reply (no natural multi-turn session here).
  useEffect(() => {
    if (!nutbotReplyEnabled || !configured || !validBridge || nutbotBusyRef.current) return;

    const newestToOldest = messages; // already sorted newest-first by normalizeMessages
    if (newestToOldest.length === 0) return;

    const lastHandledId = readLocal(lastHandledKey(groupId));

    // first time this group sees nutbot reply mode: baseline to "now" so we
    // don't reply to the entire existing history at once
    if (lastHandledId === null) {
      writeLocal(lastHandledKey(groupId), newestToOldest[0].id);
      return;
    }

    if (lastHandledId === newestToOldest[0].id) return; // already handled the newest

    const candidate = newestToOldest.find((message) => !message.fromMe);
    if (!candidate || candidate.id === lastHandledId) return;
    if (nutbotTrigger === "mention" && !MENTION_RE.test(candidate.text)) {
      // not a match, but still the newest — mark handled so we don't re-check it forever
      writeLocal(lastHandledKey(groupId), newestToOldest[0].id);
      return;
    }

    const contextLines = newestToOldest
      .slice(0, NUTBOT_CONTEXT_MESSAGES)
      .slice()
      .reverse()
      .map((message) => `${message.fromMe ? "NutBot" : message.sender}: ${message.text}`)
      .join("\n");

    const promptMessage = [
      `[WhatsApp group "${groupName}"] Recent messages:`,
      contextLines,
      "",
      `Reply naturally as NutBot to ${candidate.sender}'s message above: "${candidate.text}"`,
    ].join("\n");

    nutbotBusyRef.current = true;

    (async () => {
      setNutbotStatus("nutbot is replying...");
      try {
        const storedConvId = nutbotBackend === "bonfire" ? readLocal(conversationKey(groupId)) : null;
        const res = await fetch("/api/nutbot-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            backend: nutbotBackend,
            message: promptMessage,
            conversationId: storedConvId,
            nsfw: nutbotBackend === "bonfire" ? nutbotBonfireNsfw : false,
            searchEnabled: false,
            history: [],
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`${nutbotBackend} backend unavailable (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let reply = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const frame = JSON.parse(line) as { type?: string; data?: unknown };
              if (frame.type === "token") reply += String(frame.data ?? "");
              else if (frame.type === "error") throw new Error(String(frame.data ?? "generation failed"));
              else if ((frame.type === "conversation" || frame.type === "done") && nutbotBackend === "bonfire") {
                const convData = frame.data as { conversation_id?: string } | undefined;
                if (convData?.conversation_id) writeLocal(conversationKey(groupId), convData.conversation_id);
              }
            } catch {
              // ignore malformed lines, keep streaming
            }
          }
        }

        reply = reply.trim();
        if (!reply) throw new Error(`${nutbotBackend} returned no reply`);
        if (nutbotReplyPrefix) reply = `nutbot: ${reply}`;

        if (nutbotAutoSend) {
          await postWhatsappMessage(reply);
          refresh();
          setNutbotStatus("nutbot replied");
        } else {
          setDraft(reply);
          setNutbotStatus("nutbot drafted a reply — review and send");
        }

        writeLocal(lastHandledKey(groupId), candidate.id);
      } catch (err) {
        setNutbotStatus(`nutbot reply failed: ${err instanceof Error ? err.message : "unknown error"}`);
        // don't mark handled on failure — retry next poll tick
      } finally {
        nutbotBusyRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the polled message list actually changes or settings change; postWhatsappMessage/refresh are stable per render and don't need to retrigger this
  }, [
    messages,
    nutbotReplyEnabled,
    nutbotTrigger,
    nutbotBackend,
    nutbotBonfireNsfw,
    nutbotAutoSend,
    nutbotReplyPrefix,
    groupId,
    groupName,
    configured,
    validBridge,
  ]);

  if (!bridgeUrl) {
    return <SetupPlaceholder text="Add the bridge URL in widget settings. No .env.local is required." />;
  }

  if (!validBridge) {
    return <SetupPlaceholder text="Use an http:// or https:// bridge URL in widget settings." />;
  }

  if (!groupId) {
    return <SetupPlaceholder text="Add the group id in widget settings, for example 120363...@g.us." />;
  }

  return (
    <div style={rootStyle}>
      <div style={headerStyle}>
        <div style={titleWrapStyle}>
          <MessageCircle aria-hidden="true" size={17} strokeWidth={1.8} style={{ color: "var(--accent-cyan)", flex: "0 0 auto" }} />
          <div style={{ minWidth: 0 }}>
            <div style={groupTitleStyle}>{groupName}</div>
            <div style={metaRowStyle}>
              <StatusPill connected={connected} error={responseError} hasData={data !== null} />
              {count !== null && (
                <span style={{ ...labelStyle, alignItems: "center", display: "inline-flex", gap: 4 }}>
                  <Users aria-hidden="true" size={12} strokeWidth={1.8} />
                  {count}
                </span>
              )}
            </div>
          </div>
        </div>
        <button aria-label="refresh whatsapp messages" onClick={refresh} style={iconButtonStyle} title="refresh" type="button">
          <RefreshCw aria-hidden="true" size={13} strokeWidth={1.8} />
        </button>
      </div>

      {(responseError || connected === false) && (
        <div style={noticeStyle}>
          <WifiOff aria-hidden="true" size={13} strokeWidth={1.8} />
          <span>{responseError || "bridge reports offline"}</span>
        </div>
      )}

      {nutbotReplyEnabled && nutbotStatus && (
        <div style={noticeStyle}>
          <Bot aria-hidden="true" size={13} strokeWidth={1.8} style={{ color: "var(--accent-cyan)" }} />
          <span>{nutbotStatus}</span>
        </div>
      )}

      <div style={{ ...listStyle, maxHeight: size === "L" ? undefined : compact ? 170 : 150 }}>
        {visibleMessages.length > 0 ? (
          visibleMessages.map((message) => <MessageBubble key={message.id} message={message} />)
        ) : (
          <div className="more-row" style={{ justifyContent: "center", minHeight: 54, textAlign: "center" }}>
            <span className="more-meta">{data ? "no messages returned" : "checking bridge"}</span>
          </div>
        )}
      </div>

      {size !== "S" && (
        <form onSubmit={sendMessage} style={composerStyle}>
          <label htmlFor="whatsapp-draft" style={labelStyle}>
            {draftMode ? "draft reply" : "manual message"}
          </label>
          <div style={composerRowStyle}>
            <input
              id="whatsapp-draft"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="write a manual reply"
              spellCheck={false}
              style={inputStyle}
              type="text"
              value={draft}
            />
            <button
              aria-label="send whatsapp message"
              disabled={!canSend}
              style={{ ...sendButtonBaseStyle, cursor: canSend ? "pointer" : "not-allowed", opacity: canSend ? 1 : 0.55 }}
              type="submit"
            >
              <Send aria-hidden="true" size={14} strokeWidth={1.9} />
            </button>
          </div>
          {sendError && (
            <div className="block-sub" style={{ color: "var(--accent-orange)" }}>
              {sendError}
            </div>
          )}
        </form>
      )}

      {size === "L" && (
        <div className="block-sub" style={{ flex: "0 0 auto" }}>
          {nutbotReplyEnabled
            ? nutbotAutoSend
              ? `nutbot (${nutbotBackend}) auto-replies ${nutbotTrigger === "mention" ? "when tagged @nutbot" : "to every new message"}.`
              : `nutbot (${nutbotBackend}) drafts replies ${nutbotTrigger === "mention" ? "when tagged @nutbot" : "to every new message"} - nothing is sent until you press send.`
            : "replies are manual only - nothing is sent unless you press send."}
        </div>
      )}
    </div>
  );
}
