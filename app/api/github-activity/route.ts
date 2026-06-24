import { NextResponse } from "next/server";
import { getGitHubActivity, type GitHubConfig } from "@/lib/github";

export const dynamic = "force-dynamic";

// POST carries the widget's per-instance config (username/token); GET uses the
// default username + GITHUB_TOKEN env var. Blank fields fall back either way.
async function handle(config?: GitHubConfig) {
  try {
    const data = await getGitHubActivity(config);
    return NextResponse.json(data);
  } catch (error) {
    console.error("github-activity route error:", error);
    return NextResponse.json({ error: "failed to fetch github activity" }, { status: 502 });
  }
}

export async function GET() {
  return handle();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GitHubConfig;
  return handle(body);
}
