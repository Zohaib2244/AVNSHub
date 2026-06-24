import { NextResponse } from "next/server";
import { controlPlayback, type PlayerAction, type SpotifyCreds } from "@/lib/spotify";

export const dynamic = "force-dynamic";

const ACTIONS: PlayerAction[] = ["play", "pause", "next", "previous", "play-track"];

export async function POST(request: Request) {
  try {
    // creds ride along in the body so playback control uses the same per-widget
    // credentials as the now-playing poll (falls back to SPOTIFY_* env vars)
    const body = (await request.json()) as { action?: string; uri?: string; creds?: SpotifyCreds };

    if (!body.action || !ACTIONS.includes(body.action as PlayerAction)) {
      return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });
    }

    // Only allow spotify track URIs through to play-track
    if (body.uri && !/^spotify:track:[A-Za-z0-9]+$/.test(body.uri)) {
      return NextResponse.json({ ok: false, error: "invalid track uri" }, { status: 400 });
    }

    const result = await controlPlayback(body.action as PlayerAction, body.uri, body.creds);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error("spotify-control route error:", error);
    return NextResponse.json({ ok: false, error: "control request failed" }, { status: 502 });
  }
}
