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

// POST /api/widget-creator/import  (multipart form, field "file" = the .zip)
//
// Installs a shared widget through the same workbench pipeline as the Widget
// Creator (docs/WIDGET_WORKBENCH.md): the archive is unpacked into the
// widget's private workbench, type-checked there, and only copied into the
// live tree if it passes — a widget built for a different hub version or
// missing a package can no longer take the dashboard down on import.
// Importing an id you already have updates it in place.
//
// Archive layout (see the export route):
//   registry.json   — { "<id>": entry } (exactly one widget)
//   <id>/...        — the widget folder (components/widgets/custom/<id>/)
//   api/...         — optional: the widget's API route (app/api/<id>/)
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
    return NextResponse.json({ error: "registry.json must be an object with one widget" }, { status: 400 });
  }
  const entries = Object.entries(parsed as Record<string, unknown>).filter(([key]) => key !== "$meta");
  if (entries.length !== 1) {
    return NextResponse.json({ error: "registry.json must contain exactly one widget" }, { status: 400 });
  }

  const [id, rawEntry] = entries[0];
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: `invalid widget id "${id}"` }, { status: 400 });
  }
  const existing = readRegistry()[id];

  // collect archive files, mapped to repo-relative destinations
  const files: { rel: string; data: Buffer }[] = [];
  let hasApi = false;
  for (const ze of zip.getEntries()) {
    if (ze.isDirectory) continue;
    const name = ze.entryName.split("\\").join("/");
    let rel: string | null = null;
    if (name.startsWith(`${id}/`)) rel = `components/widgets/custom/${name}`;
    else if (name.startsWith("api/")) {
      rel = `app/api/${id}/${name.slice("api/".length)}`;
      hasApi = true;
    }
    if (!rel) continue; // registry.json and anything else is ignored
    // guard against path traversal in archive entry names
    const clean = normalize(rel).split("\\").join("/");
    if (clean !== rel || rel.split("/").includes("..")) {
      return NextResponse.json({ error: `unsafe path in archive: ${name}` }, { status: 400 });
    }
    files.push({ rel, data: ze.getData() });
  }
  if (!files.some((f) => f.rel.startsWith(`components/widgets/custom/${id}/`) && f.rel.endsWith(".tsx"))) {
    return NextResponse.json({ error: `archive has no component .tsx under ${id}/` }, { status: 400 });
  }
  // a new widget must not claim a core API route that happens to share its id
  if (!existing && hasApi && existsSync(join(ROOT, "app/api", id))) {
    return NextResponse.json({ error: `"${id}" collides with an existing app/api route` }, { status: 409 });
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
    return NextResponse.json({
      error: `this widget needs npm packages that aren't installed: ${[...missing].join(", ")} — run npm install ${[...missing].join(" ")} and import again`,
    }, { status: 422 });
  }

  const lock = acquireGenerationLock("generate");
  if (!lock.ok) {
    return NextResponse.json({ error: describeBusyError(lock.holder, lock.ageMs) }, { status: 409 });
  }

  try {
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
      return NextResponse.json({ error: `no importable component found in ${id}/` }, { status: 400 });
    }

    const tsc = await runWorkbenchTsc(ws);
    if (tsc.errors.length > 0) {
      discardDraft(ws);
      return NextResponse.json({
        error: `the widget doesn't compile against this hub (nothing was installed):\n${tsc.errors.slice(0, 8).join("\n")}`,
        tscErrors: tsc.errors,
      }, { status: 422 });
    }

    const applied = planApply(ws);
    if (!applied.ok) {
      discardDraft(ws);
      return NextResponse.json({ error: `"${id}" changed while importing (${applied.conflicts.join(", ")}) — try again` }, { status: 409 });
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
      if (!wired.ok) {
        return NextResponse.json({ ok: false, error: wired.error }, { status: 500 });
      }
    }
    applyDeletes(applied.plan);
    commitBase(ws);

    const hubVersion = (() => {
      try {
        const meta = (parsed as Record<string, { hubVersion?: unknown }>).$meta;
        return typeof meta?.hubVersion === "string" ? meta.hubVersion : null;
      } catch {
        return null;
      }
    })();
    const ourVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version as string;

    return NextResponse.json({
      ok: true,
      id,
      title: entry.title,
      updated: Boolean(existing),
      ...(hubVersion && hubVersion !== ourVersion ? { note: `exported from AVN Hub ${hubVersion}, you run ${ourVersion}` } : {}),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "import failed" }, { status: 500 });
  } finally {
    releaseGenerationLock();
  }
}
