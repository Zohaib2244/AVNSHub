// Deterministic identity-edit endpoint for the Widget Creator's edit mode —
// no LLM harness involved. Lets the user change title/icon/sizes/orientations/
// defaults/slug for an already-generated custom widget without touching its
// component code, so an identity tweak never risks a broken-component rebuild.
import { NextResponse } from "next/server";
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import {
  readRegistry,
  upsertRegistryEntry,
  removeRegistryEntry,
  removeFromComponentMap,
  addToComponentMap,
  findComponentModule,
  isValidCustomWidgetId,
  CUSTOM_WIDGETS_DIR,
  type RegistryEntry,
} from "@/lib/widget-creator/customRegistry";
import { isValidSlug } from "@/lib/widget-creator/slug";

const SIZES = new Set(["S", "M", "L"]);
const ORIENTATIONS = new Set(["h", "v"]);

type UpdateMetaBody = {
  id?: string;
  title?: string;
  iconName?: string;
  sizes?: string[];
  orientations?: string[];
  defaultSize?: string;
  defaultOrientation?: string;
  newSlug?: string;
};

/** keep the on-disk manifest.json's identity fields in sync with the registry
    so a later edit-mode generate run's mergeWidgetManifest() doesn't read the
    stale pre-edit values back out of manifest.json and clobber this edit */
function syncManifestJson(dir: string, entry: RegistryEntry) {
  const manifestPath = join(dir, "manifest.json");
  let manifest: Record<string, unknown> = {};
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      manifest = {};
    }
  }
  manifest.title = entry.title;
  manifest.iconName = entry.iconName;
  manifest.sizes = entry.sizes;
  manifest.orientations = entry.orientations;
  manifest.defaults = entry.defaults;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

export async function POST(req: Request) {
  let body: UpdateMetaBody;
  try {
    body = (await req.json()) as UpdateMetaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "expected JSON body" }, { status: 400 });
  }

  const { id } = body;
  if (!id || !isValidCustomWidgetId(id)) {
    return NextResponse.json({ ok: false, error: "invalid widget id" }, { status: 400 });
  }

  const registry = readRegistry();
  const existing = registry[id];
  if (!existing) {
    return NextResponse.json({ ok: false, error: `no widget registered with id "${id}"` }, { status: 404 });
  }

  const sizes = (body.sizes ?? existing.sizes).filter((s) => SIZES.has(s));
  const orientations = (body.orientations ?? existing.orientations).filter((o) => ORIENTATIONS.has(o));
  if (sizes.length === 0 || orientations.length === 0) {
    return NextResponse.json({ ok: false, error: "at least one size and one orientation are required" }, { status: 400 });
  }

  const defaultSize = body.defaultSize && sizes.includes(body.defaultSize)
    ? body.defaultSize
    : sizes.includes(existing.defaults.size) ? existing.defaults.size : sizes[0];
  const defaultOrientation = body.defaultOrientation && orientations.includes(body.defaultOrientation)
    ? body.defaultOrientation
    : orientations.includes(existing.defaults.orientation) ? existing.defaults.orientation : orientations[0];

  const updatedEntry: RegistryEntry = {
    ...existing,
    title: body.title?.trim() || existing.title,
    iconName: body.iconName?.trim() || existing.iconName,
    sizes,
    orientations,
    defaults: { size: defaultSize, orientation: defaultOrientation, hidden: existing.defaults.hidden },
  };

  const newSlug = body.newSlug?.trim();
  if (newSlug && newSlug !== id) {
    if (!isValidSlug(newSlug)) {
      return NextResponse.json({ ok: false, error: `invalid slug "${newSlug}"` }, { status: 400 });
    }
    if (registry[newSlug]) {
      return NextResponse.json({ ok: false, error: `a widget with id "${newSlug}" already exists` }, { status: 409 });
    }

    const oldDir = join(CUSTOM_WIDGETS_DIR, id);
    const newDir = join(CUSTOM_WIDGETS_DIR, newSlug);
    if (!existsSync(oldDir)) {
      return NextResponse.json({ ok: false, error: `widget folder for "${id}" not found on disk` }, { status: 404 });
    }
    if (existsSync(newDir)) {
      return NextResponse.json({ ok: false, error: `a folder already exists at components/widgets/custom/${newSlug}` }, { status: 409 });
    }

    renameSync(oldDir, newDir);
    const mod = findComponentModule(newSlug);
    if (!mod) {
      renameSync(newDir, oldDir); // roll back — don't strand the widget under a half-renamed folder
      return NextResponse.json({ ok: false, error: "could not locate the component file after rename" }, { status: 500 });
    }

    syncManifestJson(newDir, updatedEntry);
    // registry entry → component map, in that order (mirrors delete/route.ts):
    // the JSON entry is data-only and updates the UI instantly, so removing the
    // old id there first means nothing is left pointing at a stale lazy import
    // by the time the component-map lines are swapped.
    removeRegistryEntry(id);
    removeFromComponentMap(id);
    upsertRegistryEntry(newSlug, updatedEntry);
    addToComponentMap(newSlug, mod);

    return NextResponse.json({ ok: true, id: newSlug });
  }

  const dir = join(CUSTOM_WIDGETS_DIR, id);
  syncManifestJson(dir, updatedEntry);
  upsertRegistryEntry(id, updatedEntry);
  return NextResponse.json({ ok: true, id });
}
