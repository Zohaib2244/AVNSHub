// Server-side helpers for the split custom-widget config:
//   config/customRegistry.json    — DATA (manifest fields, no compiler)
//   config/customComponentMap.tsx — CODE (one React.lazy entry per widget)
//
// The generate / delete / import API routes mutate these through here so the
// CRUD mechanics live in one place: JSON parse→mutate→stringify for data, and
// marker-anchored string replacement for the two code lines. No regex, no
// brace-counting — the fragile part of the old single-file approach.
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
export const REGISTRY_PATH = join(ROOT, "config/customRegistry.json");
export const COMPONENT_MAP_PATH = join(ROOT, "config/customComponentMap.tsx");
export const CUSTOM_WIDGETS_DIR = join(ROOT, "components/widgets/custom");

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

export function isValidCustomWidgetId(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

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

export function removeCustomWidgetFiles(id: string): boolean {
  if (!isValidCustomWidgetId(id)) return false;
  const widgetDir = join(CUSTOM_WIDGETS_DIR, id);
  if (!existsSync(widgetDir)) return false;
  rmSync(widgetDir, { recursive: true, force: true });
  return true;
}

// A generated-but-not-yet-installed widget has files on disk but no registry
// entry — exactly what this prune treats as an orphan. Skip anything recently
// touched so pending work can't be swept away by deleting an unrelated widget.
const PRUNE_MIN_AGE_MS = 48 * 60 * 60 * 1000;

function newestMtimeMs(dir: string): number {
  let newest = statSync(dir).mtimeMs;
  for (const f of readdirSync(dir)) {
    try {
      newest = Math.max(newest, statSync(join(dir, f)).mtimeMs);
    } catch {}
  }
  return newest;
}

export function pruneOrphanCustomWidgetFiles(): string[] {
  if (!existsSync(CUSTOM_WIDGETS_DIR)) return [];
  const registry = readRegistry();
  const keepIds = new Set(Object.keys(registry));
  const removed: string[] = [];

  for (const name of readdirSync(CUSTOM_WIDGETS_DIR)) {
    if (!isValidCustomWidgetId(name) || keepIds.has(name)) continue;

    const widgetDir = join(CUSTOM_WIDGETS_DIR, name);
    try {
      if (!statSync(widgetDir).isDirectory()) continue;
      if (Date.now() - newestMtimeMs(widgetDir) < PRUNE_MIN_AGE_MS) continue;
      rmSync(widgetDir, { recursive: true, force: true });
      removed.push(name);
    } catch {
      // Leave folders we cannot stat/remove; the delete route reports exact-id failures.
    }
  }

  return removed;
}

/** valid size/orientation tokens — used to sanitize LLM/UI-supplied values */
const SIZES = new Set(["S", "M", "L"]);
const ORIENTATIONS = new Set(["h", "v"]);

export type EntryInput = {
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

/** how to lazy-load a widget's component: which file (basename, no extension)
    to import and which named export to remap to `default` (null = the file
    already has a default export, so no remap is needed) */
export type ComponentModule = { file: string; exportName: string | null };

/** Inspect a widget's folder and work out how to import its component, instead
    of assuming the conventional `<Pascal>Widget.tsx` name. The generator nudges
    the LLM toward that name, but it doesn't always comply (and imported widgets
    may be named differently), so detect the real file + export. */
export function findComponentModule(id: string): ComponentModule | null {
  const dir = join(CUSTOM_WIDGETS_DIR, id);
  if (!existsSync(dir)) return null;
  const tsxFiles = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  if (tsxFiles.length === 0) return null;

  // prefer the conventional <Pascal>Widget.tsx, else the first .tsx file
  const preferred = `${componentName(id)}.tsx`;
  const chosen = tsxFiles.includes(preferred) ? preferred : tsxFiles.sort()[0];
  const file = chosen.slice(0, -4); // strip ".tsx"
  const src = readFileSync(join(dir, chosen), "utf-8");

  if (/export\s+default\b/.test(src)) return { file, exportName: null };
  // a named export matching the basename, else the first PascalCase export
  const matchesBase = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${file}\\b`).test(src);
  const firstExport = src.match(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Z]\w*)/)?.[1] ?? null;
  return { file, exportName: matchesBase ? file : firstExport };
}

/** a JS-safe local variable name for an id — ids may contain hyphens
    ("spotify-visualizer"), which are illegal in identifiers */
function localVar(id: string): string {
  return `_${id.replace(/[^a-zA-Z0-9_$]/g, "_")}`;
}

function lazyDeclLine(id: string, mod: ComponentModule): string {
  const path = `@/components/widgets/custom/${id}/${mod.file}`;
  const v = localVar(id);
  return mod.exportName
    ? `const ${v} = lazy(() => import("${path}").then((m) => ({ default: m.${mod.exportName} })));\n`
    : `const ${v} = lazy(() => import("${path}"));\n`;
}

function mapEntryLine(id: string): string {
  // always quote the key — ids can contain hyphens, illegal as bare keys
  return `  "${id}": ${localVar(id)},\n`;
}

/** append the lazy declaration + map entry between the markers (idempotent).
    `mod` defaults to the detected module, falling back to the conventional name. */
export function addToComponentMap(id: string, mod?: ComponentModule): { ok: boolean; error?: string } {
  let content = readFileSync(COMPONENT_MAP_PATH, "utf-8");
  if (content.includes(`const ${localVar(id)} =`)) return { ok: true }; // already registered
  // Without both markers String.replace silently no-ops and the widget would
  // "register" without ever being wired in — fail loudly instead.
  if (!content.includes("// --- custom-components end ---") || !content.includes("// --- custom-map end ---")) {
    return {
      ok: false,
      error: "config/customComponentMap.tsx is missing its marker comments — restore them or the widget cannot be wired in",
    };
  }
  const resolved = mod ?? findComponentModule(id) ?? { file: componentName(id), exportName: componentName(id) };
  content = content.replace("// --- custom-components end ---", lazyDeclLine(id, resolved) + "// --- custom-components end ---");
  content = content.replace("// --- custom-map end ---", mapEntryLine(id) + "// --- custom-map end ---");
  writeFileSync(COMPONENT_MAP_PATH, content, "utf-8");
  return { ok: true };
}

/** Wire an already-on-disk component + manifest.json into the split config:
    build the entry from the creator's structured settings, overlay the
    LLM-authored manifest.json, write it into customRegistry.json, and append
    the one lazy line to customComponentMap.tsx (addToComponentMap() no-ops if
    that line already exists, e.g. on a repeat edit).
    Shared by two call sites with very different reload tolerance:
      - the generate route auto-calls this for an edit to an *already-committed*
        widget — customRegistry.json is the only file that changes (JSON-only,
        Fast Refresh hot-updates it fine), so it's safe to apply immediately.
      - the register route calls this for a brand-new widget's first commit —
        appending to customComponentMap.tsx is the one write Next's Fast Refresh
        can't hot-swap (it's a .tsx file that exports data, not a component, so
        a change there forces a full reload). That write is deliberately
        deferred until the user explicitly clicks "add to layout", instead of
        happening mid-generation where the reload would tear down the SSE
        stream before the "done" event ever reaches the client. */
export function registerCustomWidget(input: EntryInput): { ok: boolean; error?: string } {
  if (!isValidCustomWidgetId(input.id)) return { ok: false, error: `invalid slug "${input.id}"` };

  const dir = join(CUSTOM_WIDGETS_DIR, input.id);
  const mod = findComponentModule(input.id);
  if (!mod) {
    return { ok: false, error: `no component .tsx file was created in components/widgets/custom/${input.id}/` };
  }

  const existing = readRegistry()[input.id];
  let entry = buildRegistryEntry(input, existing);

  // overlay the LLM-authored per-widget manifest.json when it parses cleanly;
  // a malformed manifest is ignored so it can never corrupt the registry
  const manifestPath = join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      entry = mergeWidgetManifest(entry, JSON.parse(readFileSync(manifestPath, "utf-8")));
    } catch {
      /* keep the settings-derived entry */
    }
  }

  // Record from DISK whether this widget shipped its own app/api/<id> route —
  // never from the LLM manifest, which could claim anything. The delete route
  // uses this to clean the route up; every registration path (generate-route
  // edit re-registration, deferred register route, import) flows through here
  // so no cross-route state is needed. The extra flag key is inert to client
  // flag consumers (they only read plainChrome/customHeader/accent/className).
  const hasApiRoute = existsSync(join(ROOT, "app/api", input.id, "route.ts"));
  entry.flags = { ...entry.flags, hasApiRoute };

  upsertRegistryEntry(input.id, entry);
  const wired = addToComponentMap(input.id, mod);
  if (!wired.ok) {
    // a FRESH registration must not leave an entry pointing at an unwired
    // component; a re-registration keeps its (previously working) entry
    if (!existing) removeRegistryEntry(input.id);
    return { ok: false, error: wired.error };
  }
  return { ok: true };
}

/** remove this widget's declaration + map entry by id — line-based so it works
    regardless of which file/export the declaration happened to point at */
export function removeFromComponentMap(id: string): void {
  const content = readFileSync(COMPONENT_MAP_PATH, "utf-8");
  const v = localVar(id);
  const declPrefix = `const ${v} = `;
  // handle both quoted ("id": v) and bare (id: v) key formats
  const lines = content.split("\n");
  const kept = lines
    .filter((line) => !line.startsWith(declPrefix) && line !== `  "${id}": ${v},` && line !== `  ${id}: ${v},`);
  if (kept.length === lines.length) return;
  writeFileSync(COMPONENT_MAP_PATH, kept.join("\n"), "utf-8");
}

/** Scan customComponentMap.tsx for lazy imports pointing to files that no longer
    exist and remove those entries (+ their registry entries). Returns the ids that
    were cleaned up. Call this at the start of every generate request so a stale
    entry from a prior bad run never keeps the site in a broken compile state. */
export function sanitizeComponentMap(): string[] {
  const content = readFileSync(COMPONENT_MAP_PATH, "utf-8");
  const staleIds: string[] = [];

  for (const line of content.split("\n")) {
    // match: const _xxx = lazy(() => import("@/components/widgets/custom/<id>/<file>"...
    const m = line.match(
      /^const \w+ = lazy\(\(\) => import\("@\/components\/widgets\/custom\/([^/]+)\/([^"]+)"/,
    );
    if (!m) continue;
    const [, id, file] = m;
    const filePath = join(CUSTOM_WIDGETS_DIR, id, `${file}.tsx`);
    if (!existsSync(filePath)) staleIds.push(id);
  }

  for (const id of staleIds) {
    removeFromComponentMap(id);
    removeRegistryEntry(id);
  }

  return staleIds;
}
