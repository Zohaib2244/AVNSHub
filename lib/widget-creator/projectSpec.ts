// Per-widget SPEC.md — a small markdown file colocated with a custom widget's
// own code (components/widgets/custom/<slug>/SPEC.md) describing its intent,
// origin, and settings. The creator's project metadata (brief, per-size
// descriptions, data shape, ...) otherwise lives only in the browser's
// localStorage, which the widget's actual code on disk doesn't share — so a
// fresh edit-mode session (new device, cleared storage, or a "virtual"
// project opened with no local history) has nothing but the raw .tsx to infer
// intent from. This file is that missing durable context: written/updated by
// the server after every successful generate turn, and read back into the
// prompt for edit-mode turns instead of asking the harness to explore.
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CUSTOM_WIDGETS_DIR } from "./customRegistry";
import type { GenerateSettings } from "@/app/api/widget-creator/generate/route";

export type ProjectSpecMeta = {
  /** freeform concept text carried over from Plan mode's brief, if any */
  concept?: string;
  /** which pipeline stage this widget originated from ("plan" | "ideate" | "build") */
  entryMode?: string;
};

function specPath(slug: string): string {
  return join(CUSTOM_WIDGETS_DIR, slug, "SPEC.md");
}

export function readProjectSpec(slug: string): string | null {
  const path = specPath(slug);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

export function buildProjectSpecMarkdown(
  slug: string,
  settings: GenerateSettings,
  meta?: ProjectSpecMeta,
): string {
  const lines: string[] = [
    `# ${settings.name ?? slug}`,
    "",
    "> Maintained automatically by the Widget Creator after every successful",
    "> build turn. Describes this widget's intent and settings so any future",
    "> turn — edit mode, a new session, a different device — has full context",
    "> without exploring other files. Do not edit or delete this by hand.",
    "",
    `- **slug**: \`${slug}\``,
  ];

  if (settings.icon) lines.push(`- **icon**: ${settings.icon}`);
  if (settings.sizes?.length) lines.push(`- **sizes**: ${settings.sizes.join(", ")}`);
  if (settings.orientations?.length) lines.push(`- **orientations**: ${settings.orientations.join(", ")}`);
  if (meta?.entryMode) lines.push(`- **originated from**: ${meta.entryMode} mode`);
  if (settings.hoe) lines.push(`- **hover on expand**: enabled (${settings.hoeMode ?? "both"})`);

  if (meta?.concept) {
    lines.push("", "## Concept", "", meta.concept);
  }

  if (settings.requirements) {
    lines.push("", "## Requirements", "", settings.requirements);
  }

  const perSize: [string, string | undefined][] = [
    ["S", settings.sDescription],
    ["M", settings.mDescription],
    ["L", settings.lDescription],
  ];
  if (perSize.some(([, v]) => v)) {
    lines.push("", "## Per-size content", "");
    for (const [size, desc] of perSize) {
      if (desc) lines.push(`- **${size}**: ${desc}`);
    }
  }

  if (settings.dataUrl || settings.dataShape) {
    lines.push("", "## Data source", "");
    if (settings.dataUrl) lines.push(`- **endpoint**: \`${settings.dataUrl}\``);
    if (settings.dataShape) lines.push(`- **shape**: \`${settings.dataShape}\``);
  }

  if (settings.notes) {
    lines.push("", "## Additional notes", "", settings.notes);
  }

  if (settings.designReferenceHtml) {
    lines.push(
      "",
      "## Design reference",
      "",
      "Originally built to match a finalized Ideate-mode mockup. The mockup's",
      "raw HTML/CSS is not repeated here — see the widget's own code for the",
      "translated result.",
    );
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

export function writeProjectSpec(slug: string, markdown: string): void {
  try {
    writeFileSync(specPath(slug), markdown, "utf-8");
  } catch {
    // best-effort — a missing spec just means the next turn falls back to
    // the existing-code + settingsSummary context, same as before this existed
  }
}
