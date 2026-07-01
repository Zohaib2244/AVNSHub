// Server-side blob storage for larger files (currently: wallpaper images/
// videos) — bytes live on disk under data/uploads/, keyed the same way as
// the KV store (e.g. "wallpaper:<canvasId>"), with a FileBlob row tracking
// the mimeType/size needed to serve them back correctly. The server is the
// source of truth here, not a cache — see lib/wallpaper.ts.
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

// keys are internally generated (canvas ids) or app-defined prefixes, but
// sanitize defensively anyway — no path separators/traversal, and no colon
// (NTFS treats "name:suffix" as an Alternate Data Stream, silently writing
// into a hidden stream on Windows instead of a normal file)
function safeFilename(key: string): string {
  return key.replace(/[^A-Za-z0-9_.-]/g, "_");
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  const meta = await prisma.fileBlob.findUnique({ where: { key } });
  if (!meta) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const bytes = await fs.readFile(path.join(UPLOADS_DIR, safeFilename(key))).catch(() => null);
  if (!bytes) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": meta.mimeType, "Cache-Control": "no-store" },
  });
}

export async function PUT(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  const mimeType = request.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await request.arrayBuffer());

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, safeFilename(key)), buf);
  const row = await prisma.fileBlob.upsert({
    where: { key },
    create: { key, mimeType, size: buf.length },
    update: { mimeType, size: buf.length },
  });
  return NextResponse.json({ ok: true, updatedAt: row.updatedAt, size: row.size });
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  await fs.rm(path.join(UPLOADS_DIR, safeFilename(key)), { force: true });
  await prisma.fileBlob.deleteMany({ where: { key } });
  return NextResponse.json({ ok: true });
}
