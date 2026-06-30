// Serves a single Ideate-mode mockup's raw HTML (for iframe srcDoc), and
// lets the client discard a finished session's scratch files.
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { VARIATION_FILE_RE, isValidIdeateSessionId, sessionDirFor } from "@/lib/widget-creator/ideateStore";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session") ?? "";
  const file = url.searchParams.get("file") ?? "";

  if (!isValidIdeateSessionId(sessionId) || !VARIATION_FILE_RE.test(file)) {
    return new Response("invalid session or file", { status: 400 });
  }

  const filePath = join(sessionDirFor(sessionId), file);
  if (!existsSync(filePath)) {
    return new Response("not found", { status: 404 });
  }

  const html = readFileSync(filePath, "utf-8");
  return new Response(html, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session") ?? "";

  if (!isValidIdeateSessionId(sessionId)) {
    return Response.json({ ok: false, error: "invalid session id" }, { status: 400 });
  }

  rmSync(sessionDirFor(sessionId), { recursive: true, force: true });
  return Response.json({ ok: true });
}
