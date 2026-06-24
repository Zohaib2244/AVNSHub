import { NextResponse } from "next/server";
import { getGitHubRepos, type GitHubConfig } from "@/lib/github";

export const dynamic = "force-dynamic";

async function handle(config?: GitHubConfig) {
  try {
    const data = await getGitHubRepos(config);
    return NextResponse.json(data);
  } catch (error) {
    console.error("github-repos route error:", error);
    return NextResponse.json({ error: "failed to fetch github repos" }, { status: 502 });
  }
}

export async function GET() {
  return handle();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GitHubConfig;
  return handle(body);
}
