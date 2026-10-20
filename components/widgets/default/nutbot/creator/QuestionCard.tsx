"use client";

import { useState } from "react";
import { CircleHelp, Send } from "lucide-react";
import { formatAnswers, type HarnessQuestion } from "@/lib/widget-creator/question";

type Props = {
  questions: HarnessQuestion[];
  /** false once answered, while a run is going, or in a read-only transcript */
  active: boolean;
  onAnswer: (text: string) => void;
};

/** A harness's nutbot-question block as clickable options plus a free-text "other". */
export function QuestionCard({ questions, active, onAnswer }: Props) {
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []));
  const [other, setOther] = useState<string[]>(() => questions.map(() => ""));

  const answers = questions.map((_, i) => {
    const typed = other[i].trim();
    return typed ? [...picked[i], typed] : picked[i];
  });
  const complete = answers.every((a) => a.length > 0);
  // one single-choice question answers on click; anything else needs a send
  const instant = questions.length === 1 && !questions[0].multiSelect;

  function submit(final: string[][]) {
    if (!active) return;
    onAnswer(formatAnswers(questions, final));
  }

  function pick(qi: number, label: string) {
    if (!active) return;
    const q = questions[qi];
    if (instant) {
      submit([[label]]);
      return;
    }
    setPicked((prev) => prev.map((sel, i) => {
      if (i !== qi) return sel;
      if (q.multiSelect) return sel.includes(label) ? sel.filter((l) => l !== label) : [...sel, label];
      return sel[0] === label ? [] : [label];
    }));
    if (!q.multiSelect) setOther((prev) => prev.map((t, i) => (i === qi ? "" : t)));
  }

  function type(qi: number, text: string) {
    setOther((prev) => prev.map((t, i) => (i === qi ? text : t)));
    if (!questions[qi].multiSelect && text.trim()) setPicked((prev) => prev.map((sel, i) => (i === qi ? [] : sel)));
  }

  return (
    <div className={`wc-question${active ? "" : " answered"}`} role="group" aria-label="question from the harness">
      {questions.map((q, qi) => (
        <div key={qi} className="wc-question-item">
          <div className="wc-question-head">
            <CircleHelp size={12} strokeWidth={1.75} aria-hidden="true" />
            {q.header && <span className="wc-question-chip">{q.header}</span>}
            {q.multiSelect && <span className="wc-question-hint">pick any</span>}
          </div>
          <div className="wc-question-text">{q.question}</div>
          {q.options.length > 0 && (
            <div className="wc-question-options">
              {q.options.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className={`wc-question-opt${picked[qi].includes(opt.label) ? " on" : ""}`}
                  onClick={() => pick(qi, opt.label)}
                  disabled={!active}
                  aria-pressed={instant ? undefined : picked[qi].includes(opt.label)}
                >
                  <span className="wc-question-opt-label">{opt.label}</span>
                  {opt.description && <span className="wc-question-opt-desc">{opt.description}</span>}
                </button>
              ))}
            </div>
          )}
          {active && (
            <input
              className="wc-question-other"
              placeholder={q.options.length ? "or type your own answer" : "type your answer"}
              value={other[qi]}
              onChange={(e) => type(qi, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && complete) {
                  e.preventDefault();
                  submit(answers);
                }
              }}
            />
          )}
        </div>
      ))}
      {active && (!instant || other[0].trim()) && (
        <button type="button" className="wc-question-send" onClick={() => submit(answers)} disabled={!complete}>
          <Send size={11} strokeWidth={2} />
          answer
        </button>
      )}
    </div>
  );
}
