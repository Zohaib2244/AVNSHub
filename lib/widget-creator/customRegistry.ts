// Server-side helpers for the split custom-widget config:
//   config/customRegistry.json    — DATA (manifest fields, no compiler)
//   config/customComponentMap.tsx — CODE (one React.lazy entry per widget)
//
// The generate / delete / import API routes mutate these through here so the
// CRUD mechanics live in one place: JSON parse→mutate→stringify for data, and
// marker-anchored string replacement for the two code lines. No regex, no
// brace-counting — the fragile part of the old single-file approach.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
export const REGISTRY_PATH = join(ROOT, "config/customRegistry.json");
export const COMPONENT_MAP_PATH = join(ROOT, "config/customComponentMap.tsx");

export type RegistryEntry = {
  title: string;
  iconName: string;
  sizes: string[];
  orientations: string[];
  defaults: { size: string; orientation: string; hidden?: boolean };
  settings?: unknown[];
  flags?: Record<string, unknown>;
};

export type CustomRegistry = Record<string, RegistryEntry>;

/** slug → PascalCase (e.g. "my-thing" → "MyThing") */
export function pascalCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/** the component file basename + named export for a widget id ("weather" → "WeatherWidget") */
export function componentName(slug: string): string {
  return `${pascalCase(slug)}Widget`;
}

export function readRegistry(): CustomRegistry {
  if (!existsSync(REGISTRY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as CustomRegistry;
  } catch {
    return {};
  }
}

export function writeRegistry(registry: CustomRegistry): void {
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
}

/** add or replace one entry (replace keeps map order stable — order = key order) */
export function upsertRegistryEntry(id: string, entry: RegistryEntry): void {
  const registry = readRegistry();
  registry[id] = entry;
  writeRegistry(registry);
}

export function removeRegistryEntry(id: string): void {
  const registry = readRegistry();
  if (id in registry) {
    delete registry[id];
    writeRegistry(registry);
  }
}

/** valid size/orientation tokens — used to sanitize LLM/UI-supplied values */
const SIZES = new Set(["S", "M", "L"]);
const ORIENTATIONS = new Set(["h", "v"]);

type EntryInput = {
  id: string;
  name?: string;
  icon?: string;
  sizes?: string[];
  orientations?: string[];
};

/** build a registry entry from the structured creator settings, overlaying any
    existing entry (so an edit keeps its settings schema / flags) */
export function buildRegistryEntry(input: EntryInput, existing?: RegistryEntry): RegistryEntry {
  const sizes = (input.sizes ?? []).filter((s) => SIZES.has(s));
  const orientations = (input.orientations ?? []).filter((o) => ORIENTATIONS.has(o));
  const finalSizes = sizes.length ? sizes : existing?.sizes ?? ["S", "M", "L"];
  const finalOris = orientations.length ? orientations : existing?.orientations ?? ["h"];
  const defaultSize = finalSizes.includes("M") ? "M" : finalSizes[0];
  return {
    title: input.name ?? existing?.title ?? input.id,
    iconName: input.icon ?? existing?.iconName ?? "Box",
    sizes: finalSizes,
    orientations: finalOris,
    defaults: { size: defaultSize, orientation: finalOris[0] },
    settings: existing?.settings ?? [],
    flags: existing?.flags,
  };
}

/** overlay a validated, LLM-authored per-widget manifest.json onto a base entry.
    Only known fields with the right shape are taken; everything else is ignored,
    so a malformed manifest can never corrupt the central registry. */
export function mergeWidgetManifest(base: RegistryEntry, raw: unknown): RegistryEntry {
  if (!raw || typeof raw !== "object") return base;
  const m = raw as Record<string, unknown>;
  const out: RegistryEntry = { ...base };
  if (typeof m.title === "string") out.title = m.title;
  if (typeof m.iconName === "string") out.iconName = m.iconName;
  if (Array.isArray(m.sizes)) {
    const sizes = m.sizes.filter((s): s is string => typeof s === "string" && SIZES.has(s));
    if (sizes.length) out.sizes = sizes;
  }
  if (Array.isArray(m.orientations)) {
    const oris = m.orientations.filter((o): o is string => typeof o === "string" && ORIENTATIONS.has(o));
    if (oris.length) out.orientations = oris;
  }
  if (m.defaults && typeof m.defaults === "object") {
    const d = m.defaults as Record<string, unknown>;
    if (typeof d.size === "string" && out.sizes.includes(d.size)) out.defaults.size = d.size;
    if (typeof d.orientation === "string" && out.orientations.includes(d.orientation)) {
      out.defaults.orientation = d.orientation;
    }
  } else {
    // keep defaults consistent with possibly-narrowed sizes/orientations
    if (!out.sizes.includes(out.defaults.size)) out.defaults.size = out.sizes.includes("M") ? "M" : out.sizes[0];
    if (!out.orientations.includes(out.defaults.orientation)) out.defaults.orientation = out.orientations[0];
  }
  if (Array.isArray(m.settings)) out.settings = m.settings;
  if (m.flags && typeof m.flags === "object") out.flags = m.flags as Record<string, unknown>;
  return out;
}

function lazyDeclLine(id: string): string {
  const comp = componentName(id);
  return `const _${id} = lazy(() => import("@/components/widgets/custom/${id}/${comp}").then((m) => ({ default: m.${comp} })));\n`;
}

function mapEntryLine(id: string): string {
  return `  ${id}: _${id},\n`;
}

/** append the lazy declaration + map entry between the markers (idempotent) */
export function addToComponentMap(id: string): void {
  let content = readFileSync(COMPONENT_MAP_PATH, "utf-8");
  if (content.includes(`const _${id} =`)) return; // already registered
  content = content.replace("// --- custom-components end ---", lazyDeclLine(id) + "// --- custom-components end ---");
  content = content.replace("// --- custom-map end ---", mapEntryLine(id) + "// --- custom-map end ---");
  writeFileSync(COMPONENT_MAP_PATH, content, "utf-8");
}

/** remove the two matching lines by exact string match — no regex, no brace counting */
export function removeFromComponentMap(id: string): void {
  let content = readFileSync(COMPONENT_MAP_PATH, "utf-8");
  content = content.replace(lazyDeclLine(id), "");
  content = content.replace(mapEntryLine(id), "");
  writeFileSync(COMPONENT_MAP_PATH, content, "utf-8");
}
