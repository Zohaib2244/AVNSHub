"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "./copyText";

/** Markdown-lite for chat: ``` fences, `inline code` and **bold**. Deliberately
    not a markdown engine — no HTML is ever injected, everything is React nodes,
    and an unclosed fence (mid-stream) renders as an open code block so the
    layout doesn't jump when the closing fence arrives. */

type Segment = { kind: "text"; text: string } | { kind: "code"; lang: string; text: string };

function splitFences(src: string): Segment[] {
  const out: Segment[] = [];
  const fence = /```([^\n`]*)\n?/g;
  let cursor = 0;
  let open: { at: number; lang: string; bodyStart: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(src))) {
    if (!open) {
      if (m.index > cursor) out.push({ kind: "text", text: src.slice(cursor, m.index) });
      open = { at: m.index, lang: m[1].trim(), bodyStart: m.index + m[0].length };
    } else {
      out.push({ kind: "code", lang: open.lang, text: src.slice(open.bodyStart, m.index).replace(/\n$/, "") });
      cursor = m.index + m[0].length;
      open = null;
    }
  }
  if (open) out.push({ kind: "code", lang: open.lang, text: src.slice(open.bodyStart) });
  else if (cursor < src.length) out.push({ kind: "text", text: src.slice(cursor) });
  // the newline hugging a fence is the fence's, not a blank line of prose
  return out
    .map((seg, i) => seg.kind === "text"
      ? { ...seg, text: seg.text.replace(out[i + 1]?.kind === "code" ? /\n$/ : /$^/, "").replace(out[i - 1]?.kind === "code" ? /^\n/ : /$^/, "") }
      : seg)
    .filter((seg) => seg.kind === "code" || seg.text !== "");
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(m[1] !== undefined
      ? <code key={k++} className="nb-code-inline">{m[1]}</code>
      : <strong key={k++}>{m[2]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function CopyButton({ text, className = "", label = "copy" }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`nb-copy-btn ${className}`}
      aria-label={done ? "copied" : label}
      title={done ? "copied" : label}
      onClick={async () => {
        if (!(await copyText(text))) return;
        setDone(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? <Check size={11} strokeWidth={2.25} /> : <Copy size={11} strokeWidth={2} />}
    </button>
  );
}

export function RichText({ text }: { text: string }) {
  if (!text.includes("`") && !text.includes("**")) return <>{text}</>;
  return (
    <>
      {splitFences(text).map((seg, i) =>
        seg.kind === "text" ? (
          <Fragment key={i}>{renderInline(seg.text)}</Fragment>
        ) : (
          <div key={i} className="nb-code">
            <div className="nb-code-head">
              <span>{seg.lang || "code"}</span>
              <CopyButton text={seg.text} label="copy code" />
            </div>
            <pre>{seg.text}</pre>
          </div>
        ),
      )}
    </>
  );
}
