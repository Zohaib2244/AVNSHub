The Problem, Summarised
The current customWidgets.tsx mixes two things that have fundamentally different lifetimes:


customWidgets.tsx
├── import { WeatherWidget } from "..."   ← CODE — needs compilation
├── import { Thermometer } from "..."     ← CODE — needs compilation
└── weather: { title, icon, sizes... }   ← DATA — could be plain JSON
Every CRUD operation touches this TypeScript file, so every operation requires a webpack/Turbopack recompile. The delete bug specifically is that the directory gets deleted before the import is removed, so the compiler sees a broken import and HMR fails.

Target Architecture

Before:                          After:
config/                          config/
  customWidgets.tsx  ←fragile      customRegistry.json     ← DATA only (pure JSON)
                                   customComponentMap.tsx  ← CODE only (append-only)
                                   customWidgets.ts        ← thin merger (reads both)
CRUD surface after migration:

Operation	Touches JSON	Touches TypeScript	Touches files
Create	✅ append entry	✅ append 1 line	✅ write
Delete	✅ remove entry	✅ remove 1 line	✅ delete
Export	read only	never	read only
Import	✅ append entry	✅ append 1 line	✅ write
TypeScript is only touched for create and import (adding a new lazy import). Delete is the one that was broken before — now it removes from JSON first (widget disappears from UI immediately, no compile needed), then cleans up TypeScript with reliable marker-based editing, then deletes files.

Phase 1 — New config files (foundation)
config/customRegistry.json
What: Pure JSON. Stores all widget manifest data: title, icon name (string, not the React component), sizes, orientations, defaults, settings schema.

Why: JSON has no compiler. You can read/write it any time without triggering a recompile. This becomes the single source of truth for "which custom widgets exist and what are their properties."

How it looks:


{
  "weather": {
    "title": "weather",
    "iconName": "Thermometer",
    "sizes": ["S", "M", "L"],
    "orientations": ["h"],
    "defaults": { "size": "M", "orientation": "h" },
    "settings": [
      { "key": "city", "label": "city", "type": "text", "default": "" }
    ]
  }
}
Migrated from customWidgets.tsx on setup. After that, only the API routes touch it.

config/customComponentMap.tsx
What: Explicit React.lazy() entries, one per widget, with section markers. This is the only TypeScript file that changes during CRUD — and only for create/import (appending one line), never for delete.

Why: Turbopack requires static import() paths — template literals don't work for auto-discovery. Explicit entries are the only reliable approach. The file is append-only during normal use: when a widget is deleted, its lazy entry is removed here (the line, not the whole file), using the same marker-based approach the generator already uses for adding entries. A dead entry pointing to a deleted file would break the build — so removal is necessary for delete, but the JSON update happens first so the widget is already gone from the UI before the TypeScript is recompiled.

How it looks:


import { lazy } from "react";
import type { ComponentType } from "react";

// --- custom-components start ---
const _weather = lazy(() => import("@/components/widgets/custom/weather/WeatherWidget"));
// --- custom-components end ---

export const CUSTOM_COMPONENT_MAP: Record<string, ComponentType> = {
// --- custom-map start ---
  weather: _weather,
// --- custom-map end ---
};
Two sections with markers: const _id = lazy(...) declarations, then the map entries. The generator and delete route edit between the markers, not the rest of the file.

config/customWidgets.ts
What: Thin merger. Reads customRegistry.json and customComponentMap.tsx, joins them into CUSTOM_WIDGETS (the export the rest of the app already imports).

Why: Nothing else in the codebase needs to change. Every file that currently does import { CUSTOM_WIDGETS } from "@/config/customWidgets" keeps working as-is.

How it looks:


import * as Icons from "lucide-react";
import type { ComponentType } from "react";
import type { WidgetManifest } from "./widgets";
import registry from "./customRegistry.json";
import { CUSTOM_COMPONENT_MAP } from "./customComponentMap";

export const CUSTOM_WIDGETS: Record<string, WidgetManifest> = 
  Object.fromEntries(
    Object.entries(registry).map(([id, meta]) => [
      id,
      {
        id,
        title: meta.title,
        icon: (Icons as Record<string, ComponentType>)[meta.iconName] ?? Icons.Box,
        component: CUSTOM_COMPONENT_MAP[id] ?? (() => null),
        sizes: meta.sizes as WidgetManifest["sizes"],
        orientations: meta.orientations as WidgetManifest["orientations"],
        defaults: meta.defaults as WidgetManifest["defaults"],
        settings: meta.settings,
      } satisfies WidgetManifest,
    ])
  );

export const CUSTOM_DEFAULT_ORDER: string[] = Object.keys(registry);
The .tsx extension on the old file becomes .ts — no JSX needed in the merger itself.

Phase 2 — Fix the generator
File: app/api/widget-creator/generate/route.ts

What changes: Instead of writing to customWidgets.tsx (the whole manifest + import), the done handler writes two things:

JSON: adds the new widget's entry to customRegistry.json (one JSON.parse → mutate → JSON.stringify → write)
TypeScript: appends between markers in customComponentMap.tsx (two lines: the const _id = lazy(...) declaration, and the id: _id, map entry)
Why this is better than now: The JSON write is fast and doesn't trigger TypeScript recompilation. The TypeScript write is minimal (2 lines, not a full manifest block) and uses markers, so the string manipulation is trivial — no brace-counting regex.

How the TypeScript append looks:


function appendToComponentMap(content: string, id: string, pascal: string): string {
  const decl = `const _${id} = lazy(() => import("@/components/widgets/custom/${id}/${pascal}Widget"));\n`;
  const entry = `  ${id}: _${id},\n`;
  
  content = content.replace("// --- custom-components end ---", decl + "// --- custom-components end ---");
  content = content.replace("// --- custom-map end ---", entry + "// --- custom-map end ---");
  return content;
}
Two string replacements, both anchored to comment markers. Zero regex on widget data.

Phase 3 — Fix delete (correct order + correct mechanics)
File: app/api/widget-creator/delete/route.ts

What: The delete route runs three steps in strict order:


1. Remove from customRegistry.json     → widget disappears from UI immediately
                                          (JSON change, HMR triggers, no TypeScript compile)
2. Remove from customComponentMap.tsx  → 2-line removal using marker positions
                                          (TypeScript change, one compile cycle)
3. Delete files from disk              → happens AFTER TypeScript is consistent
                                          (no broken import during compilation)
Why the order matters: In the current broken implementation, step 3 happens before step 1 or 2. Turbopack sees the import pointing to a deleted file and throws a module resolution error. The whole HMR cycle fails. With the new order, by the time the files are gone, customComponentMap.tsx has already been updated and Turbopack has already compiled a clean version.

Why step 1 (JSON) matters separately: After step 1 but before steps 2 and 3 are complete, the widget is already gone from the UI. The user sees instant removal. Steps 2 and 3 are cleanup that happens in the background during the same HTTP request.

How the TypeScript removal looks:


function removeFromComponentMap(content: string, id: string, pascal: string): string {
  // Remove the lazy declaration (exact line match, no brace counting)
  content = content.replace(
    `const _${id} = lazy(() => import("@/components/widgets/custom/${id}/${pascal}Widget"));\n`,
    ""
  );
  // Remove the map entry
  content = content.replace(`  ${id}: _${id},\n`, "");
  return content;
}
Exact string match on known lines — no regex, no brace counting.

Phase 4 — Export API + Widget Manager button
New file: app/api/widget-creator/export/route.ts (GET with ?id=<id>)

What it does:

Reads the widget's entry from customRegistry.json
Reads all files from components/widgets/custom/<id>/
Creates a .zip in memory:
registry.json — the single widget's manifest entry
<id>/ — all component files
Serves the zip as <id>-widget.zip
Why .zip (not custom format): The recipient can inspect the contents before importing. The component files are readable TypeScript. No binary format learning curve.

Dependency to install: adm-zip (pure Node.js, no native deps, works in Next.js API routes without config)

Widget Manager change: Add a download icon button next to each custom widget (next to the existing trash button). Clicking it triggers window.location.href = /api/widget-creator/export?id=<id>. No state management needed — it's a direct file download.

Phase 5 — Import API + Widget Manager UI
New file: app/api/widget-creator/import/route.ts (POST, multipart form)

What it does:

Receives the .zip via multipart form upload
Extracts and validates registry.json — must have exactly one widget entry with required fields
Checks for ID conflicts (widget already exists → return error)
Writes component files to components/widgets/custom/<id>/
Appends to customRegistry.json (same as create — JSON merge)
Appends to customComponentMap.tsx (same as create — 2-line append between markers)
Widget Manager change: Add an import button (upload icon) at the top of the custom widgets section. Opens a hidden <input type="file" accept=".zip">. On file select, POST to the import route and show a status (importing... / imported ✓ / error: already exists). On success, HMR picks up the two file changes and the widget appears in the manager.

What stays the same
WidgetManager.**tsx** — no structural changes, CUSTOM_WIDGETS export is unchanged
config/widgets.tsx — unchanged
All widget component files in components/widgets/custom/<id>/ — unchanged
Everything else in the app — unchanged
Implementation order

1. Create customRegistry.json (migrate existing widgets from customWidgets.tsx)
2. Create customComponentMap.tsx (migrate imports from customWidgets.tsx)
3. Rewrite customWidgets.ts (the thin merger — delete the old .tsx)
4. Verify app still works (tsc --noEmit + visual check)
5. Update generate/route.ts
6. Rewrite delete/route.ts
7. Install adm-zip, create export/route.ts, add export button to WidgetManager
8. Create import/route.ts, add import UI to WidgetManager
Steps 1–4 are pure refactor with no visible change. Steps 5–6 fix the existing bugs. Steps 7–8 add the new feature. Want me to start from step 1?