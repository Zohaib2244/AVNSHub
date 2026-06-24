import { NextResponse } from "next/server";
import { getCurrentlyPlaying, type SteamCreds } from "@/lib/steam";

export const dynamic = "force-dynamic";

// POST carries the widget's per-instance credentials; GET uses env vars only.
// Blank/missing fields fall back to STEAM_* env vars.
async function handle(creds?: SteamCreds) {
  try {
    const data = await getCurrentlyPlaying(creds);
    return NextResponse.json(data);
  } catch (error) {
    console.error("currently-playing route error:", error);
    return NextResponse.json({ error: "failed to fetch currently playing" }, { status: 502 });
  }
}

export async function GET() {
  return handle();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SteamCreds;
  return handle(body);
}
