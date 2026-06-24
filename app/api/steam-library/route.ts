import { NextResponse } from "next/server";
import { getGameLibrary, type SteamCreds } from "@/lib/steam";

export const dynamic = "force-dynamic";

async function handle(creds?: SteamCreds) {
  try {
    const data = await getGameLibrary(creds);
    return NextResponse.json(data);
  } catch (error) {
    console.error("steam-library route error:", error);
    return NextResponse.json({ error: "failed to fetch game library" }, { status: 502 });
  }
}

export async function GET() {
  return handle();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SteamCreds;
  return handle(body);
}
