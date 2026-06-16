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
//   registry.json   — the single widget's manifest entry { [id]: entry }
//   <id>/...        — every file in components/widgets/custom/<id>/
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
  zip.addFile("registry.json", Buffer.from(`${JSON.stringify({ [id]: entry }, null, 2)}\n`, "utf-8"));
  for (const file of walk(widgetDir)) {
    // store under "<id>/<relative path within the widget folder>"
    const rel = relative(join(ROOT, "components/widgets/custom"), file).split("\\").join("/");
    zip.addFile(rel, readFileSync(file));
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
