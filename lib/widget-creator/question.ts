// Harness → user questions for the Widget Creator. A harness that needs a
// decision ends its reply with a ```nutbot-question fenced JSON block; the UI
// renders it as a clickable card and the user's answer is sent back as the
// next turn. A text protocol rather than claude's AskUserQuestion tool because
// that tool doesn't work under `claude -p`, and this way codex/opencode can
// ask too. Client-safe: no node imports.

export type QuestionOption = { label: string; description?: string };

export type HarnessQuestion = {
  question: string;
  /** short chip label, e.g. "Data source" */
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
};

const FENCE = "nutbot-question";
const BLOCK_RE = /```nutbot-question\s*\n([\s\S]*?)```/g;
const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 6;

/** how to ask — shared by every stage's prompt */
export const QUESTION_FORMAT = `To ask, end your reply with exactly one fenced block tagged \`${FENCE}\` holding JSON, and nothing after it:

\`\`\`${FENCE}
{"questions":[{"question":"Which currency should totals use?","header":"Currency","options":[{"label":"USD","description":"US dollars"},{"label":"PKR","description":"Pakistani rupees"}],"multiSelect":false}]}
\`\`\`

1-3 questions, 2-4 options each; the user can always type their own answer instead. The UI renders the block as buttons, and the answer arrives as your next message.`;

/** Build-stage section: when to ask, and what asking does to the draft */
export const QUESTION_PROTOCOL = `## Asking the user

If a decision genuinely blocks the work - you cannot settle it from the spec, the skill, or a sensible default, and a wrong guess would mean redoing the widget - stop and ask instead of guessing. Settle small choices yourself.

${QUESTION_FORMAT}

Ask before writing files where you can: a turn that ends in a question is not type-checked or applied, and whatever you already wrote stays in the draft for the next turn.`;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeQuestion(raw: unknown): HarnessQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const question = str(rec.question, 500);
  if (!question) return null;
  const options = (Array.isArray(rec.options) ? rec.options : [])
    .map((opt): QuestionOption | null => {
      if (typeof opt === "string") return opt.trim() ? { label: opt.trim().slice(0, 120) } : null;
      if (!opt || typeof opt !== "object") return null;
      const o = opt as Record<string, unknown>;
      const label = str(o.label, 120);
      if (!label) return null;
      const description = str(o.description, 300);
      return description ? { label, description } : { label };
    })
    .filter((o): o is QuestionOption => o !== null)
    .slice(0, MAX_OPTIONS);
  const header = str(rec.header, 40);
  return {
    question,
    ...(header ? { header } : {}),
    options,
    ...(rec.multiSelect === true ? { multiSelect: true } : {}),
  };
}

/** questions from the last complete nutbot-question block in `text`, or null */
export function parseQuestions(text: string): HarnessQuestion[] | null {
  const blocks = [...text.matchAll(BLOCK_RE)];
  const last = blocks[blocks.length - 1];
  if (!last) return null;
  let data: unknown;
  try { data = JSON.parse(last[1].trim()); } catch { return null; }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).questions)
      ? (data as { questions: unknown[] }).questions
      : [data];
  const questions = list.map(normalizeQuestion).filter((q): q is HarnessQuestion => q !== null).slice(0, MAX_QUESTIONS);
  return questions.length ? questions : null;
}

/** display text without question blocks, including one still streaming in */
export function stripQuestions(text: string): string {
  const stripped = text.replace(BLOCK_RE, "");
  const open = stripped.indexOf("```" + FENCE);
  return (open === -1 ? stripped : stripped.slice(0, open)).trim();
}

/** true while a question block has opened but not closed yet */
export function isQuestionStreaming(text: string): boolean {
  return text.replace(BLOCK_RE, "").includes("```" + FENCE);
}

/** the reply sent back to the harness; answers[i] belongs to questions[i] */
export function formatAnswers(questions: HarnessQuestion[], answers: string[][]): string {
  const lines = questions.map((q, i) => `- ${q.question}\n  → ${(answers[i] ?? []).join(", ") || "(no answer — use your best judgement)"}`);
  return `Answers to your question${questions.length > 1 ? "s" : ""}:\n${lines.join("\n")}`;
}
