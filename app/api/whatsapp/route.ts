// Proxies to a self-hosted WhatsApp bridge (e.g. @whiskeysockets/baileys REST wrapper).
// Widget settings can provide the bridge URL and group JID per-instance, so AVN Hub
// stays configurable from the UI. WHATSAPP_BRIDGE_URL and WHATSAPP_GROUP_ID are
// optional convenience defaults only.
//
// Expected bridge contract:
//   GET  {bridge}/groups
//        -> { groups: [{ id, name, participantCount }], connected }
//   GET  {bridge}/messages?groupId=...&limit=...
//        → { messages, groupName, participantCount, connected }
//   POST {bridge}/send  body: { groupId, message }
//        → { success: true }

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL ?? "";
const defaultGroupId = process.env.WHATSAPP_GROUP_ID ?? "";

function bridgeFromSetting(value: string | null | undefined): string {
  const candidate = value?.trim() || bridgeUrl;
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function errorPayload(message: string, status?: number) {
  return NextResponse.json(
    { error: message },
    status ? { status } : undefined,
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const bridge = bridgeFromSetting(searchParams.get("bridgeUrl"));
  const mode = searchParams.get("mode");
  const groupId = searchParams.get("groupId") || defaultGroupId;
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 20)));

  if (!bridge) {
    return errorPayload(
      "no WhatsApp bridge configured - add bridgeUrl in widget settings or set WHATSAPP_BRIDGE_URL",
      400,
    );
  }

  if (mode === "groups") {
    try {
      const res = await fetch(new URL("/groups", bridge).toString(), {
        headers: { "Content-Type": "application/json" },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        const body = await res.text();
        console.error("[whatsapp] bridge groups error:", res.status, body);
        return errorPayload(`bridge returned ${res.status}`);
      }

      return NextResponse.json(await res.json());
    } catch (err) {
      console.error("[whatsapp] bridge unreachable for groups:", err);
      return errorPayload("bridge unreachable");
    }
  }

  if (!groupId) {
    return errorPayload(
      "no group configured - set WHATSAPP_GROUP_ID or provide groupId in widget settings",
    );
  }

  try {
    const upstream = new URL("/messages", bridge);
    upstream.searchParams.set("groupId", groupId);
    upstream.searchParams.set("limit", String(limit));

    const res = await fetch(upstream.toString(), {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[whatsapp] bridge GET error:", res.status, body);
      return errorPayload(`bridge returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[whatsapp] bridge unreachable:", err);
    return errorPayload("bridge unreachable");
  }
}

export async function POST(req: NextRequest) {
  let body: { bridgeUrl?: string; groupId?: string; message?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const bridge = bridgeFromSetting(body.bridgeUrl);
  const groupId = body.groupId || defaultGroupId;
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!bridge) {
    return errorPayload(
      "no WhatsApp bridge configured - add bridgeUrl in widget settings or set WHATSAPP_BRIDGE_URL",
      400,
    );
  }

  if (!groupId) {
    return errorPayload(
      "no group configured - set WHATSAPP_GROUP_ID or provide groupId in widget settings",
      400,
    );
  }

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const res = await fetch(new URL("/send", bridge).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, message }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[whatsapp] bridge POST error:", res.status, errBody);
      return NextResponse.json(
        { error: `bridge returned ${res.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[whatsapp] bridge unreachable on send:", err);
    return NextResponse.json(
      { error: "bridge unreachable" },
      { status: 502 }
    );
  }
}
