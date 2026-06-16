import { NextResponse } from "next/server";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import AdmZip from "adm-zip";
import {
  readRegistry,
  upsertRegistryEntry,
  addToComponentMap,
  buildRegistryEntry,
  mergeWidgetManifest,
  componentName,
} from "@/lib/widget-creator/customRegistry";

const ROOT = process.cwd();

// POST /api/widget-creator/import  (multipart form, field "file" = the .zip)
//   1. read + validate registry.json (exactly one widget, required fields)
//   2. reject if the id already exists
//   3. write the component files to components/widgets/custom/<id>/
//   4. append the JSON entry + the one lazy line (same path as create)
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
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length !== 1) {
    return NextResponse.json({ error: "registry.json must contain exactly one widget" }, { status: 400 });
  }

  const [id, rawEntry] = entries[0];
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: `invalid widget id "${id}"` }, { status: 400 });
  }
  if (id in readRegistry()) {
    return NextResponse.json({ error: `widget "${id}" already exists` }, { status: 409 });
  }

  // sanitize the imported entry through the same builder the creator uses
  const e = (rawEntry ?? {}) as Record<string, unknown>;
  const base = buildRegistryEntry({
    id,
    name: typeof e.title === "string" ? e.title : id,
    icon: typeof e.iconName === "string" ? e.iconName : undefined,
    sizes: Array.isArray(e.sizes) ? (e.sizes as string[]) : undefined,
    orientations: Array.isArray(e.orientations) ? (e.orientations as string[]) : undefined,
  });
  const entry = mergeWidgetManifest(base, rawEntry);

  // the component file the lazy import will point at must be in the archive
  const comp = componentName(id);
  const compEntry = zip.getEntry(`${id}/${comp}.tsx`);
  if (!compEntry) {
    return NextResponse.json(
      { error: `archive is missing the component ${id}/${comp}.tsx` },
      { status: 400 },
    );
  }

  // write every file under "<id>/" into components/widgets/custom/<id>/
  const customRoot = join(ROOT, "components/widgets/custom");
  for (const ze of zip.getEntries()) {
    if (ze.isDirectory) continue;
    const name = ze.entryName.split("\\").join("/");
    if (!name.startsWith(`${id}/`)) continue; // ignore registry.json + anything outside the widget folder
    const dest = join(customRoot, name);
    // guard against path traversal in archive entry names
    if (!dest.startsWith(customRoot)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, ze.getData());
  }

  // register: JSON first, then the one lazy line (same as create)
  upsertRegistryEntry(id, entry);
  addToComponentMap(id);

  return NextResponse.json({ ok: true, id, title: entry.title });
}
