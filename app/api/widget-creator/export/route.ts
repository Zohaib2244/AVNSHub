import { NextResponse } from "next/server";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import AdmZip from "adm-zip";
import { readRegistry, type RegistryEntry } from "@/lib/widget-creator/customRegistry";

const ROOT = process.cwd();

/** recursively collect every file under `dir` as repo-relative paths */
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

// GET /api/widget-creator/export?id=<id>          → <id>-widget.zip
// GET /api/widget-creator/export?ids=<id>,<id>,…  → widgets-<n>.zip  (one bundle)
//
//   registry.json   — the manifest entry for every widget in the archive,
//                     { [id]: entry }, plus "$meta": { hubVersion } so an
//                     importer can flag version skew
//   <id>/...        — every file in components/widgets/custom/<id>/ (incl. SPEC.md)
//   api/...         — a single widget's own app/api/<id>/ route, when it has one
//   api/<id>/...    — the same, in a multi-widget bundle where "api/" alone
//                     would be ambiguous (the import route reads both layouts)
//
// A widget that has no files on disk is skipped rather than failing the whole
// bundle; asking for a single missing widget is still a 404.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const requested = [
    ...new Set(
      [...params.getAll("id"), ...(params.get("ids") ?? "").split(",")]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  if (requested.length === 0 || requested.some((id) => !/^[a-z0-9-]+$/.test(id))) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const registry = readRegistry();
  const unknown = requested.filter((id) => !registry[id]);
  if (unknown.length === requested.length) {
    return NextResponse.json({ error: `unknown widget "${unknown[0]}"` }, { status: 404 });
  }

  const bundle = requested.length > 1;
  const zip = new AdmZip();
  const included: Record<string, RegistryEntry> = {};

  for (const id of requested) {
    const entry = registry[id];
    if (!entry) continue;
    const widgetDir = join(ROOT, "components/widgets/custom", id);
    if (!existsSync(widgetDir)) {
      if (!bundle) return NextResponse.json({ error: `no files for widget "${id}"` }, { status: 404 });
      continue;
    }

    included[id] = entry;
    for (const file of walk(widgetDir)) {
      // store under "<id>/<relative path within the widget folder>"
      const rel = relative(join(ROOT, "components/widgets/custom"), file).split("\\").join("/");
      zip.addFile(rel, readFileSync(file));
    }

    const apiDir = join(ROOT, "app/api", id);
    if (entry.flags?.hasApiRoute === true && existsSync(apiDir)) {
      const prefix = bundle ? `api/${id}/` : "api/";
      for (const file of walk(apiDir)) {
        zip.addFile(prefix + relative(apiDir, file).split("\\").join("/"), readFileSync(file));
      }
    }
  }

  const ids = Object.keys(included);
  if (ids.length === 0) {
    return NextResponse.json({ error: "no exportable widgets in that selection" }, { status: 404 });
  }

  const hubVersion = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { version?: string }).version ?? null;
  zip.addFile("registry.json", Buffer.from(`${JSON.stringify({ ...included, $meta: { hubVersion } }, null, 2)}\n`, "utf-8"));

  const filename = ids.length === 1 ? `${ids[0]}-widget.zip` : `widgets-${ids.length}.zip`;
  const buffer = zip.toBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
