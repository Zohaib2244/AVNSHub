"use client";

import { type CSSProperties, useState, useSyncExternalStore } from "react";
import { Check, ChevronLeft, Copy, ExternalLink, Gamepad2, Link2, Plus, X } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import {
  addGame,
  addLink,
  type Game,
  getGames,
  getServerGames,
  removeGame,
  removeLink,
  subscribeGames,
} from "./store";

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const headerRowStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
};

const scrollListStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  flexDirection: "column",
  minHeight: 0,
  overflowY: "auto",
  scrollbarColor: "var(--border) transparent",
  scrollbarWidth: "thin",
};

const rowAlignStyle: CSSProperties = { alignItems: "center" };

const rowActionsStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexShrink: 0,
  gap: 6,
};

const clickableNameStyle: CSSProperties = {
  ...monoStyle,
  background: "transparent",
  border: "none",
  color: "var(--text-primary)",
  cursor: "pointer",
  flex: "1 1 auto",
  minWidth: 0,
  overflow: "hidden",
  padding: 0,
  textAlign: "left",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const selectedRowStyle: CSSProperties = {
  background: "var(--bg-nested)",
  borderLeft: "2px solid var(--accent-orange)",
  borderRadius: 6,
  paddingLeft: 6,
};

const chipStyle: CSSProperties = {
  ...monoStyle,
  background: "var(--bg-nested)",
  border: "1px solid var(--border)",
  borderRadius: 99,
  color: "var(--text-muted)",
  flexShrink: 0,
  fontSize: "0.62rem",
  padding: "1px 7px",
};

const iconButtonStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "inline-flex",
  flexShrink: 0,
  justifyContent: "center",
  padding: 5,
};

const ghostIconButtonStyle: CSSProperties = {
  alignItems: "center",
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "inline-flex",
  flexShrink: 0,
  padding: 2,
};

const backRowStyle: CSSProperties = {
  ...monoStyle,
  alignItems: "center",
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "flex",
  fontSize: "0.7rem",
  gap: 4,
  padding: "3px 0 6px",
  textAlign: "left",
};

const emptyStateStyle: CSSProperties = {
  padding: "10px 0",
  textAlign: "center",
};

const formRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };

const inputStyle: CSSProperties = {
  ...monoStyle,
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-primary)",
  flex: "1 1 80px",
  fontSize: "0.7rem",
  minWidth: 0,
  outline: "none",
  padding: "5px 8px",
};

const paneStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const linkLabelStyle: CSSProperties = {
  alignItems: "flex-start",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  display: "flex",
  flex: "1 1 auto",
  gap: 6,
  minWidth: 0,
  overflow: "hidden",
  padding: 0,
  textAlign: "left",
};

const mutedIconStyle: CSSProperties = { color: "var(--text-muted)", flexShrink: 0, marginTop: 1 };

const labelTextStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  overflow: "hidden",
};

const linkLabelTextStyle: CSSProperties = {
  ...monoStyle,
  color: "var(--text-primary)",
  display: "block",
  fontSize: "0.72rem",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const hostnameStyle: CSSProperties = {
  fontSize: "0.6rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function openLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function copyLink(url: string, onCopied: () => void) {
  if (!navigator.clipboard?.writeText) return;
  navigator.clipboard.writeText(url).then(onCopied).catch(() => {});
}

function useGames(): Game[] | null {
  return useSyncExternalStore(subscribeGames, getGames, getServerGames);
}

function AddGameForm({ onAdd, onClose }: { onAdd: (name: string) => void; onClose?: () => void }) {
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
    onClose?.();
  }

  return (
    <div style={formRowStyle}>
      <input
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose?.();
        }}
        placeholder="game name"
        style={inputStyle}
        value={name}
      />
      <button aria-label="add game" onClick={submit} style={iconButtonStyle} type="button">
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function AddLinkForm({
  onAdd,
  onClose,
}: {
  onAdd: (label: string, url: string) => void;
  onClose?: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  function submit() {
    if (!label.trim() || !url.trim()) return;
    onAdd(label.trim(), url.trim());
    setLabel("");
    setUrl("");
    onClose?.();
  }

  return (
    <div style={formRowStyle}>
      <input
        autoFocus
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose?.();
        }}
        placeholder="label"
        style={inputStyle}
        value={label}
      />
      <input
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose?.();
        }}
        placeholder="url"
        style={inputStyle}
        value={url}
      />
      <button aria-label="add link" onClick={submit} style={iconButtonStyle} type="button">
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function SizeS({ games }: { games: Game[] }) {
  const gameCount = games.length;
  const linkCount = games.reduce((sum, g) => sum + g.links.length, 0);

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        height: "100%",
        justifyContent: "center",
      }}
    >
      <div className="block-label" style={{ marginBottom: 2 }}>
        <Gamepad2 size={14} strokeWidth={1.75} />
        games
      </div>
      <div className="block-stat">{gameCount}</div>
      <div className="block-sub">
        {linkCount} link{linkCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function SizeM({ games }: { games: Game[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const drilled = selectedId ? (games.find((g) => g.id === selectedId) ?? null) : null;

  function handleCopy(linkId: string, url: string) {
    copyLink(url, () => {
      setCopiedId(linkId);
      setTimeout(() => setCopiedId((cur) => (cur === linkId ? null : cur)), 1000);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      <div style={headerRowStyle}>
        <div className="block-label" style={{ marginBottom: 0, minWidth: 0, overflow: "hidden" }}>
          <Gamepad2 size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {drilled ? drilled.name : "games"}
          </span>
        </div>
        <button
          aria-label={drilled ? "add link" : "add game"}
          onClick={() => setShowAdd((v) => !v)}
          style={iconButtonStyle}
          type="button"
        >
          <Plus size={14} strokeWidth={1.75} />
        </button>
      </div>

      {showAdd &&
        (drilled ? (
          <AddLinkForm
            onAdd={(label, url) => addLink(drilled.id, label, url)}
            onClose={() => setShowAdd(false)}
          />
        ) : (
          <AddGameForm onAdd={(name) => addGame(name)} onClose={() => setShowAdd(false)} />
        ))}

      <div style={scrollListStyle}>
        {drilled ? (
          <>
            <button onClick={() => setSelectedId(null)} style={backRowStyle} type="button">
              <ChevronLeft size={14} strokeWidth={1.75} />
              back
            </button>
            {drilled.links.length === 0 ? (
              <div className="block-sub" style={emptyStateStyle}>
                no links yet
              </div>
            ) : (
              drilled.links.map((l) => (
                <div className="more-row" key={l.id} style={rowAlignStyle}>
                  <button onClick={() => openLink(l.url)} style={linkLabelStyle} type="button">
                    <Link2 size={14} strokeWidth={1.75} style={mutedIconStyle} />
                    <span style={linkLabelTextStyle}>{l.label}</span>
                  </button>
                  <span style={rowActionsStyle}>
                    <button
                      aria-label="copy link"
                      onClick={() => handleCopy(l.id, l.url)}
                      style={ghostIconButtonStyle}
                      type="button"
                    >
                      {copiedId === l.id ? (
                        <Check color="var(--accent-cyan)" size={14} strokeWidth={1.75} />
                      ) : (
                        <Copy size={14} strokeWidth={1.75} />
                      )}
                    </button>
                    <button
                      aria-label="delete link"
                      onClick={() => removeLink(drilled.id, l.id)}
                      style={ghostIconButtonStyle}
                      type="button"
                    >
                      <X size={14} strokeWidth={1.75} />
                    </button>
                  </span>
                </div>
              ))
            )}
          </>
        ) : games.length === 0 ? (
          <div className="block-sub" style={emptyStateStyle}>
            no games yet
          </div>
        ) : (
          games.map((g) => (
            <div className="more-row" key={g.id} style={rowAlignStyle}>
              <button onClick={() => setSelectedId(g.id)} style={clickableNameStyle} type="button">
                {g.name}
              </button>
              <span style={rowActionsStyle}>
                <span style={chipStyle}>{g.links.length}</span>
                <button
                  aria-label={`delete ${g.name}`}
                  onClick={() => removeGame(g.id)}
                  style={ghostIconButtonStyle}
                  type="button"
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SizeL({ games }: { games: Game[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selected = selectedId ? (games.find((g) => g.id === selectedId) ?? null) : null;

  function handleCopy(linkId: string, url: string) {
    copyLink(url, () => {
      setCopiedId(linkId);
      setTimeout(() => setCopiedId((cur) => (cur === linkId ? null : cur)), 1000);
    });
  }

  return (
    <div style={{ display: "flex", gap: 10, height: "100%", minHeight: 0 }}>
      <div style={{ ...paneStyle, borderRight: "1px solid var(--border)", paddingRight: 10 }}>
        <div className="block-label">
          <Gamepad2 size={14} strokeWidth={1.75} />
          games
        </div>
        <div style={scrollListStyle}>
          {games.length === 0 ? (
            <div className="block-sub" style={emptyStateStyle}>
              no games yet
            </div>
          ) : (
            games.map((g) => (
              <div
                className="more-row"
                key={g.id}
                style={g.id === selectedId ? { ...rowAlignStyle, ...selectedRowStyle } : rowAlignStyle}
              >
                <button onClick={() => setSelectedId(g.id)} style={clickableNameStyle} type="button">
                  {g.name}
                </button>
                <span style={rowActionsStyle}>
                  <span style={chipStyle}>{g.links.length}</span>
                  <button
                    aria-label={`delete ${g.name}`}
                    onClick={() => {
                      removeGame(g.id);
                      if (g.id === selectedId) setSelectedId(null);
                    }}
                    style={ghostIconButtonStyle}
                    type="button"
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
        <AddGameForm onAdd={(name) => addGame(name)} />
      </div>

      <div style={paneStyle}>
        <div className="block-label" style={{ minWidth: 0, overflow: "hidden" }}>
          <Link2 size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected ? selected.name : "links"}
          </span>
        </div>
        <div style={scrollListStyle}>
          {!selected ? (
            <div className="block-sub" style={emptyStateStyle}>
              select a game
            </div>
          ) : selected.links.length === 0 ? (
            <div className="block-sub" style={emptyStateStyle}>
              no links yet
            </div>
          ) : (
            selected.links.map((l) => (
              <div className="more-row" key={l.id} style={{ ...rowAlignStyle, alignItems: "flex-start" }}>
                <button onClick={() => openLink(l.url)} style={linkLabelStyle} type="button">
                  <Link2 size={14} strokeWidth={1.75} style={mutedIconStyle} />
                  <span style={labelTextStyle}>
                    <span style={linkLabelTextStyle}>{l.label}</span>
                    <span className="block-sub" style={hostnameStyle}>
                      {hostnameOf(l.url)}
                    </span>
                  </span>
                </button>
                <span style={rowActionsStyle}>
                  <button
                    aria-label="open in new tab"
                    onClick={() => openLink(l.url)}
                    style={ghostIconButtonStyle}
                    type="button"
                  >
                    <ExternalLink size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    aria-label="copy link"
                    onClick={() => handleCopy(l.id, l.url)}
                    style={ghostIconButtonStyle}
                    type="button"
                  >
                    {copiedId === l.id ? (
                      <Check color="var(--accent-cyan)" size={14} strokeWidth={1.75} />
                    ) : (
                      <Copy size={14} strokeWidth={1.75} />
                    )}
                  </button>
                  <button
                    aria-label="delete link"
                    onClick={() => removeLink(selected.id, l.id)}
                    style={ghostIconButtonStyle}
                    type="button"
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
        {selected && <AddLinkForm onAdd={(label, url) => addLink(selected.id, label, url)} />}
      </div>
    </div>
  );
}

export function OfficeGameDevWidget() {
  const { size } = useWidget();
  const games = useGames();

  if (!games) return <div className="block-sub">loading...</div>;

  if (size === "S") return <SizeS games={games} />;
  if (size === "M") return <SizeM games={games} />;
  return <SizeL games={games} />;
}
