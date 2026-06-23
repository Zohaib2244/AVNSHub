"use client";

import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { ArrowRight, Check, RefreshCw, Search } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";

type Definition = {
  definition: string;
  example?: string;
  synonyms: string[];
};

type Meaning = {
  partOfSpeech: string;
  definitions: Definition[];
};

type DictionaryPayload = {
  query: string;
  word: string;
  correctedWord?: string;
  phonetic?: string;
  meanings: Meaning[];
  synonyms: string[];
  suggestions: string[];
  sourceUrl?: string;
  error?: string;
  status: "exact" | "corrected" | "missing" | "error";
};

const FALLBACK_WORD = "serendipity";
const POLL_MS = 60 * 60_000;

function cleanInput(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 64);
}

function sameWord(a: string, b: string) {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function primaryDefinition(data: DictionaryPayload | null) {
  if (!data) return null;

  for (const meaning of data.meanings) {
    const first = meaning.definitions[0];
    if (first) return { partOfSpeech: meaning.partOfSpeech, ...first };
  }

  return null;
}

function settingText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
};

const inlineMetaStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  minWidth: 0,
};

const panelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  padding: "8px 10px",
};

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  textTransform: "uppercase",
};

const inputBaseStyle: CSSProperties = {
  ...monoStyle,
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  flex: "1 1 120px",
  minWidth: 0,
  outline: "none",
  padding: "0 10px",
};

const buttonBaseStyle: CSSProperties = {
  alignItems: "center",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  cursor: "pointer",
  display: "inline-flex",
  flex: "0 0 auto",
  fontFamily: "var(--font-dot-gothic), monospace",
  justifyContent: "center",
  textTransform: "uppercase",
};

const accentButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: "var(--accent-orange)",
  color: "var(--bg-card)",
};

const quietButtonStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: "var(--bg-nested)",
  color: "var(--text-primary)",
};

function DefinitionLine({ definition, lines = 2 }: { definition: string; lines?: number }) {
  return (
    <div
      className="block-sub"
      style={{
        display: "-webkit-box",
        overflow: "hidden",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
      }}
    >
      {definition}
    </div>
  );
}

function CorrectionLine({ data }: { data: DictionaryPayload | null }) {
  if (!data) {
    return <div className="block-sub">checking...</div>;
  }

  if (data.status === "corrected" && !sameWord(data.query, data.word)) {
    return (
      <div className="block-sub" style={inlineMetaStyle}>
        <span>{data.query}</span>
        <ArrowRight size={12} strokeWidth={1.75} />
        <span style={{ color: "var(--accent-orange)" }}>{data.word}</span>
      </div>
    );
  }

  if (data.error) {
    return <div className="block-sub">{data.error}</div>;
  }

  return (
    <div className="block-sub" style={inlineMetaStyle}>
      <Check size={12} strokeWidth={1.75} color="var(--accent-cyan)" />
      <span>spelled right</span>
    </div>
  );
}

function Suggestions({
  current,
  enabled,
  onPick,
  suggestions,
}: {
  current: string;
  enabled: boolean;
  onPick: (word: string) => void;
  suggestions: string[];
}) {
  if (!enabled || suggestions.length === 0) return null;

  const visible = suggestions.filter((word) => !sameWord(word, current)).slice(0, 5);
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {visible.map((word) => (
        <button
          aria-label={`check spelling suggestion ${word}`}
          key={word}
          onClick={() => onPick(word)}
          style={{
            ...quietButtonStyle,
            fontSize: "0.62rem",
            minHeight: 24,
            padding: "2px 8px",
          }}
          type="button"
        >
          {word}
        </button>
      ))}
    </div>
  );
}

export function DictionaryWidget() {
  const { settings, size } = useWidget();
  const defaultWord = cleanInput(settingText(settings.defaultWord, FALLBACK_WORD)) || FALLBACK_WORD;
  const showSuggestions = settings.showSuggestions !== false;
  const [draft, setDraft] = useState(defaultWord);
  const [lookup, setLookup] = useState(defaultWord);
  const url = useMemo(() => `/api/dictionary?word=${encodeURIComponent(lookup)}`, [lookup]);
  const { data, refresh } = usePolling<DictionaryPayload>(url, POLL_MS);
  const definition = primaryDefinition(data);
  const displayWord = data?.word ?? lookup;
  const hasCorrection = data?.status === "corrected" && !sameWord(data.query, data.word);

  function runLookup(nextWord: string) {
    const next = cleanInput(nextWord) || defaultWord;
    setDraft(next);
    if (sameWord(next, lookup)) {
      refresh();
      return;
    }
    setLookup(next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runLookup(draft);
  }

  const compact = size === "S";
  const inputStyle: CSSProperties = {
    ...inputBaseStyle,
    fontSize: compact ? "0.68rem" : "0.76rem",
    height: compact ? 28 : 34,
  };
  const iconButtonStyle: CSSProperties = {
    ...accentButtonStyle,
    height: compact ? 28 : 34,
    minWidth: compact ? 30 : 76,
    padding: compact ? 0 : "0 10px",
    gap: 6,
  };

  const searchForm = (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: 7, minWidth: 0 }}>
      <input
        aria-label="word to check"
        autoCapitalize="none"
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        placeholder="word"
        spellCheck={false}
        style={inputStyle}
        value={draft}
      />
      <button aria-label="check word" style={iconButtonStyle} type="submit">
        <Search size={compact ? 13 : 14} strokeWidth={1.9} />
        {!compact && <span>check</span>}
      </button>
      {!compact && (
        <button
          aria-label="refresh dictionary result"
          onClick={refresh}
          style={{
            ...quietButtonStyle,
            height: 34,
            minWidth: 34,
          }}
          type="button"
        >
          <RefreshCw size={13} strokeWidth={1.75} />
        </button>
      )}
    </form>
  );

  if (size === "S") {
    return (
      <div style={stackStyle}>
        {searchForm}
        <div
          className={`block-value${hasCorrection ? " accent" : ""}`}
          style={{
            fontSize: "0.92rem",
            lineHeight: 1.15,
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
          title={displayWord}
        >
          {displayWord}
        </div>
        {definition ? (
          <DefinitionLine definition={definition.definition} lines={1} />
        ) : (
          <CorrectionLine data={data} />
        )}
      </div>
    );
  }

  if (size === "M") {
    return (
      <div style={stackStyle}>
        {searchForm}
        <div style={panelStyle}>
          <div className={`block-value${hasCorrection ? " accent" : " teal"}`} style={{ whiteSpace: "normal" }}>
            {displayWord}
          </div>
          <CorrectionLine data={data} />
          {data?.phonetic && <div className="block-sub">{data.phonetic}</div>}
        </div>
        {definition ? (
          <DefinitionLine definition={definition.definition} />
        ) : (
          <Suggestions
            current={lookup}
            enabled={showSuggestions}
            onPick={runLookup}
            suggestions={data?.suggestions ?? []}
          />
        )}
        {definition && (
          <Suggestions
            current={displayWord}
            enabled={showSuggestions}
            onPick={runLookup}
            suggestions={data?.suggestions ?? []}
          />
        )}
      </div>
    );
  }

  const meaningRows = (data?.meanings ?? [])
    .flatMap((meaning) =>
      meaning.definitions.slice(0, 2).map((item) => ({
        ...item,
        partOfSpeech: meaning.partOfSpeech,
      })),
    )
    .slice(0, 5);

  return (
    <div style={stackStyle}>
      {searchForm}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ ...panelStyle, flex: "1 1 150px", minWidth: 0 }}>
          <div style={labelStyle}>lookup</div>
          <div className={`block-value${hasCorrection ? " accent" : " teal"}`} style={{ whiteSpace: "normal" }}>
            {displayWord}
          </div>
          <CorrectionLine data={data} />
        </div>
        <div style={{ ...panelStyle, flex: "1 1 130px", minWidth: 0 }}>
          <div style={labelStyle}>sound</div>
          <div className="block-value" style={{ fontSize: "1rem", whiteSpace: "normal" }}>
            {data?.phonetic ?? "no phonetic"}
          </div>
          <div className="block-sub">{definition?.partOfSpeech ?? data?.status ?? "loading"}</div>
        </div>
      </div>

      <div className="size-l-more" style={{ maxHeight: 190 }}>
        <div className="more-head">definitions</div>
        {meaningRows.length > 0 ? (
          meaningRows.map((item, index) => (
            <div className="more-row" key={`${item.partOfSpeech}-${index}`} style={{ alignItems: "flex-start" }}>
              <span style={{ overflowWrap: "anywhere" }}>{item.definition}</span>
              <span className="more-meta">{item.partOfSpeech}</span>
              {item.example && <span className="more-meta">{`"${item.example}"`}</span>}
            </div>
          ))
        ) : (
          <div className="block-sub">{data?.error ?? "checking definition..."}</div>
        )}

        {data?.synonyms && data.synonyms.length > 0 && (
          <>
            <div className="more-head">synonyms</div>
            <div className="block-sub" style={{ ...monoStyle, overflowWrap: "anywhere" }}>
              {data.synonyms.slice(0, 8).join(" / ")}
            </div>
          </>
        )}

        <div className="more-head">spelling hints</div>
        <Suggestions
          current={displayWord}
          enabled={showSuggestions}
          onPick={runLookup}
          suggestions={data?.suggestions ?? []}
        />
      </div>
    </div>
  );
}
