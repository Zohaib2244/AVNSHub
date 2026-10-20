import { NextResponse } from "next/server";
import { getHomelabStatus } from "@/lib/homelab";
import { readUptimeKuma } from "@/lib/uptimeKuma";

export const dynamic = "force-dynamic";

// Uptime Kuma is the real status source when it's reachable — it already
// watches every service. HOMELAB_STATUS_URL (and the mock behind it) stay as
// the fallback for installs without Kuma. The Kuma read lives here rather than
// in lib/homelab.ts because that module is imported by client components, and
// it pulls in node:sqlite / fs.
export async function GET() {
  try {
    const kuma = await readUptimeKuma();
    if (kuma) return NextResponse.json(kuma);
    const data = await getHomelabStatus();
    return NextResponse.json(data);
  } catch (error) {
    console.error("homelab route error:", error);
    return NextResponse.json({ error: "failed to fetch homelab status" }, { status: 502 });
  }
}
