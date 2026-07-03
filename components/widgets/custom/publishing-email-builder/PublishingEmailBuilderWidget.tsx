"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

type StageOption = "Beta" | "Production" | "Other/custom";

type SavedGame = {
  uid: string;
  name: string;
  gameId: string;
  storeName: string;
  liveLink: string;
};

type BuildDraft = {
  stage: StageOption;
  customStage: string;
  versionNumber: string;
  bundleCode: string;
  previousRollOut: string;
  newRollOut: string;
  countryBased: string;
  bundleLink: string;
  releaseNotes: string;
};

type GameForm = Omit<SavedGame, "uid">;

const GAMES_STORAGE_KEY = "publishing-email-builder:games";
const DRAFTS_STORAGE_KEY = "publishing-email-builder:drafts";
const SELECTED_STORAGE_KEY = "publishing-email-builder:selected-game";

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.56rem",
  fontWeight: 400,
  letterSpacing: "0.08em",
  padding: 0,
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

const controlStyle: CSSProperties = {
  ...monoStyle,
  background: "var(--bg-card)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  color: "var(--text-primary)",
  fontSize: "0.58rem",
  height: 24,
  minWidth: 0,
  outline: "none",
  padding: "3px 7px",
  width: "100%",
};

const textAreaStyle: CSSProperties = {
  ...controlStyle,
  height: 30,
  lineHeight: 1.25,
  resize: "none",
};

const buttonBaseStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.56rem",
  letterSpacing: "0.1em",
  minHeight: 24,
  padding: "3px 8px",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const rowStyle: CSSProperties = {
  alignItems: "center",
  display: "grid",
  gap: 5,
  gridTemplateColumns: "58px minmax(0, 1fr)",
  minHeight: 24,
};

const tightRowStyle: CSSProperties = {
  ...rowStyle,
  gridTemplateColumns: "42px minmax(0, 1fr)",
  minHeight: 21,
};

const emptyGameForm: GameForm = {
  name: "",
  gameId: "",
  storeName: "",
  liveLink: "",
};

function createDefaultDraft(): BuildDraft {
  return {
    stage: "Production",
    customStage: "",
    versionNumber: "",
    bundleCode: "",
    previousRollOut: "",
    newRollOut: "",
    countryBased: "",
    bundleLink: "",
    releaseNotes: "",
  };
}

function createUid() {
  const browserCrypto = typeof crypto !== "undefined" ? (crypto as { randomUUID?: () => string }) : null;
  if (browserCrypto && typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }
  return `game-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isStageOption(value: unknown): value is StageOption {
  return value === "Beta" || value === "Production" || value === "Other/custom";
}

function parseGames(value: unknown): SavedGame[] {
  if (!Array.isArray(value)) return [];

  const games: SavedGame[] = [];
  value.forEach((item) => {
    if (!isRecord(item)) return;

    games.push({
      uid: readString(item.uid) || createUid(),
      name: readString(item.name).trim(),
      gameId: readString(item.gameId).trim(),
      storeName: readString(item.storeName).trim(),
      liveLink: readString(item.liveLink).trim(),
    });
  });

  return games;
}

function parseDraft(value: unknown): BuildDraft {
  if (!isRecord(value)) return createDefaultDraft();

  return {
    stage: isStageOption(value.stage) ? value.stage : "Production",
    customStage: readString(value.customStage),
    versionNumber: readString(value.versionNumber),
    bundleCode: readString(value.bundleCode),
    previousRollOut: readString(value.previousRollOut),
    newRollOut: readString(value.newRollOut),
    countryBased: readString(value.countryBased),
    bundleLink: readString(value.bundleLink),
    releaseNotes: readString(value.releaseNotes),
  };
}

function parseDrafts(value: unknown): Record<string, BuildDraft> {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, BuildDraft>>((drafts, [uid, draft]) => {
    drafts[uid] = parseDraft(draft);
    return drafts;
  }, {});
}

function readStoredJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence is best effort inside the dashboard.
  }
}

function gameToForm(game: SavedGame): GameForm {
  return {
    name: game.name,
    gameId: game.gameId,
    storeName: game.storeName,
    liveLink: game.liveLink,
  };
}

function displayText(value: string | undefined, fallback: string) {
  const clean = value?.trim();
  return clean || fallback;
}

function stageValue(draft: BuildDraft) {
  if (draft.stage !== "Other/custom") return draft.stage;
  return draft.customStage.trim() || "Other/custom";
}

function previousRolloutValue(value: string) {
  const clean = value.replace("%", "").trim();
  return clean === "0" ? "Halt" : value.trim();
}

function composeEmail(game: SavedGame, draft: BuildDraft) {
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
  if (countryBased) {
    lines.push(`Country Based: ${countryBased}`);
  }

  lines.push(`Bundle Link: ${draft.bundleLink.trim()}`, "", "---");

  const releaseNotes = draft.releaseNotes.trim();
  if (releaseNotes) {
    lines.push(`Release Notes: ${releaseNotes}`, "");
  }

  lines.push(
    "Attached is the finalized publishing checklist confirming all technical and operational requirements have been met",
    "",
    "Best Regards,",
    "Zohaib Shahjehan",
  );

  return lines.join("\n");
}

function buttonStyle(kind: "primary" | "normal", disabled = false, copied = false): CSSProperties {
  return {
    ...buttonBaseStyle,
    color: disabled ? "var(--text-muted)" : copied ? "var(--accent-cyan)" : kind === "primary" ? "var(--accent-orange)" : "var(--text-primary)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.66 : 1,
  };
}

function badgeStyle(tone: "ok" | "warn" = "ok"): CSSProperties {
  return {
    alignItems: "center",
    background: tone === "ok" ? "var(--accent-cyan)" : "var(--accent-orange)",
    border: "1.5px solid var(--border)",
    borderRadius: 12,
    boxShadow: "2px 2px 0 var(--shadow)",
    color: "var(--bg-card)",
    display: "inline-flex",
    fontFamily: "var(--font-dot-gothic), monospace",
    fontSize: "0.52rem",
    letterSpacing: "0.1em",
    minHeight: 22,
    padding: "3px 7px",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea copy path.
    }
  }

  const box = document.createElement("textarea");
  box.value = text;
  box.style.position = "fixed";
  box.style.left = "-9999px";
  document.body.appendChild(box);
  box.focus();
  box.select();
  document.execCommand("copy");
  box.remove();
}

export function PublishingEmailBuilderWidget() {
  const { size } = useWidget();
  const [games, setGames] = useState<SavedGame[]>([]);
  const [drafts, setDrafts] = useState<Record<string, BuildDraft>>({});
  const [selectedGameId, setSelectedGameId] = useState("");
  const [gameForm, setGameForm] = useState<GameForm>(emptyGameForm);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [isLoaded, setIsLoaded] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const storedGames = parseGames(readStoredJson(GAMES_STORAGE_KEY));
    const storedDrafts = parseDrafts(readStoredJson(DRAFTS_STORAGE_KEY));
    const storedSelected = readString(readStoredJson(SELECTED_STORAGE_KEY));
    const selected = storedGames.find((game) => game.uid === storedSelected) ?? storedGames[0] ?? null;

    setGames(storedGames);
    setDrafts(storedDrafts);
    setSelectedGameId(selected?.uid ?? "");
    setEditingGameId(selected?.uid ?? null);
    setGameForm(selected ? gameToForm(selected) : emptyGameForm);
    setIsEditorOpen(storedGames.length === 0);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    writeStoredJson(GAMES_STORAGE_KEY, games);
  }, [games, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    writeStoredJson(DRAFTS_STORAGE_KEY, drafts);
  }, [drafts, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    writeStoredJson(SELECTED_STORAGE_KEY, selectedGameId);
  }, [selectedGameId, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    if (games.length === 0) {
      setSelectedGameId("");
      setIsEditorOpen(true);
      return;
    }

    if (!games.some((game) => game.uid === selectedGameId)) {
      setSelectedGameId(games[0]?.uid ?? "");
    }
  }, [games, isLoaded, selectedGameId]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const selectedGame = useMemo(() => {
    return games.find((game) => game.uid === selectedGameId) ?? games[0] ?? null;
  }, [games, selectedGameId]);

  const currentDraft = selectedGame ? drafts[selectedGame.uid] ?? createDefaultDraft() : createDefaultDraft();

  function updateDraft(patch: Partial<BuildDraft>) {
    if (!selectedGame) return;

    setDrafts((previous) => ({
      ...previous,
      [selectedGame.uid]: {
        ...createDefaultDraft(),
        ...previous[selectedGame.uid],
        ...patch,
      },
    }));
  }

  function selectGame(uid: string) {
    const game = games.find((item) => item.uid === uid);
    if (!game) return;

    setSelectedGameId(uid);
    setEditingGameId(uid);
    setGameForm(gameToForm(game));
    setIsEditorOpen(false);
    setCopyState("idle");
  }

  function startAddGame() {
    setEditingGameId(null);
    setGameForm(emptyGameForm);
    setIsEditorOpen(true);
    setCopyState("idle");
  }

  function startEditGame() {
    if (!selectedGame) {
      startAddGame();
      return;
    }

    setEditingGameId(selectedGame.uid);
    setGameForm(gameToForm(selectedGame));
    setIsEditorOpen(true);
    setCopyState("idle");
  }

  function saveGame() {
    const savedGame: SavedGame = {
      uid: editingGameId ?? createUid(),
      name: gameForm.name.trim(),
      gameId: gameForm.gameId.trim(),
      storeName: gameForm.storeName.trim(),
      liveLink: gameForm.liveLink.trim(),
    };

    setGames((previous) => {
      const exists = previous.some((game) => game.uid === savedGame.uid);
      if (!exists) return [...previous, savedGame];
      return previous.map((game) => (game.uid === savedGame.uid ? savedGame : game));
    });
    setSelectedGameId(savedGame.uid);
    setEditingGameId(savedGame.uid);
    setGameForm(gameToForm(savedGame));
    setIsEditorOpen(false);
    setCopyState("idle");
  }

  async function handleCopy() {
    if (!selectedGame) return;

    await copyText(composeEmail(selectedGame, currentDraft));
    setCopyState("copied");
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 1200);
  }

  function renderField(
    label: string,
    control: ReactNode,
    options: { compact?: boolean; wide?: boolean } = {},
  ) {
    return (
      <label
        className="more-row"
        style={{
          ...(options.compact ? tightRowStyle : rowStyle),
          ...(options.wide ? { gridColumn: "1 / -1" } : {}),
        }}
      >
        <span className="block-label" style={labelStyle}>
          {label}
        </span>
        {control}
      </label>
    );
  }

  function renderPanelTitle(title: string, side?: ReactNode) {
    return (
      <div
        className="more-head"
        style={{
          alignItems: "center",
          color: "var(--text-muted)",
          display: "flex",
          fontFamily: "var(--font-dot-gothic), monospace",
          fontSize: "0.56rem",
          justifyContent: "space-between",
          letterSpacing: "0.12em",
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        <span>{title}</span>
        {side}
      </div>
    );
  }

  function renderGameCard(game: SavedGame, compact = false) {
    const selected = selectedGame?.uid === game.uid;

    return (
      <button
        className="more-row"
        key={game.uid}
        onClick={() => selectGame(game.uid)}
        style={{
          ...monoStyle,
          background: "var(--bg-card)",
          border: "1.5px solid var(--border)",
          borderRadius: 12,
          boxShadow: "2px 2px 0 var(--shadow)",
          color: selected ? "var(--accent-cyan)" : "var(--text-primary)",
          cursor: "pointer",
          display: "grid",
          gap: 1,
          minWidth: 0,
          padding: compact ? "4px 6px" : "5px 7px",
          textAlign: "left",
          width: "100%",
        }}
        type="button"
      >
        <span
          className="block-value"
          style={{
            fontSize: compact ? "0.62rem" : "0.68rem",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayText(game.name, "Untitled game")}
        </span>
        <span
          className="block-sub"
          style={{
            color: "var(--text-muted)",
            fontSize: compact ? "0.5rem" : "0.55rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {compact ? displayText(game.storeName, "No store") : `${displayText(game.storeName, "No store")} | ${displayText(game.gameId, "No ID")}`}
        </span>
      </button>
    );
  }

  function renderGameEditor(compact = false, showClose = true) {
    return (
      <div style={{ display: "grid", gap: compact ? 4 : 5, minHeight: 0 }}>
        {renderPanelTitle(editingGameId ? "edit game" : "add game", <span style={badgeStyle("ok")}>local</span>)}
        {renderField(
          "name",
          <input
            aria-label="Game Name"
            onChange={(event) => setGameForm((previous) => ({ ...previous, name: event.target.value }))}
            style={{ ...controlStyle, height: compact ? 21 : 24, fontSize: compact ? "0.54rem" : "0.58rem" }}
            value={gameForm.name}
          />,
          { compact },
        )}
        {renderField(
          "id",
          <input
            aria-label="Game ID"
            onChange={(event) => setGameForm((previous) => ({ ...previous, gameId: event.target.value }))}
            style={{ ...controlStyle, height: compact ? 21 : 24, fontSize: compact ? "0.54rem" : "0.58rem" }}
            value={gameForm.gameId}
          />,
          { compact },
        )}
        {renderField(
          "store",
          <input
            aria-label="Store Name"
            onChange={(event) => setGameForm((previous) => ({ ...previous, storeName: event.target.value }))}
            style={{ ...controlStyle, height: compact ? 21 : 24, fontSize: compact ? "0.54rem" : "0.58rem" }}
            value={gameForm.storeName}
          />,
          { compact },
        )}
        {renderField(
          "live",
          <input
            aria-label="Live Link"
            onChange={(event) => setGameForm((previous) => ({ ...previous, liveLink: event.target.value }))}
            style={{ ...controlStyle, height: compact ? 21 : 24, fontSize: compact ? "0.54rem" : "0.58rem" }}
            value={gameForm.liveLink}
          />,
          { compact },
        )}
        <div style={{ alignItems: "center", display: "flex", gap: 5, minWidth: 0 }}>
          <button onClick={saveGame} style={buttonStyle("normal")} type="button">
            Save Game
          </button>
          {showClose && games.length > 0 && (
            <button onClick={() => setIsEditorOpen(false)} style={buttonStyle("normal")} type="button">
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderBuildForm(compact = false) {
    const disabled = !selectedGame;
    const inputHeight = compact ? 21 : 24;
    const fontSize = compact ? "0.54rem" : "0.58rem";

    return (
      <div
        style={{
          display: "grid",
          gap: compact ? 4 : 5,
          gridTemplateColumns: "1fr 1fr",
          minHeight: 0,
        }}
      >
        {renderField(
          "stage",
          <select
            aria-label="Stage"
            disabled={disabled}
            onChange={(event) => updateDraft({ stage: event.target.value as StageOption })}
            style={{ ...controlStyle, height: inputHeight, fontSize }}
            value={currentDraft.stage}
          >
            <option value="Beta">Beta</option>
            <option value="Production">Production</option>
            <option value="Other/custom">Other/custom</option>
          </select>,
          { compact },
        )}
        {currentDraft.stage === "Other/custom" &&
          renderField(
            "custom",
            <input
              aria-label="Custom Stage"
              disabled={disabled}
              onChange={(event) => updateDraft({ customStage: event.target.value })}
              style={{ ...controlStyle, height: inputHeight, fontSize }}
              value={currentDraft.customStage}
            />,
            { compact },
          )}
        {renderField(
          compact ? "ver" : "version",
          <input
            aria-label="Version Number"
            disabled={disabled}
            onChange={(event) => updateDraft({ versionNumber: event.target.value })}
            style={{ ...controlStyle, height: inputHeight, fontSize }}
            value={currentDraft.versionNumber}
          />,
          { compact },
        )}
        {renderField(
          "code",
          <input
            aria-label="Bundle Code"
            disabled={disabled}
            onChange={(event) => updateDraft({ bundleCode: event.target.value })}
            style={{ ...controlStyle, height: inputHeight, fontSize }}
            value={currentDraft.bundleCode}
          />,
          { compact },
        )}
        {renderField(
          "prev",
          <input
            aria-label="Previous RollOut"
            disabled={disabled}
            onChange={(event) => updateDraft({ previousRollOut: event.target.value })}
            placeholder="0 or 50%"
            style={{ ...controlStyle, height: inputHeight, fontSize }}
            value={currentDraft.previousRollOut}
          />,
          { compact },
        )}
        {renderField(
          "new",
          <input
            aria-label="New RollOut"
            disabled={disabled}
            onChange={(event) => updateDraft({ newRollOut: event.target.value })}
            placeholder="100%"
            style={{ ...controlStyle, height: inputHeight, fontSize }}
            value={currentDraft.newRollOut}
          />,
          { compact },
        )}
        {renderField(
          "country",
          <input
            aria-label="Country Based"
            disabled={disabled}
            onChange={(event) => updateDraft({ countryBased: event.target.value })}
            placeholder="optional"
            style={{ ...controlStyle, height: inputHeight, fontSize }}
            value={currentDraft.countryBased}
          />,
          { compact },
        )}
        {renderField(
          compact ? "link" : "bundle",
          <input
            aria-label="Bundle Link"
            disabled={disabled}
            onChange={(event) => updateDraft({ bundleLink: event.target.value })}
            style={{ ...controlStyle, height: inputHeight, fontSize }}
            value={currentDraft.bundleLink}
          />,
          { compact },
        )}
        {renderField(
          "notes",
          <textarea
            aria-label="Release Notes"
            disabled={disabled}
            onChange={(event) => updateDraft({ releaseNotes: event.target.value })}
            placeholder="optional"
            style={{ ...textAreaStyle, height: compact ? 24 : 36, fontSize }}
            value={currentDraft.releaseNotes}
          />,
          { compact, wide: true },
        )}
      </div>
    );
  }

  function renderCopyButton(compact = false) {
    const disabled = !selectedGame;

    return (
      <button
        disabled={disabled}
        onClick={handleCopy}
        style={{
          ...buttonStyle("primary", disabled, copyState === "copied"),
          justifySelf: compact ? "stretch" : "start",
          width: compact ? "100%" : undefined,
        }}
        type="button"
      >
        {copyState === "copied" ? "Copied" : "Copy Email"}
      </button>
    );
  }

  function renderMedium() {
    if (games.length === 0) {
      return (
        <div
          style={{
            ...monoStyle,
            display: "grid",
            height: "100%",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ ...panelStyle, overflowY: "auto" }}>{renderGameEditor(true, false)}</div>
        </div>
      );
    }

    return (
      <div
        style={{
          ...monoStyle,
          display: "grid",
          gap: 6,
          gridTemplateColumns: "100px minmax(0, 1fr)",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ ...panelStyle, padding: 6 }}>
          <div style={{ display: "grid", gap: 5, minHeight: 0 }}>
            {renderPanelTitle("game")}
            <select
              aria-label="Saved game"
              onChange={(event) => selectGame(event.target.value)}
              style={{ ...controlStyle, height: 22, fontSize: "0.54rem" }}
              value={selectedGame?.uid ?? ""}
            >
              {games.map((game) => (
                <option key={game.uid} value={game.uid}>
                  {displayText(game.name, "Untitled game")}
                </option>
              ))}
            </select>
            <div className="block-sub" style={{ color: "var(--text-muted)", fontSize: "0.5rem", lineHeight: 1.25, overflow: "hidden" }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayText(selectedGame?.storeName, "No store")}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayText(selectedGame?.liveLink, "No live link")}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              <button onClick={startAddGame} style={buttonStyle("normal")} type="button">
                Add
              </button>
              <button disabled={!selectedGame} onClick={startEditGame} style={buttonStyle("normal", !selectedGame)} type="button">
                Edit
              </button>
            </div>
          </div>
        </div>
        <div style={{ minHeight: 0, overflowY: "auto" }}>
          {isEditorOpen ? (
            renderGameEditor(true, true)
          ) : (
            <div style={{ display: "grid", gap: 6, minHeight: 0 }}>
              {renderBuildForm(true)}
              {renderCopyButton(true)}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderLarge() {
    return (
      <div
        style={{
          ...monoStyle,
          display: "grid",
          gap: 8,
          gridTemplateColumns: "184px minmax(0, 1fr)",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ ...panelStyle, display: "grid", gap: 7, gridTemplateRows: "minmax(0, 1fr) auto", padding: 8 }}>
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            {renderPanelTitle("game vault", <span style={badgeStyle("ok")}>local</span>)}
            {games.length > 0 ? (
              <div style={{ display: "grid", gap: 5, maxHeight: "100%", overflowY: "auto", paddingRight: 2 }}>
                {games.map((game) => renderGameCard(game))}
              </div>
            ) : (
              <div className="block-sub" style={{ color: "var(--text-muted)", fontSize: "0.55rem", lineHeight: 1.3 }}>
                Add the first game below.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={startAddGame} style={buttonStyle("normal")} type="button">
              Add Game
            </button>
            <button disabled={!selectedGame} onClick={startEditGame} style={buttonStyle("normal", !selectedGame)} type="button">
              Edit
            </button>
          </div>
        </div>

        <div style={{ ...panelStyle, display: "grid", gap: 7, gridTemplateRows: "auto minmax(0, 1fr)", padding: 8 }}>
          <div style={{ minHeight: 0 }}>
            {renderPanelTitle("selected game", <span style={badgeStyle(selectedGame ? "ok" : "warn")}>{selectedGame ? "saved" : "empty"}</span>)}
            <div style={{ display: "grid", gap: 4 }}>
              <div className="more-row" style={rowStyle}>
                <span className="block-label" style={labelStyle}>
                  name
                </span>
                <span className="block-value" style={{ color: "var(--text-primary)", fontSize: "0.62rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayText(selectedGame?.name, "No game")}
                </span>
              </div>
              <div className="more-row" style={rowStyle}>
                <span className="block-label" style={labelStyle}>
                  store
                </span>
                <span className="block-sub" style={{ color: "var(--text-muted)", fontSize: "0.56rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayText(selectedGame?.storeName, "No store")}
                </span>
              </div>
              <div className="more-row" style={rowStyle}>
                <span className="block-label" style={labelStyle}>
                  live
                </span>
                <span className="block-sub" style={{ color: "var(--text-muted)", fontSize: "0.56rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayText(selectedGame?.liveLink, "No live link")}
                </span>
              </div>
            </div>
          </div>

          <div style={{ minHeight: 0, overflowY: "auto" }}>
            {isEditorOpen ? (
              renderGameEditor(false, true)
            ) : (
              <>
                {renderPanelTitle("build fields")}
                {renderBuildForm()}
                <div style={{ marginTop: 6 }}>{renderCopyButton()}</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (size === "L") return renderLarge();
  return renderMedium();
}
