// Lightweight widget-brainstorm endpoint — conversational, no file tools.
// Uses the same streamHarnessChat as NutBot chat but with a widget-ideation
// persona. Returns NDJSON: {"type":"token","data":"..."} / "done" / "error".
import { readFileSync } from "fs";
import { join } from "path";
import { streamHarnessChat } from "@/lib/nutbot/chatHarness";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";
import { isSkillAvailable } from "@/lib/widget-creator/skillCheck";
import { buildWidgetCatalogSection } from "@/lib/widget-creator/widgetCatalog";

export const dynamic = "force-dynamic";

const REPO_ROOT = process.cwd();

// Product/layout context for the brainstorming step (Slot Layout regions,
// size semantics, what makes a good suggestion) lives in the "avn-widget-plan"
// skill for codex/opencode, which both discover and load skills even under
// Plan mode's read-only/no-tools-by-default invocation (verified directly
// against each CLI). claude's Plan invocation runs with --tools "" - all
// tools off, including the one that loads a skill - by deliberate design, so
// it never gets file/shell access even for brainstorming; it gets this same
// content inlined instead, read from the same source
// scripts/sync-widget-skill.mjs generates the skill from, so there's exactly
// one copy of this content regardless of which path serves it.
function readPlanContext(): string {
  try {
    return readFileSync(join(REPO_ROOT, "lib/widget-creator/prompts/widget-plan-context.md"), "utf-8");
  } catch {
    return "";
  }
}

// Built fresh per request (not a module-level const) so the catalog section
// is always current — see buildWidgetCatalogSection().
function buildPlanPersona(harness: HarnessId): string {
  // Plan is conversational/low-stakes, unlike Build where a missing skill
  // hard-fails (see generate/route.ts) — if avn-widget-plan isn't there for
  // some reason, degrade gracefully to the same inline content claude
  // already uses rather than telling the harness to load a skill that
  // doesn't exist.
  const contextSection =
    harness !== "claude" && isSkillAvailable("avn-widget-plan", harness)
      ? `Load the \`avn-widget-plan\` skill now for product/layout context (what AVN Hub is, the Slot Layout regions, size semantics, what makes a good suggestion) before proposing anything.`
      : readPlanContext();

  return `You are a widget concept advisor for AVN Hub — a self-hosted personal dashboard where widgets can be built via a chat interface. Your job: help the user figure out what to build next.

${contextSection}

${buildWidgetCatalogSection()}

When the user asks for suggestions ("what widget could I add?"), propose 2-4 concrete, novel ideas that aren't already covered by the list above — you already have everything you need to do this from the list, no exploration required.

When the idea is vague, ask 1–2 focused questions — what data would it show, how often they'd glance at it, what size feels right (S = small badge/counter, M = medium data card, L = detailed panel).

When the concept is specific, produce a structured brief in this exact format — only valid JSON inside the backtick block:

\`\`\`widget-brief
{
  "title": "Human Readable Title",
  "slug": "kebab-case-slug",
  "icon": "LucideIconName",
  "sizes": ["S", "M"],
  "requirements": "THE MASTER RECORD — the complete widget spec. Everything the user asked for: what the widget is, its purpose, every field/control/button with its exact label, every behavior and interaction, data handling, persistence, formatting rules, empty/error states, edge cases, things to avoid. Written as a numbered list, one requirement per line (\\n-separated inside this JSON string).",
  "sContent": "how S presents this — which parts of the requirements it shows, laid out top to bottom",
  "mContent": "how M presents this — which parts of the requirements it shows, laid out top to bottom",
  "lContent": "how L presents this — omit key if L is not useful",
  "dataSource": "URL or API the widget polls (empty string if static)",
  "dataShape": "JSON shape of the response (empty string if static)",
  "concept": "One or two sentences describing the widget's purpose",
  "notes": "Anything that fits nowhere above. Omit the key entirely if there's nothing extra."
}
\`\`\`

The brief is the ONLY thing the downstream mockup and build stages receive — they never see this conversation. Anything you leave out of the brief is lost. So:
- \`requirements\` must capture EVERY requirement the user stated across the whole conversation, verbatim where they gave specifics — exact field names, labels, example values, formats. Never compress a list the user actually gave into "e.g." or "etc.". Before emitting, re-read the conversation and check nothing they asked for is missing.
- The per-size content fields don't repeat the requirements — they divide them up: which requirements appear at that size and in what order, so each size is a purpose-built view, not a summary. The builder should be able to lay out each size from its content field plus the requirements list, with zero guessing.
- When the user asks for a change to an existing brief, re-emit the FULL updated brief block — every field, with \`requirements\` updated to reflect the change (added, amended, or removed) — so the latest block is always the complete spec.

After the brief, invite the user to refine any field or explore alternatives. Keep replies concise. Do not write code or TSX.`;
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    message: string;
    sessionId?: string | null;
    history?: Array<{ role: "user" | "assistant"; text: string }>;
    harness?: HarnessId;
  };

  const { message, sessionId, history, harness = "claude" } = body;
  if (!message?.trim()) {
    return new Response(
      JSON.stringify({ type: "error", data: "message is required" }) + "\n",
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const stream = streamHarnessChat({
    harness,
    message,
    sessionId,
    persona: buildPlanPersona(harness),
    history,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
