import { NextResponse } from "next/server";
import { isValidCustomWidgetId } from "@/lib/widget-creator/customRegistry";
import { getRun } from "@/lib/widget-creator/runStatus";

export const dynamic = "force-dynamic";

// GET /api/widget-creator/run-status?slug=<slug> → { run: RunRecord | null, now }
// The last (or current) build run for a widget — see lib/widget-creator/runStatus.ts.
// `now` lets the client compute elapsed times without trusting its own clock.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!isValidCustomWidgetId(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  return NextResponse.json({ run: getRun(slug), now: Date.now() });
}
