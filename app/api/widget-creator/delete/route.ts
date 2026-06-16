import { NextResponse } from "next/server";
import { rmSync, existsSync } from "fs";
import { join } from "path";
import { removeRegistryEntry, removeFromComponentMap } from "@/lib/widget-creator/customRegistry";

const ROOT = process.cwd();

export async function POST(req: Request) {
  const body = (await req.json()) as { id?: string };
  const id = body.id;

  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // Order matters. The old bug deleted the files first, leaving a lazy import
  // pointing at a missing module — Turbopack's HMR cycle then failed on the
  // broken resolution. Now:

  // 1. Remove the JSON entry → the widget disappears from the UI immediately
  //    (data-only change, no TypeScript recompile needed).
  removeRegistryEntry(id);

  // 2. Remove the two matching lines from customComponentMap.tsx → one clean
  //    recompile with no reference to the (still-present) files.
  removeFromComponentMap(id);

  // 3. Delete the files from disk, now that nothing imports them.
  const widgetDir = join(ROOT, "components/widgets/custom", id);
  if (existsSync(widgetDir)) {
    rmSync(widgetDir, { recursive: true, force: true });
  }

  return NextResponse.json({ ok: true });
}
