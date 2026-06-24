import { NextResponse } from "next/server";
import { getSystemStats } from "@/lib/systemStats";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getSystemStats();
    return NextResponse.json(data);
  } catch (error) {
    console.error("system-stats route error:", error);
    return NextResponse.json({ error: "failed to read system stats" }, { status: 502 });
  }
}
