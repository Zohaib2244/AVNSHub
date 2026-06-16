// Proxies to a self-hosted WhatsApp bridge (e.g. @whiskeysockets/baileys REST wrapper).
// Set WHATSAPP_BRIDGE_URL to the bridge's base URL and WHATSAPP_GROUP_ID to the
// default group JID (e.g. 120363XXXXXXXXXX@g.us). The widget settings can override
// the group ID per-instance.
//
// Expected bridge contract:
//   GET  {bridge}/messages?groupId=...&limit=...
//        → { messages, groupName, participantCount, connected }
//   POST {bridge}/send  body: { groupId, message }
//        → { success: true }

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL ?? "";
const defaultGroupId = process.env.WHATSAPP_GROUP_ID ?? "";

function errorPayload(message: string, status?: number) {
  return NextResponse.json(
    { error: message },
    status ? { status } : undefined,
  );
}

export async function GET(req: NextRequest) {
  if (!bridgeUrl) return errorPayload("WHATSAPP_BRIDGE_URL is not configured");

  const { searchParams } = req.nextUrl;
  const groupId = searchParams.get("groupId") || defaultGroupId;
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 20)));

  if (!groupId) {
    return errorPayload(
      "no group configured - set WHATSAPP_GROUP_ID or provide groupId in widget settings",
    );
  }

  try {
    const upstream = new URL("/messages", bridgeUrl);
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
  if (!bridgeUrl) {
    return errorPayload("WHATSAPP_BRIDGE_URL is not configured", 503);
  }

  let body: { groupId?: string; message?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const groupId = body.groupId || defaultGroupId;
  const message = typeof body.message === "string" ? body.message.trim() : "";

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
    const res = await fetch(new URL("/send", bridgeUrl).toString(), {
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
