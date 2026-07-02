import { NextResponse } from "next/server";
import { rmSync } from "fs";
import { join } from "path";
import {
  isValidCustomWidgetId,
  pruneOrphanCustomWidgetFiles,
  readRegistry,
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
    // Read the entry BEFORE removing it — flags.hasApiRoute (recorded from
    // disk at registration, never from the LLM manifest) tells us whether
    // this widget shipped its own app/api/<id> route that must go with it.
    const entry = readRegistry()[id];

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

    // 4. The widget's own generated API route, if it registered with one.
    //    Guarded by the flag (not a bare existsSync) so a slug that happens to
    //    match a core route can never take app/api/<core-route> down with it —
    //    the generate route also rejects such slugs at create time.
    //    Known residue: a generated-but-never-installed widget's API route has
    //    no registry entry and isn't covered here.
    if (entry?.flags?.hasApiRoute === true) {
      rmSync(join(process.cwd(), "app/api", id), { recursive: true, force: true });
    }

    const removedOrphans = pruneOrphanCustomWidgetFiles();

    return NextResponse.json({ ok: true, removedFiles, removedOrphans });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to delete widget" },
      { status: 500 },
    );
  }
}
