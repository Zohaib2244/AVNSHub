// Regenerates every harness skill this project ships from its source-of-truth
// fragment files under lib/widget-creator/prompts/, so none of them can
// silently drift from what they're derived from. Run this after editing
// either source. Ships to both .claude/skills/ and .agents/skills/ so Claude
// Code, Codex, and OpenCode (which reads either location) all discover them.
//
// These are hand-authored, AI-optimized specs — deliberately NOT the same
// text as docs/CREATING_WIDGETS.md (the human-facing guide). The doc has
// room for prose/rationale a human benefits from; a harness pays real tokens
// for every word of a loaded skill, so the spec below is written tight:
// tables, rules, and the minimum examples needed to produce correct output.
// When a rule changes, update both by hand - see the doc's own "Optional:
// turn this guide into a harness skill" section for the current split.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS_DIR = path.join(ROOT, "lib", "widget-creator", "prompts");

async function writeSkill(name, description, sourceFile) {
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
  for (const target of targets) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, skill, "utf-8");
    console.log(`wrote ${path.relative(ROOT, target)}`);
  }
}

await writeSkill(
  "avn-widget-build",
  "Use when creating a new widget or editing an existing widget for AVN Hub (a Next.js personal dashboard). Covers the custom-widget split-registry pattern under components/widgets/custom/, per-size layout rules, the settings schema, design tokens, and iframe widgets. Trigger on any request to add, build, generate, scaffold, or edit a dashboard widget.",
  "widget-build-spec.md",
);

// plan/route.ts also reads widget-plan-context.md directly for claude (which
// can't use skills in Plan mode - see that route for why), so this fragment
// is the single source of truth for both paths.
await writeSkill(
  "avn-widget-plan",
  "Use when brainstorming or suggesting new widget ideas for AVN Hub (a self-hosted, extensible personal dashboard) - product and layout context for the ideation step, not the implementation guide (see avn-widget-build for that).",
  "widget-plan-context.md",
);
