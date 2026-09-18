import { NextResponse } from "next/server";
import { rmSync } from "fs";
import { join } from "path";
import {
  isValidCustomWidgetId,
  listComponentMapIds,
  pruneOrphanCustomWidgetFiles,
  readRegistry,
  removeCustomWidgetFiles,
  removeRegistryEntries,
} from "@/lib/widget-creator/customRegistry";
import { removeWorkbench } from "@/lib/widget-creator/workbench";

// POST { id } | { ids: [...] }
//
// A delete stops at the registry: the widget's entry goes (a JSON change that
// open pages hot-update in place, so it vanishes from the UI with no reload),
// but its lazy import in customComponentMap.tsx and its component folder stay.
// Removing an import from that map is the one step Turbopack can't hot-swap —
// it full-reloads every open page, even for a widget that was never on screen.
// The parked line + folder are harmless (nothing lists an id without a
// registry entry) and are purged at the next server boot (instrumentation.ts →
// purgeParkedWidgets), when every page reloads anyway.
export async function POST(req: Request) {
  let body: { id?: string; ids?: unknown };
  try {
    body = (await req.json()) as { id?: string; ids?: unknown };
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const raw = Array.isArray(body.ids) ? body.ids : body.id !== undefined ? [body.id] : [];
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string"))];

  if (ids.length === 0 || ids.some((id) => !isValidCustomWidgetId(id))) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    // Read the entries BEFORE removing them — flags.hasApiRoute (recorded from
    // disk at registration, never from the LLM manifest) tells us whether a
    // widget shipped its own app/api/<id> route that must go with it.
    const registry = readRegistry();
    const entries = ids.map((id) => [id, registry[id]] as const);

    // 1. Remove the JSON entries → the widgets disappear from the UI
    //    immediately. One write for the whole batch.
    removeRegistryEntries(ids);

    // 2. The map lines and component folders are parked, not removed — see
    //    above. An id that was never wired into the map (a generated widget
    //    that was never added to the layout) has no import to protect, so its
    //    folder can go now.
    const wired = new Set(listComponentMapIds());
    const removedFiles = ids.filter((id) => !wired.has(id) && removeCustomWidgetFiles(id));
    const parked = ids.filter((id) => wired.has(id));

    // 3. Each widget's own generated API route, if it registered with one.
    //    Guarded by the flag (not a bare existsSync) so a slug that happens to
    //    match a core route can never take app/api/<core-route> down with it —
    //    the generate route also rejects such slugs at create time.
    //    Known residue: a generated-but-never-installed widget's API route has
    //    no registry entry and isn't covered here.
    for (const [id, entry] of entries) {
      if (entry?.flags?.hasApiRoute === true) {
        rmSync(join(process.cwd(), "app/api", id), { recursive: true, force: true });
      }
      removeWorkbench(id);
    }

    // 4. Prune orphan custom folders left behind by older delete/generate
    //    failures; once a folder is not in the registry, the UI has no way to
    //    delete it. Once for the batch.
    const removedOrphans = await pruneOrphanCustomWidgetFiles();

    return NextResponse.json({ ok: true, deleted: ids, parked, removedFiles, removedOrphans });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to delete widget" },
      { status: 500 },
    );
  }
}
