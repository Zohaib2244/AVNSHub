import { NextResponse } from "next/server";
import {
  isValidCustomWidgetId,
  pruneOrphanCustomWidgetFiles,
  removeCustomWidgetFiles,
  removeFromComponentMap,
  removeRegistryEntry,
} from "@/lib/widget-creator/customRegistry";

export async function POST(req: Request) {
  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const id = body.id;

  if (!id || !isValidCustomWidgetId(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    // Order matters. The old bug deleted the files first, leaving a lazy import
    // pointing at a missing module — Turbopack's HMR cycle then failed on the
    // broken resolution. Now:

    // 1. Remove the JSON entry → the widget disappears from the UI immediately
    //    (data-only change, no TypeScript recompile needed).
    removeRegistryEntry(id);

    // 2. Remove the two matching lines from customComponentMap.tsx → one clean
    //    recompile with no reference to the (still-present) files.
    removeFromComponentMap(id);

    // 3. Delete the files from disk, now that nothing imports them. Also prune
    //    orphan custom folders left behind by older delete/generate failures;
    //    once a folder is not in the registry, the UI has no way to delete it.
    const removedFiles = removeCustomWidgetFiles(id);
    const removedOrphans = pruneOrphanCustomWidgetFiles();

    return NextResponse.json({ ok: true, removedFiles, removedOrphans });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to delete widget" },
      { status: 500 },
    );
  }
}
