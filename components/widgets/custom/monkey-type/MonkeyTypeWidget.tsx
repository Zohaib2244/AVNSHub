"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWidget } from "@/components/framework/WidgetContext";

// ---- word list (common English words) ----
const WORDS = [
  "the","be","to","of","and","a","in","that","have","it","for","not","on","with",
  "he","as","you","do","at","this","but","his","by","from","they","we","say","her",
  "she","or","an","will","my","one","all","would","there","their","what","so","up",
  "out","if","about","who","get","which","go","me","when","make","can","like","time",
  "no","just","him","know","take","people","into","year","your","good","some","could",
  "them","see","other","than","then","now","look","only","come","its","over","think",
  "also","back","after","use","two","how","our","work","first","well","way","even",
  "new","want","because","any","these","give","day","most","us","between","need",
  "large","often","hand","high","place","hold","turn","was","were","said","each",
  "tell","does","set","three","air","put","end","why","again","off","play","small",
  "number","off","always","move","night","live","point","city","play","small","every",
  "found","still","should","between","stand","own","page","went","stop","ten","simple",
];

function sample(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
  }
  return out;
}

// ---- types ----
type CharState = "pending" | "correct" | "wrong" | "extra";
type TestState = "idle" | "running" | "done";

interface CharMeta {
  char: string;
  state: CharState;
}

interface WordMeta {
  chars: CharMeta[];
  typed: string;
  done: boolean;
}

function buildWords(words: string[]): WordMeta[] {
  return words.map((w) => ({
    chars: w.split("").map((c) => ({ char: c, state: "pending" as CharState })),
    typed: "",
    done: false,
  }));
}

function calcStats(words: WordMeta[], elapsedMs: number) {
  let correct = 0;
  let total = 0;
  for (const w of words) {
    if (!w.done) continue;
    for (let i = 0; i < w.typed.length; i++) {
      total++;
      if (w.typed[i] === w.chars[i]?.char) correct++;
    }
    total++; // space
    correct++; // space counted correct if word done
  }
  const minutes = elapsedMs / 60000;
  const wpm = minutes > 0 ? Math.round(correct / 5 / minutes) : 0;
  const acc = total > 0 ? Math.round((correct / total) * 100) : 100;
  return { wpm, acc };
}

// ---- styles ----
const mono: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const dot: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.55rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

function charColor(state: CharState): string {
  if (state === "correct") return "var(--text-primary)";
  if (state === "wrong") return "var(--accent-orange)";
  if (state === "extra") return "var(--accent-orange)";
  return "var(--text-muted)";
}

// ---- sub-components ----
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "var(--bg-nested)",
        border: "1.5px solid var(--border)",
        borderRadius: 10,
        boxShadow: "2px 2px 0 var(--shadow)",
        display: "flex",
        flexDirection: "column",
        minWidth: 52,
        padding: "4px 10px",
      }}
    >
      <span style={dot}>{label}</span>
      <span style={{ ...mono, color: "var(--text-primary)", fontSize: "0.82rem", fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

function WordDisplay({
  words,
  activeWord,
  fontSize,
  lineClamp,
}: {
  words: WordMeta[];
  activeWord: number;
  fontSize: string;
  lineClamp: number;
}) {
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeRef.current || !containerRef.current) return;
    const el = activeRef.current;
    const box = containerRef.current;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const boxHeight = box.clientHeight;
    if (elBottom > box.scrollTop + boxHeight) {
      box.scrollTop = elTop - boxHeight / 2;
    }
  }, [activeWord]);

  return (
    <div
      ref={containerRef}
      style={{
        lineHeight: 1.75,
        maxHeight: `calc(${lineClamp} * 1.75 * ${fontSize})`,
        overflow: "hidden",
        position: "relative",
        wordBreak: "break-word",
      }}
    >
      {words.map((word, wi) => {
        const isActive = wi === activeWord;
        const extras = word.typed.length > word.chars.length
          ? word.typed.slice(word.chars.length).split("")
          : [];

        return (
          <span
            key={wi}
            ref={isActive ? activeRef : undefined}
            style={{
              display: "inline-block",
              marginRight: "0.45em",
              outline: isActive ? "1.5px solid var(--border)" : "none",
              borderRadius: 3,
              padding: "0 1px",
            }}
          >
            {word.chars.map((ch, ci) => (
              <span
                key={ci}
                style={{
                  ...mono,
                  color: charColor(ch.state),
                  fontSize,
                  transition: "color 0.08s",
                }}
              >
                {ch.char}
              </span>
            ))}
            {extras.map((ex, ei) => (
              <span
                key={`ex-${ei}`}
                style={{ ...mono, color: charColor("extra"), fontSize }}
              >
                {ex}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

// ---- main hook ----
function useTypingTest(wordCount: number) {
  const [words, setWords] = useState<WordMeta[]>(() => buildWords(sample(wordCount)));
  const [activeWord, setActiveWord] = useState(0);
  const [input, setInput] = useState("");
  const [state, setState] = useState<TestState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [liveWpm, setLiveWpm] = useState(0);
  const startRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTick();
    setWords(buildWords(sample(wordCount)));
    setActiveWord(0);
    setInput("");
    setState("idle");
    setElapsed(0);
    setLiveWpm(0);
  }, [wordCount, clearTick]);

  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => () => clearTick(), [clearTick]);

  const handleInput = useCallback(
    (value: string) => {
      if (state === "done") return;

      if (state === "idle" && value.length > 0) {
        setState("running");
        startRef.current = Date.now();
        tickRef.current = setInterval(() => {
          setElapsed(Date.now() - startRef.current);
        }, 200);
      }

      // space = advance word
      if (value.endsWith(" ")) {
        const typed = value.trimEnd();
        setWords((prev) => {
          const next = prev.map((w, i) => {
            if (i !== activeWord) return w;
            const chars = w.chars.map((ch, ci) => ({
              ...ch,
              state: (typed[ci] === ch.char ? "correct" : "wrong") as CharState,
            }));
            return { ...w, chars, typed, done: true };
          });

          const allDone = activeWord >= next.length - 1;
          if (allDone) {
            clearTick();
            const ms = Date.now() - startRef.current;
            setElapsed(ms);
            setState("done");
          } else {
            setActiveWord((w) => w + 1);
          }

          // live wpm update
          const ms = Date.now() - startRef.current;
          const { wpm } = calcStats(next, ms);
          setLiveWpm(wpm);

          return next;
        });
        setInput("");
        return;
      }

      // backspace on empty = go back a word (only if prev word was wrong)
      if (value === "" && input === "") {
        setActiveWord((prev) => {
          if (prev === 0) return prev;
          const newActive = prev - 1;
          setWords((ws) =>
            ws.map((w, i) =>
              i === newActive ? { ...w, done: false, typed: "" } : w
            )
          );
          return newActive;
        });
        return;
      }

      // normal typing -- update char states live
      setInput(value);
      setWords((prev) =>
        prev.map((w, i) => {
          if (i !== activeWord) return w;
          const chars = w.chars.map((ch, ci) => {
            if (ci >= value.length) return { ...ch, state: "pending" as CharState };
            return {
              ...ch,
              state: (value[ci] === ch.char ? "correct" : "wrong") as CharState,
            };
          });
          return { ...w, chars, typed: value };
        })
      );
    },
    [state, activeWord, input, clearTick]
  );

  const stats = useMemo(() => calcStats(words, elapsed), [words, elapsed]);

  return { words, activeWord, input, state, elapsed, liveWpm, stats, handleInput, reset };
}

// ---- widget ----
export function MonkeyTypeWidget() {
  const { size, settings } = useWidget();
  const wordCount = Number(settings.wordCount ?? 25);
  const showLiveWpm = settings.showLiveWpm !== false;
  const showAccuracy = settings.showAccuracy !== false;

  const { words, activeWord, input, state, elapsed, liveWpm, stats, handleInput, reset } =
    useTypingTest(wordCount);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const wpm = state === "done" ? stats.wpm : state === "running" ? liveWpm : 0;
  const elapsedSec = (elapsed / 1000).toFixed(1);

  // ---- S: minimal ----
  if (size === "S") {
    return (
      <div
        onClick={focusInput}
        style={{
          alignItems: "center",
          cursor: "text",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          height: "100%",
          justifyContent: "center",
          userSelect: "none",
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => handleInput(e.target.value)}
          style={{ opacity: 0, pointerEvents: "none", position: "absolute" }}
          tabIndex={-1}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {state === "done" ? (
          <>
            <div
              style={{ ...mono, color: "var(--accent-orange)", fontSize: "1.9rem", fontWeight: 500, lineHeight: 1 }}
            >
              {wpm}
            </div>
            <div style={{ ...dot, color: "var(--text-muted)" }}>wpm</div>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              style={{
                background: "none",
                border: "1.5px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-dot-gothic), monospace",
                fontSize: "0.55rem",
                letterSpacing: "0.1em",
                marginTop: 2,
                padding: "3px 8px",
                textTransform: "uppercase",
              }}
            >
              retry
            </button>
          </>
        ) : (
          <>
            <div style={{ ...dot, color: "var(--text-muted)", textAlign: "center" }}>
              {state === "idle" ? "tap to type" : `${elapsedSec}s`}
            </div>
            <div style={{ ...mono, color: "var(--text-primary)", fontSize: "0.7rem" }}>
              {words[activeWord]?.chars.map((c) => c.char).join("") ?? ""}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- M: word display + input ----
  if (size === "M") {
    return (
      <div
        onClick={focusInput}
        style={{
          cursor: "text",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          height: "100%",
          userSelect: "none",
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => handleInput(e.target.value)}
          style={{ opacity: 0, pointerEvents: "none", position: "absolute" }}
          tabIndex={-1}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {state === "done" ? (
          <div style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", gap: 10, justifyContent: "center" }}>
            <div style={{ ...dot, color: "var(--text-muted)" }}>results</div>
            <div style={{ ...mono, color: "var(--accent-orange)", fontSize: "2.6rem", fontWeight: 500, lineHeight: 1 }}>
              {wpm}
            </div>
            <div style={{ ...dot }}>wpm</div>
            <div style={{ display: "flex", gap: 6 }}>
              <StatPill label="acc" value={`${stats.acc}%`} />
              <StatPill label="time" value={`${elapsedSec}s`} />
              <StatPill label="words" value={wordCount} />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              style={{
                background: "none",
                border: "1.5px solid var(--border)",
                borderRadius: 10,
                boxShadow: "2px 2px 0 var(--shadow)",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-dot-gothic), monospace",
                fontSize: "0.58rem",
                letterSpacing: "0.12em",
                marginTop: 4,
                padding: "5px 14px",
                textTransform: "uppercase",
              }}
            >
              retry
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
              {showLiveWpm && state === "running" && (
                <span style={{ ...mono, color: "var(--accent-orange)", fontSize: "0.78rem" }}>
                  {liveWpm} <span style={dot}>wpm</span>
                </span>
              )}
              {state === "idle" && (
                <span style={{ ...dot, color: "var(--text-muted)" }}>start typing...</span>
              )}
              {state === "running" && (
                <span style={{ ...dot, alignSelf: "center", color: "var(--text-muted)", marginLeft: "auto" }}>
                  {elapsedSec}s
                </span>
              )}
            </div>

            <WordDisplay
              words={words}
              activeWord={activeWord}
              fontSize="0.8rem"
              lineClamp={3}
            />

            <div
              style={{
                background: "var(--bg-nested)",
                border: "1.5px solid var(--border)",
                borderRadius: 8,
                boxShadow: "2px 2px 0 var(--shadow)",
                marginTop: "auto",
                overflow: "hidden",
              }}
            >
              <input
                value={input}
                onChange={(e) => handleInput(e.target.value)}
                placeholder="type here..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{
                  ...mono,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: "0.78rem",
                  outline: "none",
                  padding: "6px 10px",
                  width: "100%",
                }}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- L: full test view ----
  return (
    <div
      onClick={focusInput}
      style={{
        cursor: "text",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: "100%",
        userSelect: "none",
      }}
    >
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => handleInput(e.target.value)}
        style={{ opacity: 0, pointerEvents: "none", position: "absolute" }}
        tabIndex={-1}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {state === "done" ? (
        <div style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", gap: 12, justifyContent: "center" }}>
          <div style={dot}>results</div>
          <div style={{ ...mono, color: "var(--accent-orange)", fontSize: "3.5rem", fontWeight: 500, lineHeight: 1 }}>
            {wpm}
          </div>
          <div style={dot}>words per minute</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 }}>
            <StatPill label="accuracy" value={`${stats.acc}%`} />
            <StatPill label="time" value={`${elapsedSec}s`} />
            <StatPill label="words" value={wordCount} />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); reset(); }}
            style={{
              background: "none",
              border: "1.5px solid var(--border)",
              borderRadius: 10,
              boxShadow: "3px 3px 0 var(--shadow)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "var(--font-dot-gothic), monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.14em",
              marginTop: 8,
              padding: "6px 18px",
              textTransform: "uppercase",
            }}
          >
            retry
          </button>
        </div>
      ) : (
        <>
          <div style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, paddingBottom: 8 }}>
            <span style={{ ...dot, color: "var(--text-muted)" }}>{wordCount} words</span>
            {showLiveWpm && state === "running" && (
              <span style={{ ...mono, color: "var(--accent-orange)", fontSize: "0.8rem", marginLeft: "auto" }}>
                {liveWpm} wpm
              </span>
            )}
            {showAccuracy && state === "running" && (
              <span style={{ ...mono, color: "var(--accent-cyan)", fontSize: "0.8rem" }}>
                {stats.acc}%
              </span>
            )}
            {state === "running" && (
              <span style={{ ...dot, color: "var(--text-muted)" }}>{elapsedSec}s</span>
            )}
            {state === "idle" && (
              <span style={{ ...dot, color: "var(--text-muted)", marginLeft: "auto" }}>start typing...</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              style={{
                background: "none",
                border: "1.5px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-dot-gothic), monospace",
                fontSize: "0.52rem",
                letterSpacing: "0.1em",
                marginLeft: state === "idle" ? 0 : "auto",
                padding: "3px 8px",
                textTransform: "uppercase",
              }}
            >
              reset
            </button>
          </div>

          <WordDisplay
            words={words}
            activeWord={activeWord}
            fontSize="0.9rem"
            lineClamp={4}
          />

          <div
            style={{
              background: "var(--bg-nested)",
              border: "1.5px solid var(--border)",
              borderRadius: 10,
              boxShadow: "2px 2px 0 var(--shadow)",
              marginTop: "auto",
              overflow: "hidden",
            }}
          >
            <input
              value={input}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="type here..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{
                ...mono,
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                outline: "none",
                padding: "8px 12px",
                width: "100%",
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
