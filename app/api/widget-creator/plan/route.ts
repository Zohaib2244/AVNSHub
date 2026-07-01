// Lightweight widget-brainstorm endpoint — conversational, no file tools.
// Uses the same streamHarnessChat as NutBot chat but with a widget-ideation
// persona. Returns NDJSON: {"type":"token","data":"..."} / "done" / "error".
import { streamHarnessChat } from "@/lib/nutbot/chatHarness";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";

export const dynamic = "force-dynamic";

const PLAN_PERSONA = `You are a widget concept advisor for AVN Hub — a self-hosted personal dashboard where widgets can be built via a chat interface. Your job: help the user figure out what to build.

When the idea is vague, ask 1–2 focused questions — what data would it show, how often they'd glance at it, what size feels right (S = small badge/counter, M = medium data card, L = detailed panel).

When the concept is specific, produce a structured brief in this exact format — only valid JSON inside the backtick block:

\`\`\`widget-brief
{
  "title": "Human Readable Title",
  "slug": "kebab-case-slug",
  "icon": "LucideIconName",
  "sizes": ["S", "M"],
  "sContent": "what S shows — one stat or label",
  "mContent": "what M shows — the main card view",
  "lContent": "what L shows — omit key if L is not useful",
  "dataSource": "URL or API the widget polls (empty string if static)",
  "dataShape": "JSON shape of the response (empty string if static)",
  "concept": "One or two sentences describing the widget for a visual mockup tool"
}
\`\`\`

After the brief, invite the user to refine any field or explore alternatives. Keep replies concise. Do not write code or TSX.`;

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
    persona: PLAN_PERSONA,
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
