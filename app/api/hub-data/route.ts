// Generic key/value read/write for the shared-hub data store — lets every
// browser/device read and write the same canvases/theme/layout/prefs/etc.
// instead of each being trapped in its own localStorage. Keys mirror the
// existing localStorage key names 1:1 (see lib/serverSync.ts).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  const row = await prisma.kV.findUnique({ where: { key } });
  if (!row) {
    return NextResponse.json({ value: null, updatedAt: null });
  }
  return NextResponse.json({ value: JSON.parse(row.value), updatedAt: row.updatedAt });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string" || !body.key || !("value" in body)) {
    return NextResponse.json({ error: "expected { key: string, value }" }, { status: 400 });
  }
  const row = await prisma.kV.upsert({
    where: { key: body.key },
    create: { key: body.key, value: JSON.stringify(body.value) },
    update: { value: JSON.stringify(body.value) },
  });
  return NextResponse.json({ ok: true, updatedAt: row.updatedAt });
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  await prisma.kV.deleteMany({ where: { key } });
  return NextResponse.json({ ok: true });
}
