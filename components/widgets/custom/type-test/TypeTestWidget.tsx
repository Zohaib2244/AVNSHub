"use client";

import { useWidget } from "@/components/framework/WidgetContext";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const PASSAGES: Record<string, string[]> = {
  easy: [
    "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the alphabet at least once. It is a classic typing test phrase that has been used for decades to practice typing skills.",
    "A gentle breeze blew through the open window, carrying the sweet scent of flowers from the garden below. The warm sunlight filled the room with a soft golden glow, creating long shadows across the wooden floor.",
    "The sun set behind the mountains, painting the sky in shades of orange and pink. Birds flew home to their nests as the cool evening air began to settle over the quiet valley below.",
  ],
  medium: [
    "The evolution of technology has fundamentally changed how we communicate, work, and live our daily lives. From the invention of the printing press to the rise of artificial intelligence, each technological leap has brought both unprecedented opportunities and complex challenges that society continues to grapple with.",
    "In the realm of software development, consistency and clarity are far more valuable than cleverness. Code is read far more often than it is written, and the primary audience for any piece of code is not the compiler but other human beings who need to understand, modify, and maintain it over time.",
    "The ability to focus deeply on a single task without distraction is becoming increasingly rare in our always-connected world. Research shows that frequent context switching reduces productivity by up to forty percent and significantly increases the likelihood of errors in complex work.",
  ],
  hard: [
    "Quantum mechanics describes the behavior of matter and energy at the smallest scales, where the classical laws of physics break down and probability distributions replace deterministic predictions. The Copenhagen interpretation remains the most widely taught framework, though many-worlds and pilot-wave theories offer compelling alternative perspectives on the measurement problem.",
    "The symbiotic relationship between syntax and semantics in natural language processing presents a formidable challenge for computational linguists. While statistical approaches have achieved remarkable success in tasks like machine translation and sentiment analysis, true natural language understanding remains an elusive goal, requiring not just pattern recognition but genuine reasoning about the world.",
    "Biological neural networks exhibit remarkable plasticity, reorganizing their structure and function in response to experience and injury. This neuroplasticity underlies all learning and memory formation, from the acquisition of motor skills to the consolidation of declarative knowledge, and its dysregulation is implicated in numerous neurological and psychiatric disorders.",
  ],
};

function calcWPM(correctChars: number, elapsedSec: number): number {
  if (elapsedSec <= 0) return 0;
  const minutes = elapsedSec / 60;
  return Math.round(correctChars / 5 / Math.max(minutes, 0.01));
}

function calcAccuracy(correct: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((correct / total) * 100);
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TypeTestWidget() {
  const { size, settings } = useWidget();

  const diffSetting = settings.difficulty;
  const difficulty: "easy" | "medium" | "hard" =
    diffSetting === "easy" || diffSetting === "hard"
      ? diffSetting
      : "medium";

  const [passage, setPassage] = useState("");
  const [typedChars, setTypedChars] = useState<
    { char: string; status: "correct" | "incorrect" | "pending" }[]
  >([]);
  const [position, setPosition] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [keyCount, setKeyCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    const pool = PASSAGES[difficulty];
    const text = pool[Math.floor(Math.random() * pool.length)];
    setPassage(text);
    setTypedChars(
      text.split("").map((c) => ({ char: c, status: "pending" as const })),
    );
    setPosition(0);
    setStartTime(null);
    setEndTime(null);
    setElapsed(0);
    setIsComplete(false);
    setKeyCount(0);
    setErrorCount(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [difficulty]);

  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (startTime && !endTime) {
      timerRef.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - startTime) / 1000)),
        200,
      );
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTime, endTime]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isComplete || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Backspace") {
        if (position > 0) {
          const prev = position - 1;
          setPosition(prev);
          setTypedChars((prevChars) => {
            const next = [...prevChars];
            next[prev] = { ...next[prev], status: "pending" as const };
            return next;
          });
        }
        e.preventDefault();
        return;
      }

      if (e.key.length !== 1) return;
      e.preventDefault();

      if (!startTime) setStartTime(Date.now());
      setKeyCount((k) => k + 1);

      const expected = passage[position];
      const correct = e.key === expected;
      if (!correct) setErrorCount((c) => c + 1);

      setTypedChars((prev) => {
        const next = [...prev];
        next[position] = {
          ...next[position],
          status: (correct ? "correct" : "incorrect") as "correct" | "incorrect",
        };
        return next;
      });

      const nextPos = position + 1;
      setPosition(nextPos);

      if (nextPos >= passage.length) {
        setIsComplete(true);
        setEndTime(Date.now());
      }
    },
    [passage, position, startTime, isComplete],
  );

  const correctCount = useMemo(
    () => typedChars.filter((t) => t.status === "correct").length,
    [typedChars],
  );

  const wpm = calcWPM(correctCount, elapsed);
  const accuracy = calcAccuracy(correctCount, keyCount);
  const progress = passage.length > 0 ? (position / passage.length) * 100 : 0;

  useEffect(() => {
    if (!isComplete && startTime !== null && containerRef.current) {
      containerRef.current.focus();
    }
  }, [startTime, isComplete]);

  const sActive = startTime !== null && !isComplete;

  const PassageArea = (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => containerRef.current?.focus()}
      style={{
        outline: "none",
        cursor: "text",
        fontFamily: "var(--font-jetbrains-mono, monospace)",
        fontSize: "0.85rem",
        lineHeight: 1.7,
        padding: "10px 12px",
        background: "var(--bg-nested)",
        borderRadius: 8,
        border: "1.5px solid var(--border)",
        boxShadow: "inset 1px 1px 0 var(--shadow)",
        wordBreak: "break-all",
        userSelect: "none",
        maxHeight: size === "M" ? 80 : 140,
        overflowY: "auto",
        position: "relative",
      }}
    >
      {typedChars.map((t, i) => {
        const atCursor = i === position;
        return (
          <span
            key={i}
            style={{
              color:
                t.status === "correct"
                  ? "var(--accent-cyan)"
                  : t.status === "incorrect"
                    ? "var(--accent-orange)"
                    : "var(--text-muted)",
              opacity: t.status === "pending" ? 0.35 : 1,
              background: atCursor ? "var(--accent-cyan)" : "transparent",
              borderRadius: atCursor ? 1 : 0,
              ...(atCursor
                ? { color: "var(--bg-card)", textShadow: "none" }
                : {}),
            }}
          >
            {t.char === " " ? "\u00A0" : t.char}
          </span>
        );
      })}
      {position >= passage.length && !isComplete && (
        <span style={{ color: "var(--accent-cyan)", opacity: 0.6 }}>↵</span>
      )}
    </div>
  );

  const StatsBar = (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <span>
        <span className="block-value" style={{ fontSize: "1rem" }}>
          {wpm}
        </span>
        <span
          className="block-label"
          style={{ fontSize: "0.5rem", marginLeft: 4 }}
        >
          wpm
        </span>
      </span>
      <span className="block-sub">{accuracy}%</span>
      <span className="block-sub">{fmtElapsed(elapsed)}</span>
      {size === "L" && (
        <span className="block-sub" style={{ opacity: 0.4 }}>
          {position}/{passage.length}
        </span>
      )}
    </div>
  );

  const ProgressBar = (
    <div
      style={{
        height: 4,
        background: "var(--bg-nested)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          background: isComplete ? "var(--accent-orange)" : "var(--accent-cyan)",
          borderRadius: 3,
          transition: "width 0.15s",
        }}
      />
    </div>
  );

  const btnStyle: React.CSSProperties = {
    cursor: "pointer",
    background: "var(--bg-nested)",
    border: "1.5px solid var(--border)",
    borderRadius: 10,
    padding: "6px 16px",
    alignSelf: "flex-start",
    boxShadow: "2px 2px 0 var(--shadow)",
    color: "var(--text-muted)",
    fontFamily: "var(--font-dotgothic16, monospace)",
    fontSize: "0.65rem",
  };

  function ResultStat({ label, value }: { label: string; value: string }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="block-label" style={{ fontSize: "0.5rem" }}>
          {label}
        </span>
        <span className="block-value" style={{ fontSize: "0.85rem" }}>
          {value}
        </span>
      </div>
    );
  }

  const ResultsView = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            className="block-stat"
            style={{
              fontSize: size === "L" ? "2.8rem" : "2.2rem",
              lineHeight: 1,
            }}
          >
            {wpm}
          </span>
          <span className="block-label" style={{ fontSize: "0.55rem" }}>
            words per minute
          </span>
        </div>
        <span
          className={`block-value ${accuracy >= 90 ? "accent" : accuracy >= 70 ? "teal" : ""}`}
          style={{ fontSize: size === "L" ? "1.5rem" : "1.2rem" }}
        >
          {accuracy}%
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          borderTop: "1.5px solid var(--border)",
          paddingTop: 12,
        }}
      >
        <ResultStat label="time" value={fmtElapsed(elapsed)} />
        <ResultStat label="chars" value={String(keyCount)} />
        <ResultStat label="errors" value={String(errorCount)} />
        <ResultStat label="accuracy" value={`${accuracy}%`} />
      </div>
      <button onClick={reset} style={btnStyle}>
        ↻ try again
      </button>
    </div>
  );

  if (size === "S") {
    if (isComplete) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span
            className="block-stat"
            style={{ fontSize: "1.8rem", lineHeight: 1 }}
          >
            {wpm}
          </span>
          <span className="block-label" style={{ fontSize: "0.5rem" }}>
            wpm
          </span>
          <span className="block-sub">{accuracy}% acc</span>
          <button
            onClick={reset}
            style={{ ...btnStyle, padding: "2px 8px", fontSize: "0.55rem" }}
          >
            ↻ retry
          </button>
        </div>
      );
    }
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "center",
        }}
      >
        {sActive ? (
          <>
            <span
              className="block-stat"
              style={{ fontSize: "1.8rem", lineHeight: 1 }}
            >
              {wpm}
            </span>
            <span className="block-label" style={{ fontSize: "0.5rem" }}>
              wpm
            </span>
            <span className="block-sub" style={{ opacity: 0.6 }}>
              {accuracy}% · {fmtElapsed(elapsed)}
            </span>
          </>
        ) : (
          <>
            <span
              className="block-stat"
              style={{ fontSize: "1.5rem", opacity: 0.3 }}
            >
              —
            </span>
            <span className="block-sub" style={{ opacity: 0.4 }}>
              click & type
            </span>
          </>
        )}
      </div>
    );
  }

  if (size === "M") {
    if (isComplete) return ResultsView;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sActive ? (
          StatsBar
        ) : (
          <div className="block-sub" style={{ opacity: 0.5, fontSize: "0.65rem" }}>
            click the passage and start typing
          </div>
        )}
        {PassageArea}
        {ProgressBar}
      </div>
    );
  }

  if (isComplete) return ResultsView;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {StatsBar}
      {PassageArea}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1 }}>{ProgressBar}</div>
        <span className="block-sub" style={{ fontSize: "0.5rem", opacity: 0.4 }}>
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}
