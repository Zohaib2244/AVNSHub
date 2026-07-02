// Shared skill-regeneration helper for the Widget Creator. Used by both the
// npm script and the in-app "regenerate skills" action.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROMPTS_DIR = path.join(ROOT, "lib", "widget-creator", "prompts");

export const SKILL_DEFINITIONS = [
  {
    name: "avn-widget-build",
    description: "Use when creating a new widget or editing an existing widget for AVN Hub (a Next.js personal dashboard). Covers the custom-widget split-registry pattern under components/widgets/custom/, per-size layout rules, the settings schema, design tokens, and iframe widgets. Trigger on any request to add, build, generate, scaffold, or edit a dashboard widget.",
    sourceFile: "widget-build-spec.md",
  },
  {
    name: "avn-widget-plan",
    description: "Use when brainstorming or suggesting new widget ideas for AVN Hub (a self-hosted, extensible personal dashboard) - product and layout context for the ideation step, not the implementation guide (see avn-widget-build for that).",
    sourceFile: "widget-plan-context.md",
  },
];

/**
 * @param {string} name
 * @param {string} description
 * @param {string} sourceFile
 * @param {{ log?: (message: string) => void }} [options]
 * @returns {Promise<string[]>} project-relative target paths written
 */
export async function writeSkill(name, description, sourceFile, options = {}) {
  const body = await readFile(path.join(PROMPTS_DIR, sourceFile), "utf-8");
  const skill = `---
name: ${name}
description: ${description}
---

${body.replace(/\n+$/, "\n")}`;

  const targets = [
    path.join(ROOT, ".claude", "skills", name, "SKILL.md"),
    path.join(ROOT, ".agents", "skills", name, "SKILL.md"),
  ];
  const written = [];
  for (const target of targets) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, skill, "utf-8");
    const relative = path.relative(ROOT, target);
    written.push(relative);
    options.log?.(`wrote ${relative}`);
  }
  return written;
}

/**
 * @param {{ log?: (message: string) => void }} [options]
 * @returns {Promise<string[]>} project-relative target paths written
 */
export async function syncWidgetSkills(options = {}) {
  const written = [];
  for (const skill of SKILL_DEFINITIONS) {
    written.push(...await writeSkill(skill.name, skill.description, skill.sourceFile, options));
  }
  return written;
}
