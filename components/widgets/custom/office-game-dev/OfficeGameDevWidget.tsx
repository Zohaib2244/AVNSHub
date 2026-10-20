"use client";

import { type CSSProperties, type ReactNode, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  Flame,
  Gamepad2,
  IdCard,
  Link2,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import styles from "./OfficeGameDevWidget.module.css";
import {
  addCustomLink,
  addGame,
  addTodo,
  type BuildDraft,
  type CustomLink,
  FIXED_LINK_KINDS,
  FIXED_LINK_LABELS,
  type FixedLinkKind,
  type Game,
  getGames,
  getServerGames,
  type GameTodo,
  removeCustomLink,
  removeGame,
  removeTodo,
  setFixedLink,
  subscribeGames,
  type StageOption,
  toggleTodo,
  updateCustomLink,
  updateDraft,
  updateGameDetails,
  updateTodo,
} from "./store";

// --- shared style tokens ------------------------------------------------

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.56rem",
  fontWeight: 400,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const panelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  minHeight: 0,
  overflow: "hidden",
  padding: 8,
};

const inputStyle: CSSProperties = {
  ...monoStyle,
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-primary)",
  flex: "1 1 80px",
  fontSize: "0.7rem",
  height: 24,
  minWidth: 0,
  outline: "none",
  padding: "3px 8px",
};

const smallInputStyle: CSSProperties = { ...inputStyle, fontSize: "0.62rem", height: 22 };

const buttonBaseStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 10,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  display: "inline-flex",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.56rem",
  gap: 4,
  letterSpacing: "0.08em",
  minHeight: 24,
  padding: "3px 8px",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const primaryButtonStyle: CSSProperties = { ...buttonBaseStyle, color: "var(--accent-orange)" };

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
  justifyContent: "center",
  background: "transparent",
  border: "1.5px solid var(--border)",
  borderRadius: 8,
  color: "var(--text-muted)",
  cursor: "pointer",
  display: "inline-flex",
  flexShrink: 0,
  padding: 3,
};

const dangerArmedStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1.5px solid var(--accent-orange)",
  color: "var(--accent-orange)",
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

const scrollListStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: 4,
  minHeight: 0,
  overflowY: "auto",
  scrollbarColor: "var(--border) transparent",
  scrollbarWidth: "thin",
};

const emptyStateStyle: CSSProperties = { padding: "10px 4px", textAlign: "center" };

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
  padding: "2px 0 4px",
  textAlign: "left",
};

const tabRowStyle: CSSProperties = { display: "flex", gap: 4 };

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    ...buttonBaseStyle,
    background: active ? "var(--bg-card)" : "var(--bg-nested)",
    boxShadow: active ? "2px 2px 0 var(--shadow)" : "none",
    color: active ? "var(--accent-cyan)" : "var(--text-muted)",
    flex: 1,
    justifyContent: "center",
  };
}

const fieldRowStyle: CSSProperties = {
  alignItems: "center",
  display: "grid",
  gap: 5,
  gridTemplateColumns: "46px minmax(0, 1fr)",
  minHeight: 22,
};

// --- utilities -----------------------------------------------------------

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

/** clipboard API when available, falling back to a hidden textarea so copy
 * still works in non-secure contexts / older browsers instead of silently
 * no-oping */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.style.position = "fixed";
    box.style.left = "-9999px";
    document.body.appendChild(box);
    box.focus();
    box.select();
    document.execCommand("copy");
    box.remove();
    return true;
  } catch {
    return false;
  }
}

function stageValue(draft: BuildDraft) {
  if (draft.stage !== "Other/custom") return draft.stage;
  return draft.customStage.trim() || "Other/custom";
}

function previousRolloutValue(value: string) {
  const clean = value.replace("%", "").trim();
  return clean === "0" ? "Halt" : value.trim();
}

function composeEmail(game: Game, draft: BuildDraft) {
  const lines = [
    "Hello,",
    "",
    "Following is the information for the latest Publishing Build.",
    "",
    `Game Name: ${game.name.trim()} | ${game.gameId.trim()}`,
    `Store Name: ${game.storeName.trim()}`,
    `Live Link: ${game.liveLink.trim()}`,
    "",
    "---",
    `Stage: ${stageValue(draft)}`,
    `Version: ${draft.versionNumber.trim()} (${draft.bundleCode.trim()})`,
    `Previous RollOut: ${previousRolloutValue(draft.previousRollOut)}`,
    `New RollOut: ${draft.newRollOut.trim()}`,
  ];

  const countryBased = draft.countryBased.trim();
  if (countryBased) lines.push(`Country Based: ${countryBased}`);

  lines.push(`Bundle Link: ${draft.bundleLink.trim()}`, "", "---");

  const releaseNotes = draft.releaseNotes.trim();
  if (releaseNotes) lines.push(`Release Notes: ${releaseNotes}`, "");

  lines.push(
    "Attached is the finalized publishing checklist confirming all technical and operational requirements have been met",
    "",
    "Best Regards,",
    "Zohaib Shahjehan",
  );

  return lines.join("\n");
}

function linkCountOf(game: Game): number {
  const fixedFilled = FIXED_LINK_KINDS.filter((kind) => game.fixedLinks[kind].trim()).length;
  return fixedFilled + game.customLinks.length;
}

type GameReadiness = {
  complete: number;
  total: number;
  missing: string[];
};

function gameReadiness(game: Game): GameReadiness {
  const checks: [string, string][] = [
    ["game id", game.gameId],
    ["store", game.storeName],
    ["live link", game.liveLink],
    ["version", game.draft.versionNumber],
    ["bundle code", game.draft.bundleCode],
    ["new rollout", game.draft.newRollOut],
    ["bundle link", game.draft.bundleLink],
  ];
  const missing = checks.filter(([, value]) => !value.trim()).map(([label]) => label);
  return { complete: checks.length - missing.length, total: checks.length, missing };
}

function useGames(): Game[] | null {
  return useSyncExternalStore(subscribeGames, getGames, getServerGames);
}

/** arms on first click, fires onConfirm on a second click within `ms`; any
 * other id clicked resets. Used so deleting a game (which now carries its
 * identity + links + publish draft) needs a deliberate second tap. */
function useConfirmDelete(ms = 2500) {
  const [armedId, setArmedId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  function trigger(id: string, onConfirm: () => void) {
    if (armedId === id) {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setArmedId(null);
      onConfirm();
      return;
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setArmedId(id);
    timerRef.current = window.setTimeout(() => setArmedId(null), ms);
  }

  return { armedId, trigger };
}

// --- small building blocks -------------------------------------------------

function AddGameForm({ onAdd, autoFocus = false }: { onAdd: (name: string) => void; autoFocus?: boolean }) {
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  }

  return (
    <div className={styles.addRow} style={{ display: "flex", gap: 6 }}>
      <input
        autoFocus={autoFocus}
        aria-label="Game name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="new game name"
        style={inputStyle}
        value={name}
      />
      <button aria-label="add game" className={styles.iconButton} onClick={submit} style={iconButtonStyle} type="button">
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function CopyButton({ url, size = 13 }: { url: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  async function handleClick() {
    const ok = await copyText(url);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1000);
  }

  return (
    <button aria-label="copy link" className={styles.iconButton} onClick={handleClick} style={ghostIconButtonStyle} type="button">
      {copied ? <Check className={styles.popIn} color="var(--accent-cyan)" size={size} strokeWidth={1.75} /> : <Copy size={size} strokeWidth={1.75} />}
    </button>
  );
}

function GameList({
  games,
  selectedId,
  onSelect,
  onAdd,
  onDeleted,
  compact = false,
}: {
  games: Game[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onDeleted?: (id: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const { armedId, trigger } = useConfirmDelete();
  // row that is sliding out after its delete was confirmed
  const [leavingId, setLeavingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => g.name.toLowerCase().includes(q));
  }, [games, query]);

  return (
    <div className={styles.gameList} style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0 }}>
      {games.length > 4 && (
        <div className={styles.searchRow} style={{ alignItems: "center", display: "flex", gap: 5, position: "relative" }}>
          <Search size={12} strokeWidth={1.75} style={{ color: "var(--text-muted)", left: 8, position: "absolute" }} />
          <input
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search games"
            style={{ ...smallInputStyle, paddingLeft: 22 }}
            value={query}
          />
        </div>
      )}
      <div style={scrollListStyle}>
        {filtered.length === 0 ? (
          <div className="block-sub" style={emptyStateStyle}>
            {games.length === 0 ? "no games yet" : "no matches"}
          </div>
        ) : (
          filtered.map((g) => {
            const armed = armedId === g.id;
            const count = linkCountOf(g);
            return (
              <div
                className={`more-row ${styles.gameRow} ${leavingId === g.id ? styles.gameLeave : ""}`}
                key={g.id}
                style={{
                  alignItems: "center",
                  background: g.id === selectedId ? "var(--bg-card)" : "transparent",
                  borderLeft: g.id === selectedId ? "2px solid var(--accent-orange)" : "2px solid transparent",
                  borderRadius: 6,
                  display: "flex",
                  paddingLeft: 6,
                }}
              >
                <button
                  aria-current={g.id === selectedId ? "true" : undefined}
                  className={styles.gameSelect}
                  onClick={() => onSelect(g.id)}
                  style={{
                    ...monoStyle,
                    background: "transparent",
                    border: "none",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    display: "flex",
                    flex: "1 1 auto",
                    flexDirection: "column",
                    minWidth: 0,
                    overflow: "hidden",
                    padding: "3px 0",
                    textAlign: "left",
                  }}
                  type="button"
                >
                  <span className={styles.gameName} style={{ fontSize: compact ? "0.66rem" : "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.name}
                  </span>
                  {!compact && g.storeName.trim() && (
                    <span className={`block-sub ${styles.gameMeta}`} style={{ fontSize: "0.56rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.storeName.trim()}
                    </span>
                  )}
                </button>
                <span style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: 5 }}>
                  <span aria-label={`${count} saved links`} className={styles.countChip} style={chipStyle} title={`${count} saved links`}>
                    {count}
                  </span>
                  <button
                    aria-label={armed ? `confirm delete ${g.name}` : `delete ${g.name}`}
                    className={`${styles.iconButton} ${armed ? styles.confirmDelete : ""}`}
                    onClick={() =>
                      trigger(g.id, () => {
                        setLeavingId(g.id);
                        window.setTimeout(() => {
                          removeGame(g.id);
                          onDeleted?.(g.id);
                          setLeavingId(null);
                        }, 240);
                      })
                    }
                    style={armed ? { ...ghostIconButtonStyle, ...dangerArmedStyle } : ghostIconButtonStyle}
                    type="button"
                  >
                    {armed ? (
                      <>
                        <Check size={12} strokeWidth={2} />
                        <span>confirm</span>
                      </>
                    ) : (
                      <Trash2 size={13} strokeWidth={1.75} />
                    )}
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>
      <AddGameForm onAdd={onAdd} />
    </div>
  );
}

function IdentityEditor({ game, compact = false }: { game: Game; compact?: boolean }) {
  const [name, setName] = useState(game.name);
  const [gameId, setGameId] = useState(game.gameId);
  const [storeName, setStoreName] = useState(game.storeName);
  const [liveLink, setLiveLink] = useState(game.liveLink);

  // re-sync local drafts when the selected game changes underneath us -
  // tracked in state (not a ref) since refs can't be read/written during render
  const [syncedId, setSyncedId] = useState(game.id);
  if (syncedId !== game.id) {
    setSyncedId(game.id);
    setName(game.name);
    setGameId(game.gameId);
    setStoreName(game.storeName);
    setLiveLink(game.liveLink);
  }

  function commit() {
    updateGameDetails(game.id, { name, gameId, storeName, liveLink });
  }

  const h = compact ? 21 : 24;
  const fs = compact ? "0.58rem" : "0.62rem";

  function field(label: string, value: string, onChange: (v: string) => void) {
    return (
      <label className="more-row" style={fieldRowStyle}>
        <span className="block-label" style={labelStyle}>
          {label}
        </span>
        <input
          onBlur={commit}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          style={{ ...inputStyle, fontSize: fs, height: h }}
          value={value}
        />
      </label>
    );
  }

  return (
    <div style={{ display: "grid", gap: 4 }}>
      {field("name", name, setName)}
      {field("id", gameId, setGameId)}
      {field("store", storeName, setStoreName)}
      {field("live", liveLink, setLiveLink)}
    </div>
  );
}

const FIXED_LINK_ICONS: Record<FixedLinkKind, typeof Flame> = {
  firebase: Flame,
  apkFolder: Package,
  gameIds: IdCard,
};

/** one link as a portrait tile: big icon on top, name and host centred below,
 * copy + edit tucked bottom-right. The icon and text open the link; delete
 * lives in the edit form so a tile only ever carries two small buttons. */
function LinkTile({
  icon: Icon,
  label,
  url,
  onEdit,
}: {
  icon: typeof Flame;
  label: string;
  url: string;
  onEdit: () => void;
}) {
  return (
    <div className={styles.linkTile}>
      <button className={styles.linkMain} onClick={() => openLink(url)} title={url} type="button">
        <span className={styles.linkIcon}>
          <Icon size={26} strokeWidth={1.6} />
        </span>
        <span className={styles.linkLabel}>{label}</span>
        <span className={styles.linkHost}>{hostnameOf(url)}</span>
      </button>
      <span className={styles.linkActions}>
        <CopyButton size={14} url={url} />
        <button aria-label={`edit ${label}`} className={styles.iconButton} onClick={onEdit} style={ghostIconButtonStyle} title="Edit" type="button">
          <Pencil size={14} strokeWidth={1.75} />
        </button>
      </span>
    </div>
  );
}

/** a fixed slot with no link yet: a dashed tile that opens the editor */
function EmptyLinkTile({ icon: Icon, label, onAdd }: { icon: typeof Flame; label: string; onAdd: () => void }) {
  return (
    <button className={styles.linkEmpty} onClick={onAdd} type="button">
      <span className={styles.linkIcon}>
        <Icon size={26} strokeWidth={1.6} />
      </span>
      <span className={styles.linkLabel}>{label}</span>
      <span className={styles.linkHost}>
        <Plus size={11} strokeWidth={2} style={{ verticalAlign: "-1px" }} /> add link
      </span>
    </button>
  );
}

/** inline editor for a link, spanning the whole row. `withLabel` is for
 * custom links (label + url); fixed slots only have a url. */
function LinkEditor({
  title,
  initialLabel = "",
  initialUrl = "",
  withLabel,
  submitText,
  onSubmit,
  onCancel,
  onDelete,
  autoFocus = true,
}: {
  title?: string;
  initialLabel?: string;
  initialUrl?: string;
  withLabel: boolean;
  submitText: string;
  onSubmit: (label: string, url: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
  autoFocus?: boolean;
}) {
  const { armedId, trigger } = useConfirmDelete();
  const [label, setLabel] = useState(initialLabel);
  const [url, setUrl] = useState(initialUrl);
  const canSubmit = withLabel ? Boolean(label.trim() && url.trim()) : true;

  function submit() {
    if (canSubmit) onSubmit(label, url);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className={styles.linkEditor}>
      {title && <div className={styles.linkEditorTitle}>{title}</div>}
      {withLabel && (
        <input
          aria-label="Link label"
          autoFocus={autoFocus}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="label (e.g. Level Editor)"
          style={{ ...inputStyle, flex: "none", height: 28, width: "100%" }}
          value={label}
        />
      )}
      <input
        aria-label="Link URL"
        autoFocus={autoFocus && !withLabel}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="paste link"
        style={{ ...inputStyle, flex: "none", height: 28, width: "100%" }}
        value={url}
      />
      <div className={styles.linkEditorButtons}>
        {onDelete && (
          <button
            onClick={() => trigger("delete", onDelete)}
            style={{ ...buttonBaseStyle, ...(armedId === "delete" ? dangerArmedStyle : {}), marginRight: "auto" }}
            type="button"
          >
            <Trash2 size={12} strokeWidth={1.75} />
            {armedId === "delete" ? "Confirm" : "Delete"}
          </button>
        )}
        <button onClick={onCancel} style={buttonBaseStyle} type="button">
          Cancel
        </button>
        <button disabled={!canSubmit} onClick={submit} style={{ ...primaryButtonStyle, opacity: canSubmit ? 1 : 0.5 }} type="button">
          {submitText}
        </button>
      </div>
    </div>
  );
}

function FixedLinkTile({ game, kind }: { game: Game; kind: FixedLinkKind }) {
  const value = game.fixedLinks[kind];
  const [editing, setEditing] = useState(false);

  // switching games closes any open editor instead of leaking a stale draft
  const [syncedId, setSyncedId] = useState(game.id);
  if (syncedId !== game.id) {
    setSyncedId(game.id);
    setEditing(false);
  }

  const Icon = FIXED_LINK_ICONS[kind];
  const label = FIXED_LINK_LABELS[kind];

  if (editing) {
    return (
      <LinkEditor
        initialUrl={value}
        onCancel={() => setEditing(false)}
        onSubmit={(_label, url) => {
          setFixedLink(game.id, kind, url);
          setEditing(false);
        }}
        submitText="Save"
        title={label}
        withLabel={false}
      />
    );
  }
  if (!value.trim()) return <EmptyLinkTile icon={Icon} label={label} onAdd={() => setEditing(true)} />;
  return <LinkTile icon={Icon} label={label} onEdit={() => setEditing(true)} url={value} />;
}

function CustomLinkTile({ game, link }: { game: Game; link: CustomLink }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <LinkEditor
        initialLabel={link.label}
        initialUrl={link.url}
        onCancel={() => setEditing(false)}
        onDelete={() => removeCustomLink(game.id, link.id)}
        onSubmit={(label, url) => {
          updateCustomLink(game.id, link.id, label, url);
          setEditing(false);
        }}
        submitText="Save"
        withLabel
      />
    );
  }
  return <LinkTile icon={Link2} label={link.label} onEdit={() => setEditing(true)} url={link.url} />;
}

function LinksSection({ game }: { game: Game }) {
  const [adding, setAdding] = useState(false);

  const [syncedId, setSyncedId] = useState(game.id);
  if (syncedId !== game.id) {
    setSyncedId(game.id);
    setAdding(false);
  }

  return (
    <div className={styles.linksSection}>
      <div className={styles.linkGrid}>
        {FIXED_LINK_KINDS.map((kind) => (
          <FixedLinkTile game={game} key={kind} kind={kind} />
        ))}
      </div>

      <div className={styles.linkGroupHeader}>
        <span className="block-label" style={labelStyle}>
          custom links
        </span>
        {!adding && (
          <button className={styles.addLinkButton} onClick={() => setAdding(true)} type="button">
            <Plus size={13} strokeWidth={1.75} />
            add link
          </button>
        )}
      </div>

      <div className={styles.linkGrid}>
        {game.customLinks.map((link) => (
          <CustomLinkTile game={game} key={link.id} link={link} />
        ))}
        {adding && (
          <LinkEditor
            onCancel={() => setAdding(false)}
            onSubmit={(label, url) => {
              addCustomLink(game.id, label, url);
              setAdding(false);
            }}
            submitText="Add link"
            title="new link"
            withLabel
          />
        )}
      </div>
      {game.customLinks.length === 0 && !adding && (
        <div className="block-sub" style={{ fontSize: "0.6rem", padding: "0 2px" }}>
          no custom links yet
        </div>
      )}
    </div>
  );
}

function renderField(label: string, control: ReactNode) {
  return (
    <label className="more-row" style={fieldRowStyle}>
      <span className="block-label" style={labelStyle}>
        {label}
      </span>
      {control}
    </label>
  );
}

function PublishSection({ game, compact = false }: { game: Game; compact?: boolean }) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const timerRef = useRef<number | null>(null);
  const draft = game.draft;
  const h = compact ? 21 : 24;
  const fs = compact ? "0.58rem" : "0.62rem";

  async function handleCopy() {
    const ok = await copyText(composeEmail(game, draft));
    if (!ok) return;
    setCopyState("copied");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopyState("idle"), 1200);
  }

  const inputStyleSized: CSSProperties = { ...inputStyle, fontSize: fs, height: h };

  return (
    <div className={styles.publishForm} style={{ display: "grid", gap: compact ? 6 : 8 }}>
      <section className={styles.formGroup}>
        <div className={styles.formGroupTitle}>build</div>
        {renderField(
          "stage",
          <select
            aria-label="Stage"
            onChange={(e) => updateDraft(game.id, { stage: e.target.value as StageOption })}
            style={inputStyleSized}
            value={draft.stage}
          >
            <option value="Beta">Beta</option>
            <option value="Production">Production</option>
            <option value="Other/custom">Other/custom</option>
          </select>,
        )}
        {draft.stage === "Other/custom" &&
          renderField(
            "custom",
            <input
              aria-label="Custom Stage"
              onChange={(e) => updateDraft(game.id, { customStage: e.target.value })}
              style={inputStyleSized}
              value={draft.customStage}
            />,
          )}
        {renderField(
          "version",
          <input
            aria-label="Version Number"
            onChange={(e) => updateDraft(game.id, { versionNumber: e.target.value })}
            style={inputStyleSized}
            value={draft.versionNumber}
          />,
        )}
        {renderField(
          "code",
          <input
            aria-label="Bundle Code"
            onChange={(e) => updateDraft(game.id, { bundleCode: e.target.value })}
            style={inputStyleSized}
            value={draft.bundleCode}
          />,
        )}
      </section>

      <section className={styles.formGroup}>
        <div className={styles.formGroupTitle}>rollout</div>
        {renderField(
          "prev",
          <input
            aria-label="Previous RollOut"
            onChange={(e) => updateDraft(game.id, { previousRollOut: e.target.value })}
            placeholder="0 or 50%"
            style={inputStyleSized}
            value={draft.previousRollOut}
          />,
        )}
        {renderField(
          "new",
          <input
            aria-label="New RollOut"
            onChange={(e) => updateDraft(game.id, { newRollOut: e.target.value })}
            placeholder="100%"
            style={inputStyleSized}
            value={draft.newRollOut}
          />,
        )}
        {renderField(
          "country",
          <input
            aria-label="Country Based"
            onChange={(e) => updateDraft(game.id, { countryBased: e.target.value })}
            placeholder="optional"
            style={inputStyleSized}
            value={draft.countryBased}
          />,
        )}
      </section>

      <section className={styles.formGroup}>
        <div className={styles.formGroupTitle}>delivery</div>
        {renderField(
          "bundle",
          <input
            aria-label="Bundle Link"
            onChange={(e) => updateDraft(game.id, { bundleLink: e.target.value })}
            style={inputStyleSized}
            value={draft.bundleLink}
          />,
        )}
        {renderField(
          "notes",
          <textarea
            aria-label="Release Notes"
            onChange={(e) => updateDraft(game.id, { releaseNotes: e.target.value })}
            placeholder="optional"
            style={{ ...inputStyleSized, height: compact ? 34 : 46, lineHeight: 1.25, resize: "none" }}
            value={draft.releaseNotes}
          />,
        )}
      </section>

      <button className={styles.primaryButton} onClick={handleCopy} style={{ ...primaryButtonStyle, justifyContent: "center", marginTop: 2 }} type="button">
        {copyState === "copied" ? <Check className={styles.popIn} size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
        {copyState === "copied" ? "Copied" : "Copy Email"}
      </button>
    </div>
  );
}

/** grow a one-row textarea to fit its content, up to `cap` px, then scroll */
function autosize(el: HTMLTextAreaElement | null, cap: number) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
}

const todoTextareaStyle: CSSProperties = {
  ...inputStyle,
  boxSizing: "border-box",
  flex: "1 1 auto",
  fontSize: "0.66rem",
  height: "auto",
  lineHeight: 1.3,
  overflowWrap: "anywhere",
  overflowY: "auto",
  resize: "none",
  width: "100%",
};

function AddTodoForm({ onAdd, compact }: { onAdd: (text: string) => void; compact: boolean }) {
  const [text, setText] = useState("");
  const cap = compact ? 64 : 96;

  function submit() {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  }

  return (
    <div style={{ alignItems: "flex-end", display: "flex", gap: 6 }}>
      <textarea
        aria-label="New todo"
        onChange={(e) => {
          setText(e.target.value);
          autosize(e.currentTarget, cap);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="add a todo"
        ref={(el) => autosize(el, cap)}
        rows={1}
        style={todoTextareaStyle}
        value={text}
      />
      <button aria-label="add todo" onClick={submit} style={iconButtonStyle} type="button">
        <Plus size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

const TODO_LEAVE_MS = 240;

function TodoRow({
  todo,
  gameId,
  armed,
  entering,
  onDelete,
  compact,
}: {
  todo: GameTodo;
  gameId: string;
  armed: boolean;
  /** added after the list was shown, so it animates in */
  entering: boolean;
  onDelete: () => void;
  compact: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // plays the exit animation, then really deletes
  const [leaving, setLeaving] = useState(false);

  function handleDelete() {
    // the first tap only arms; the second starts the exit
    if (!armed) return onDelete();
    setLeaving(true);
    window.setTimeout(onDelete, TODO_LEAVE_MS);
  }
  const [draft, setDraft] = useState(todo.text);
  const cap = compact ? 80 : 120;

  function startEdit() {
    setDraft(todo.text);
    setEditing(true);
  }

  function save() {
    if (draft.trim()) updateTodo(gameId, todo.id, draft);
    setEditing(false);
  }

  return (
    <div className={`${styles.todoWrap} ${entering ? styles.todoEnter : ""} ${leaving ? styles.todoLeave : ""}`}>
    <div className={`more-row ${styles.todoRow}`} data-done={todo.done ? "true" : undefined}>
      <button
        aria-label={todo.done ? "mark todo not done" : "mark todo done"}
        aria-pressed={todo.done}
        className={styles.todoCheck}
        onClick={() => toggleTodo(gameId, todo.id)}
        type="button"
      >
        {todo.done && <Check className={styles.popIn} size={13} strokeWidth={2.25} />}
      </button>

      {editing ? (
        <textarea
          aria-label="Edit todo"
          autoFocus
          onChange={(e) => {
            setDraft(e.target.value);
            autosize(e.currentTarget, cap);
          }}
          onFocus={(e) => {
            const len = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(len, len);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          ref={(el) => autosize(el, cap)}
          rows={1}
          style={todoTextareaStyle}
          value={draft}
        />
      ) : (
        <div className={styles.todoText}>{todo.text}</div>
      )}

      <span className={styles.todoActions}>
        {editing ? (
          <>
            <button aria-label="save todo" className={styles.iconButton} onClick={save} style={ghostIconButtonStyle} type="button">
              <Check size={12} strokeWidth={1.75} />
            </button>
            <button aria-label="cancel edit" className={styles.iconButton} onClick={() => setEditing(false)} style={ghostIconButtonStyle} type="button">
              <X size={12} strokeWidth={1.75} />
            </button>
          </>
        ) : (
          <>
            <CopyButton size={12} url={todo.text} />
            <button aria-label="edit todo" className={styles.iconButton} onClick={startEdit} style={ghostIconButtonStyle} type="button">
              <Pencil size={12} strokeWidth={1.75} />
            </button>
            <button
              aria-label={armed ? "confirm delete todo" : "delete todo"}
              className={`${styles.iconButton} ${armed ? styles.confirmDelete : ""}`}
              onClick={handleDelete}
              style={armed ? { ...ghostIconButtonStyle, ...dangerArmedStyle } : ghostIconButtonStyle}
              type="button"
            >
              {armed ? <Check size={12} strokeWidth={2} /> : <Trash2 size={12} strokeWidth={1.75} />}
            </button>
          </>
        )}
      </span>
    </div>
    </div>
  );
}

function TodosSection({ game, compact = false }: { game: Game; compact?: boolean }) {
  const { armedId, trigger } = useConfirmDelete();
  // todos that were already on screen when the tab opened don't animate in;
  // only ones added afterwards do (state, not a ref, so render stays pure)
  const [initialIds] = useState(() => new Set(game.todos.map((t) => t.id)));
  // open items first, checked ones sink below (each group keeps newest-first)
  const ordered = useMemo(
    () => [...game.todos.filter((t) => !t.done), ...game.todos.filter((t) => t.done)],
    [game.todos],
  );
  const doneCount = game.todos.length - game.todos.filter((t) => !t.done).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
      <AddTodoForm compact={compact} onAdd={(text) => addTodo(game.id, text)} />
      {game.todos.length === 0 ? (
        <div className="block-sub" style={emptyStateStyle}>
          nothing to do
        </div>
      ) : (
        <>
          <div className="block-label" style={{ ...labelStyle, padding: "0 2px" }}>
            {doneCount}/{game.todos.length} done
          </div>
          {ordered.map((todo) => (
            <TodoRow
              armed={armedId === todo.id}
              compact={compact}
              entering={!initialIds.has(todo.id)}
              gameId={game.id}
              key={todo.id}
              onDelete={() => trigger(todo.id, () => removeTodo(game.id, todo.id))}
              todo={todo}
            />
          ))}
        </>
      )}
    </div>
  );
}

type TabId = "links" | "publish" | "todos";

const TAB_LABELS: [TabId, string][] = [
  ["links", "Links"],
  ["publish", "Publish"],
  ["todos", "Todo"],
];

function tabDomId(gameId: string, tab: TabId) {
  return `game-${gameId}-${tab}`;
}

function TabBar({ gameId, tab, todoCount, onChange }: { gameId: string; tab: TabId; todoCount: number; onChange: (tab: TabId) => void }) {
  function handleKeyDown(index: number, key: string) {
    let next = index;
    if (key === "ArrowRight") next = (index + 1) % TAB_LABELS.length;
    else if (key === "ArrowLeft") next = (index - 1 + TAB_LABELS.length) % TAB_LABELS.length;
    else if (key === "Home") next = 0;
    else if (key === "End") next = TAB_LABELS.length - 1;
    else return;
    onChange(TAB_LABELS[next][0]);
    requestAnimationFrame(() => document.getElementById(`${tabDomId(gameId, TAB_LABELS[next][0])}-tab`)?.focus());
  }

  return (
    <div aria-label="Game workspace" className={styles.tabList} role="tablist" style={tabRowStyle}>
      {TAB_LABELS.map(([id, label], index) => (
        <button
          aria-controls={`${tabDomId(gameId, id)}-panel`}
          aria-selected={tab === id}
          className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`}
          id={`${tabDomId(gameId, id)}-tab`}
          key={id}
          onKeyDown={(event) => handleKeyDown(index, event.key)}
          onClick={() => onChange(id)}
          role="tab"
          style={{ ...tabButtonStyle(tab === id), minWidth: 0, padding: "3px 4px" }}
          tabIndex={tab === id ? 0 : -1}
          type="button"
        >
          {label}
          {id === "todos" && todoCount > 0 && <span className={styles.tabCount} key={todoCount}>{todoCount}</span>}
        </button>
      ))}
    </div>
  );
}

function TabBody({ tab, game, compact = false }: { tab: TabId; game: Game; compact?: boolean }) {
  return (
    <div
      aria-labelledby={`${tabDomId(game.id, tab)}-tab`}
      className={styles.tabPanel}
      id={`${tabDomId(game.id, tab)}-panel`}
      key={tab}
      role="tabpanel"
    >
      {tab === "links" && <LinksSection game={game} />}
      {tab === "publish" && <PublishSection compact={compact} game={game} />}
      {tab === "todos" && <TodosSection compact={compact} game={game} />}
    </div>
  );
}

// --- size layouts ----------------------------------------------------------

function SizeS({ games }: { games: Game[] }) {
  const gameCount = games.length;
  const needsSetup = games.filter((game) => gameReadiness(game).missing.length > 0).length;

  return (
    <div className={`${styles.root} ${styles.summary}`} style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 2, height: "100%", justifyContent: "center" }}>
      <div className="block-label" style={{ marginBottom: 2 }}>
        <Gamepad2 size={14} strokeWidth={1.75} />
        game ops
      </div>
      <div className="block-stat">{gameCount}</div>
      <div className={`block-sub ${needsSetup > 0 ? styles.needsAttention : ""}`}>
        {needsSetup > 0 ? `${needsSetup} need setup` : "all ready"}
      </div>
    </div>
  );
}

function SizeM({ games }: { games: Game[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("links");
  const [editingIdentity, setEditingIdentity] = useState(false);

  // switching games should land on a clean Links tab with the editor closed,
  // not whatever state was left over from the previous game
  const [syncedSelectedId, setSyncedSelectedId] = useState(selectedId);
  if (syncedSelectedId !== selectedId) {
    setSyncedSelectedId(selectedId);
    setTab("links");
    setEditingIdentity(false);
  }

  const selected = selectedId ? (games.find((g) => g.id === selectedId) ?? null) : null;

  if (!selected) {
    return (
      <div className={`${styles.root} ${styles.listView}`} style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
        <div className="block-label" style={{ marginBottom: 0 }}>
          <Gamepad2 size={14} strokeWidth={1.75} />
          games
        </div>
        <GameList
          compact
          games={games}
          onAdd={(name) => {
            const id = addGame(name);
            if (id) setSelectedId(id);
          }}
          onDeleted={(id) => setSelectedId((cur) => (cur === id ? null : cur))}
          onSelect={setSelectedId}
          selectedId={selectedId}
        />
      </div>
    );
  }

  return (
    <div className={`${styles.root} ${styles.detail}`} style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", minHeight: 0 }}>
      <div className={styles.detailHeader} style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <button className={styles.backButton} onClick={() => setSelectedId(null)} style={backRowStyle} type="button">
          <ChevronLeft size={14} strokeWidth={1.75} />
          <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</span>
        </button>
        <button
          aria-label="edit game details"
          className={styles.iconButton}
          onClick={() => setEditingIdentity((v) => !v)}
          style={editingIdentity ? { ...iconButtonStyle, color: "var(--accent-cyan)" } : iconButtonStyle}
          type="button"
        >
          <Pencil size={13} strokeWidth={1.75} />
        </button>
      </div>

      {editingIdentity && (
        <div className={styles.slideDown} style={panelStyle}>
          <IdentityEditor compact game={selected} />
        </div>
      )}

      <TabBar gameId={selected.id} onChange={setTab} tab={tab} todoCount={selected.todos.filter((t) => !t.done).length} />

      <div style={scrollListStyle}>
        <TabBody compact game={selected} tab={tab} />
      </div>
    </div>
  );
}

function SizeL({ games }: { games: Game[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(() => games[0]?.id ?? null);
  const [tab, setTab] = useState<TabId>("links");
  const [editingIdentity, setEditingIdentity] = useState(false);
  const selected = selectedId ? (games.find((g) => g.id === selectedId) ?? null) : null;

  // switching games lands back on a clean Links tab with the editor closed,
  // not whatever was left open for the previous game
  const [syncedSelectedId, setSyncedSelectedId] = useState(selectedId);
  if (syncedSelectedId !== selectedId) {
    setSyncedSelectedId(selectedId);
    setTab("links");
    setEditingIdentity(false);
  }

  return (
    <div className={`${styles.root} ${styles.workspace}`} style={{ display: "grid", gap: 10, gridTemplateColumns: "220px minmax(0, 1fr)", height: "100%", minHeight: 0 }}>
      <aside className={styles.sidebar} style={{ borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0, paddingRight: 10 }}>
        <div className="block-label" style={{ marginBottom: 6 }}>
          <Gamepad2 size={14} strokeWidth={1.75} />
          game ops
        </div>
        <GameList
          games={games}
          onAdd={(name) => {
            const id = addGame(name);
            if (id) setSelectedId(id);
          }}
          onDeleted={(id) => setSelectedId((cur) => (cur === id ? (games.find((game) => game.id !== id)?.id ?? null) : cur))}
          onSelect={setSelectedId}
          selectedId={selectedId}
        />
      </aside>

      {!selected ? (
        <div className={styles.emptyWorkspace}>
          <Gamepad2 aria-hidden="true" size={22} strokeWidth={1.5} />
          <strong>{games.length === 0 ? "Add your first game" : "Select a game"}</strong>
          <span>{games.length === 0 ? "Create a workspace from the game list." : "Choose a game to open its workspace."}</span>
        </div>
      ) : (
        <div className={styles.detail} key={selected.id} style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          <div className={styles.detailHeader} style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
            <div className={styles.detailIdentity}>
              <span className="block-value">{selected.name}</span>
              <span>
                {selected.storeName || "store not set"}
                {selected.gameId ? ` · ${selected.gameId}` : ""}
              </span>
            </div>
            <div className={styles.detailActions}>
              {selected.liveLink.trim() && (
                <button aria-label="open live store page" className={styles.iconButton} onClick={() => openLink(selected.liveLink)} style={iconButtonStyle} type="button">
                  <ExternalLink size={13} strokeWidth={1.75} />
                </button>
              )}
              <button
                aria-label="edit game details"
                className={styles.iconButton}
                onClick={() => setEditingIdentity((v) => !v)}
                style={editingIdentity ? { ...iconButtonStyle, color: "var(--accent-cyan)" } : iconButtonStyle}
                type="button"
              >
                <Pencil size={13} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {editingIdentity && (
            <div className={`${styles.identityPanel} ${styles.slideDown}`} style={panelStyle}>
              <IdentityEditor game={selected} />
            </div>
          )}

          <TabBar gameId={selected.id} onChange={setTab} tab={tab} todoCount={selected.todos.filter((t) => !t.done).length} />

          <div style={{ ...scrollListStyle, flex: 1 }}>
            <TabBody game={selected} tab={tab} />
          </div>
        </div>
      )}
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
