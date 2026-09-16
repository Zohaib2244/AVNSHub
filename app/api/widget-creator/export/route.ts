import { NextResponse } from "next/server";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import AdmZip from "adm-zip";
import { readRegistry } from "@/lib/widget-creator/customRegistry";

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

// GET /api/widget-creator/export?id=<id> → <id>-widget.zip
//   registry.json   — the single widget's manifest entry { [id]: entry }, plus
//                     "$meta": { hubVersion } so an importer can flag version skew
//   <id>/...        — every file in components/widgets/custom/<id>/ (incl. SPEC.md)
//   api/...         — the widget's own app/api/<id>/ route, when it has one
//                     (flags.hasApiRoute) — without it a shared data widget
//                     would arrive with its front end but no data source
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const entry = readRegistry()[id];
  if (!entry) {
    return NextResponse.json({ error: `unknown widget "${id}"` }, { status: 404 });
  }

  const widgetDir = join(ROOT, "components/widgets/custom", id);
  if (!existsSync(widgetDir)) {
    return NextResponse.json({ error: `no files for widget "${id}"` }, { status: 404 });
  }

  const zip = new AdmZip();
  const hubVersion = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { version?: string }).version ?? null;
  zip.addFile("registry.json", Buffer.from(`${JSON.stringify({ [id]: entry, $meta: { hubVersion } }, null, 2)}\n`, "utf-8"));
  for (const file of walk(widgetDir)) {
    // store under "<id>/<relative path within the widget folder>"
    const rel = relative(join(ROOT, "components/widgets/custom"), file).split("\\").join("/");
    zip.addFile(rel, readFileSync(file));
  }

  const apiDir = join(ROOT, "app/api", id);
  if (entry.flags?.hasApiRoute === true && existsSync(apiDir)) {
    for (const file of walk(apiDir)) {
      zip.addFile(`api/${relative(apiDir, file).split("\\").join("/")}`, readFileSync(file));
    }
  }

  const buffer = zip.toBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${id}-widget.zip"`,
      "Content-Length": String(buffer.length),
    },
  });
}
