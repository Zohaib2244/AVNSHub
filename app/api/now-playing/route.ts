import { NextResponse } from "next/server";
import { getNowPlaying, SpotifyNotConfiguredError, type SpotifyCreds } from "@/lib/spotify";

export const dynamic = "force-dynamic";

// POST carries the widget's per-instance credentials; GET uses env vars only.
// Either way, blank/missing fields fall back to SPOTIFY_* env vars.
async function handle(creds?: SpotifyCreds) {
  try {
    const data = await getNowPlaying(creds);
    return NextResponse.json(data);
  } catch (error) {
    // no credentials anywhere: a normal "not set up yet" state, so answer with
    // a marker the widgets can render instead of a 502 + stack trace per poll
    if (error instanceof SpotifyNotConfiguredError) {
      return NextResponse.json({ notConfigured: true });
    }
    console.error("now-playing route error:", error);
    return NextResponse.json({ error: "failed to fetch now playing" }, { status: 502 });
  }
}

export async function GET() {
  return handle();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SpotifyCreds;
  return handle(body);
}
