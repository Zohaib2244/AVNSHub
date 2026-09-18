import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, normalize } from "path";
import AdmZip from "adm-zip";
import {
  readRegistry,
  upsertRegistryEntry,
  addToComponentMap,
  buildRegistryEntry,
  mergeWidgetManifest,
  findComponentModule,
  syncComponentMapEntry,
} from "@/lib/widget-creator/customRegistry";
import { acquireGenerationLock, describeBusyError, releaseGenerationLock } from "@/lib/widget-creator/generationLock";
import {
  applyDeletes,
  applyWrites,
  commitBase,
  discardDraft,
  planApply,
  prepareWorkbench,
  runWorkbenchTsc,
  workbenchCustomDir,
} from "@/lib/widget-creator/workbench";

const ROOT = process.cwd();

/** bare npm specifiers a widget's source imports (relative, "@/" and node: excluded) */
function importedPackages(source: string): string[] {
  const names = new Set<string>();
  const re = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
  for (const match of source.matchAll(re)) {
    const spec = match[1];
    if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("node:") || spec.startsWith("/")) continue;
    const parts = spec.split("/");
    names.add(spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
  }
  return [...names];
}

type Pending = { id: string; rawEntry: unknown; files: { rel: string; data: Buffer }[]; hasApi: boolean };
type Result = {
  id: string;
  ok: boolean;
  updated?: boolean;
  title?: string;
  error?: string;
  tscErrors?: string[];
  /** HTTP status to use when this is the archive's only widget */
  status?: number;
};

/** Install one widget from an archive through its own workbench. Each widget is
    validated and type-checked in isolation, so one bad widget in a bundle fails
    alone instead of taking the rest of the import down with it. */
async function installWidget({ id, rawEntry, files, hasApi }: Pending): Promise<Result> {
  const existing = readRegistry()[id];

  if (!files.some((f) => f.rel.startsWith(`components/widgets/custom/${id}/`) && f.rel.endsWith(".tsx"))) {
    return { id, ok: false, status: 400, error: `archive has no component .tsx under ${id}/` };
  }
  // a new widget must not claim a core API route that happens to share its id
  if (!existing && hasApi && existsSync(join(ROOT, "app/api", id))) {
    return { id, ok: false, status: 409, error: `"${id}" collides with an existing app/api route` };
  }

  // every npm package the widget imports must already be installed here
  const missing = new Set<string>();
  for (const f of files) {
    if (!/\.(tsx?|jsx?|mjs)$/.test(f.rel)) continue;
    for (const pkg of importedPackages(f.data.toString("utf-8"))) {
      if (!existsSync(join(ROOT, "node_modules", pkg, "package.json"))) missing.add(pkg);
    }
  }
  if (missing.size > 0) {
    return {
      id,
      ok: false,
      status: 422,
      error: `this widget needs npm packages that aren't installed: ${[...missing].join(", ")} — run npm install ${[...missing].join(" ")} and import again`,
    };
  }

  const ws = await prepareWorkbench(id);
  // the archive replaces the widget wholesale — but an archive without an
  // api/ folder leaves an existing route alone rather than deleting it
  discardDraft(ws, { keepApi: !hasApi });
  for (const f of files) {
    const dest = join(ws.tree, f.rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.data);
  }

  if (!findComponentModule(id, workbenchCustomDir(ws))) {
    discardDraft(ws);
    return { id, ok: false, status: 400, error: `no importable component found in ${id}/` };
  }

  const tsc = await runWorkbenchTsc(ws);
  if (tsc.errors.length > 0) {
    discardDraft(ws);
    return {
      id,
      ok: false,
      status: 422,
      error: `the widget doesn't compile against this hub (nothing was installed):\n${tsc.errors.slice(0, 8).join("\n")}`,
      tscErrors: tsc.errors,
    };
  }

  const applied = planApply(ws);
  if (!applied.ok) {
    discardDraft(ws);
    return { id, ok: false, status: 409, error: `"${id}" changed while importing (${applied.conflicts.join(", ")}) — try again` };
  }

  // sanitize the imported entry through the same builder the creator uses
  const e = (rawEntry ?? {}) as Record<string, unknown>;
  const base = buildRegistryEntry({
    id,
    name: typeof e.title === "string" ? e.title : id,
    icon: typeof e.iconName === "string" ? e.iconName : undefined,
    sizes: Array.isArray(e.sizes) ? (e.sizes as string[]) : undefined,
    orientations: Array.isArray(e.orientations) ? (e.orientations as string[]) : undefined,
  }, existing);
  const entry = mergeWidgetManifest(base, rawEntry);

  // files first, then registry + map, then deletions — the map never points
  // at a file that isn't there
  applyWrites(ws, applied.plan);
  entry.flags = { ...entry.flags, hasApiRoute: existsSync(join(ROOT, "app/api", id, "route.ts")) };
  upsertRegistryEntry(id, entry);
  if (existing) {
    syncComponentMapEntry(id);
  } else {
    const wired = addToComponentMap(id, findComponentModule(id) ?? undefined);
    if (!wired.ok) return { id, ok: false, status: 500, error: wired.error };
  }
  applyDeletes(applied.plan);
  commitBase(ws);

  return { id, ok: true, updated: Boolean(existing), title: entry.title };
}

// POST /api/widget-creator/import  (multipart form, field "file" = the .zip)
//
// Installs shared widgets through the same workbench pipeline as the Widget
// Creator (docs/WIDGET_WORKBENCH.md): each archive entry is unpacked into that
// widget's private workbench, type-checked there, and only copied into the
// live tree if it passes — a widget built for a different hub version or
// missing a package can no longer take the dashboard down on import.
// Importing an id you already have updates it in place.
//
// Archive layout (see the export route):
//   registry.json   — { "<id>": entry, ... } — one widget, or a whole bundle
//   <id>/...        — the widget folder (components/widgets/custom/<id>/)
//   api/...         — optional: a single widget's API route (app/api/<id>/)
//   api/<id>/...    — the same in a multi-widget bundle
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "no file uploaded" }, { status: 400 });
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "could not read zip archive" }, { status: 400 });
  }

  const registryRaw = zip.getEntry("registry.json")?.getData().toString("utf-8");
  if (!registryRaw) {
    return NextResponse.json({ error: "archive is missing registry.json" }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(registryRaw);
  } catch {
    return NextResponse.json({ error: "registry.json is not valid JSON" }, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "registry.json must be an object with one or more widgets" }, { status: 400 });
  }
  const entries = Object.entries(parsed as Record<string, unknown>).filter(([key]) => key !== "$meta");
  if (entries.length === 0) {
    return NextResponse.json({ error: "registry.json contains no widgets" }, { status: 400 });
  }
  const bad = entries.find(([key]) => !/^[a-z0-9-]+$/.test(key));
  if (bad) {
    return NextResponse.json({ error: `invalid widget id "${bad[0]}"` }, { status: 400 });
  }

  const ids = entries.map(([id]) => id);
  const idSet = new Set(ids);
  const pending = new Map<string, Pending>(
    entries.map(([id, rawEntry]) => [id, { id, rawEntry, files: [], hasApi: false }]),
  );

  // collect archive files, mapped to repo-relative destinations, per widget
  for (const ze of zip.getEntries()) {
    if (ze.isDirectory) continue;
    const name = ze.entryName.split("\\").join("/");
    let owner: string | null = null;
    let rel: string | null = null;

    const top = name.split("/")[0];
    if (idSet.has(top) && name.includes("/")) {
      owner = top;
      rel = `components/widgets/custom/${name}`;
    } else if (name.startsWith("api/")) {
      const rest = name.slice("api/".length);
      const apiTop = rest.split("/")[0];
      if (idSet.has(apiTop) && rest.includes("/")) {
        // bundle layout: api/<id>/route.ts
        owner = apiTop;
        rel = `app/api/${apiTop}/${rest.slice(apiTop.length + 1)}`;
      } else if (ids.length === 1) {
        // single-widget layout: api/route.ts
        owner = ids[0];
        rel = `app/api/${ids[0]}/${rest}`;
      }
    }
    if (!owner || !rel) continue; // registry.json and anything else is ignored

    // guard against path traversal in archive entry names
    const clean = normalize(rel).split("\\").join("/");
    if (clean !== rel || rel.split("/").includes("..")) {
      return NextResponse.json({ error: `unsafe path in archive: ${name}` }, { status: 400 });
    }
    const target = pending.get(owner)!;
    if (rel.startsWith("app/api/")) target.hasApi = true;
    target.files.push({ rel, data: ze.getData() });
  }

  const lock = acquireGenerationLock("generate");
  if (!lock.ok) {
    return NextResponse.json({ error: describeBusyError(lock.holder, lock.ageMs) }, { status: 409 });
  }

  const results: Result[] = [];
  try {
    for (const id of ids) {
      try {
        results.push(await installWidget(pending.get(id)!));
      } catch (error) {
        results.push({ id, ok: false, status: 500, error: error instanceof Error ? error.message : "import failed" });
      }
    }
  } finally {
    releaseGenerationLock();
  }

  const hubVersion = (() => {
    const meta = (parsed as Record<string, { hubVersion?: unknown }>).$meta;
    return typeof meta?.hubVersion === "string" ? meta.hubVersion : null;
  })();
  const ourVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version as string;
  const note = hubVersion && hubVersion !== ourVersion ? `exported from AVN Hub ${hubVersion}, you run ${ourVersion}` : null;

  const installed = results.filter((r) => r.ok);

  // A single-widget archive keeps the v1 response shape (and its exact status
  // codes) so older callers are unaffected; bundles report per-widget results.
  if (ids.length === 1) {
    const only = results[0];
    if (!only.ok) {
      return NextResponse.json(
        { error: only.error ?? "import failed", ...(only.tscErrors ? { tscErrors: only.tscErrors } : {}) },
        { status: only.status ?? 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      id: only.id,
      title: only.title,
      updated: only.updated,
      results,
      ...(note ? { note } : {}),
    });
  }

  return NextResponse.json(
    {
      ok: installed.length > 0,
      imported: installed.map((r) => r.id),
      failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error })),
      results,
      ...(note ? { note } : {}),
    },
    { status: installed.length > 0 ? 200 : 422 },
  );
}
