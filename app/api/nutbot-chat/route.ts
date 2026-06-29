import { NextResponse } from "next/server";
import { NUTBOT_PERSONA, NUTBOT_PERSONA_NSFW, type PersonaPreset } from "@/lib/nutbot/persona";
import { streamHarnessChat } from "@/lib/nutbot/chatHarness";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";

// NutBot's chat brain: proxies to a self-hosted Bonfire instance
// (github.com/shahwaizse/bonfire) running a local Dolphin 3.0 model behind
// llama.cpp. Never expose the Bonfire URL client-side — same pattern as every
// other /api proxy route in this project.

export const dynamic = "force-dynamic";

function baseUrl(): string {
  return (process.env.NUTBOT_CHAT_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
}

type PresetIds = { sfw: string; nsfw: string };
// cached for the life of the server process — presets are stable, find-or-create
// once instead of round-tripping Bonfire on every chat message
let presetIdsCache: PresetIds | null = null;

async function findOrCreatePreset(base: string, persona: PersonaPreset): Promise<string> {
  const listRes = await fetch(`${base}/presets`);
  if (listRes.ok) {
    const presets = (await listRes.json()) as Array<{ id: string; name: string; description: string; system_prompt: string }>;
    const existing = presets.find((p) => p.name === persona.name);
    if (existing) {
      // presets are found by name, not content — keep the Bonfire-side copy in
      // sync with lib/nutbot/persona.ts on every server start instead of
      // silently serving a stale prompt from whenever the preset was first
      // created (this used to require deleting the preset by hand to pick up
      // edits here)
      if (existing.description !== persona.description || existing.system_prompt !== persona.system_prompt) {
        await fetch(`${base}/presets/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: persona.description,
            system_prompt: persona.system_prompt,
            keywords: persona.keywords,
          }),
        }).catch(() => {}); // best-effort — stale prompt beats a broken chat if this fails
      }
      return existing.id;
    }
  }

  const createRes = await fetch(`${base}/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: persona.name,
      description: persona.description,
      system_prompt: persona.system_prompt,
      keywords: persona.keywords,
    }),
  });
  if (!createRes.ok) throw new Error(`failed to create Bonfire preset "${persona.name}"`);
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function ensurePresetIds(base: string): Promise<PresetIds> {
  if (presetIdsCache) return presetIdsCache;
  const [sfw, nsfw] = await Promise.all([
    findOrCreatePreset(base, NUTBOT_PERSONA),
    findOrCreatePreset(base, NUTBOT_PERSONA_NSFW),
  ]);
  presetIdsCache = { sfw, nsfw };
  return presetIdsCache;
}

function isHarnessId(value: unknown): value is HarnessId {
  return typeof value === "string" && value in HARNESS_ADAPTERS;
}

// GET ?conversationId=<id> hydrates chat history on reload; no query = health check
export async function GET(request: Request) {
  const base = baseUrl();
  const conversationId = new URL(request.url).searchParams.get("conversationId");

  try {
    const upstream = await fetch(
      conversationId ? `${base}/conversations/${conversationId}` : `${base}/health`,
    );
    if (!upstream.ok) {
      return NextResponse.json({ offline: true, error: `bonfire responded ${upstream.status}` }, { status: 503 });
    }
    return NextResponse.json(await upstream.json());
  } catch (error) {
    return NextResponse.json({ offline: true, error: (error as Error).message ?? "bonfire unreachable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    conversationId?: string;
    nsfw?: boolean;
    searchEnabled?: boolean;
    backend?: "bonfire" | HarnessId;
    history?: Array<{ role: "user" | "assistant"; text: string }>;
  };

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const backend = body.backend ?? "bonfire";
  if (backend !== "bonfire") {
    if (!isHarnessId(backend)) {
      return NextResponse.json({ error: "invalid chat backend" }, { status: 400 });
    }
    return new Response(
      streamHarnessChat({
        harness: backend,
        message: body.message,
        sessionId: body.conversationId ?? null,
        persona: NUTBOT_PERSONA.system_prompt,
        history: Array.isArray(body.history) ? body.history : [],
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const base = baseUrl();
  try {
    const presetIds = await ensurePresetIds(base);
    const upstream = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: body.conversationId ?? null,
        message: body.message,
        search_enabled: body.searchEnabled ?? true,
        preset_id: body.nsfw ? presetIds.nsfw : presetIds.sfw,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ offline: true, error: `bonfire responded ${upstream.status}` }, { status: 503 });
    }

    // pipe Bonfire's NDJSON stream straight through to the client
    return new Response(upstream.body, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (error) {
    console.error("nutbot-chat route error:", error);
    return NextResponse.json({ offline: true, error: (error as Error).message ?? "bonfire unreachable" }, { status: 503 });
  }
}
