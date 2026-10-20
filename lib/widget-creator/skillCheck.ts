// Verifies a harness skill this project ships (see scripts/sync-widget-skill.mjs)
// is actually present before spawning that harness — generation should fail
// loudly and immediately if it's missing, not silently proceed with a
// degraded prompt the harness has no framework rules to follow.
import { existsSync, statSync } from "fs";
import { join } from "path";
import type { HarnessId } from "@/lib/widget-creator/harnessAdapters";

const REPO_ROOT = process.cwd();

// Which project-local path each harness actually reads a skill from.
// opencode reads both .claude/skills/ and .agents/skills/, so either counts.
function skillCandidatePaths(name: string, harness: HarnessId): string[] {
  const claudePath = join(REPO_ROOT, ".claude", "skills", name, "SKILL.md");
  const agentsPath = join(REPO_ROOT, ".agents", "skills", name, "SKILL.md");
  if (harness === "claude") return [claudePath];
  if (harness === "codex") return [agentsPath];
  return [claudePath, agentsPath]; // opencode
}

/** Does `harness` have a project-local copy of skill `name` available? */
export function isSkillAvailable(name: string, harness: HarnessId): boolean {
  return skillCandidatePaths(name, harness).some((p) => existsSync(p));
}

/** Source of truth for a skill's body — the skill files are generated copies
    (see lib/widget-creator/skillSync.mjs). Kept in sync with SKILL_DEFINITIONS
    there; only the two shipped skills are mapped. */
const SKILL_SOURCES: Record<string, string> = {
  "avn-widget-build": "widget-build-spec.md",
  "avn-widget-plan": "widget-plan-context.md",
};

/** Has the generated skill fallen behind the prompt it is generated from?
 *
 *  This existed as a silent failure: the check below only asked whether a
 *  skill *file* was present, so editing lib/widget-creator/prompts/*.md and
 *  forgetting `npm run sync:widget-skill` left every harness running against
 *  the older copy with no warning anywhere — a rule added to the spec simply
 *  had no effect, which is exactly how a "don't delete the component file"
 *  rule sat un-synced while that delete kept taking the site down.
 *
 *  Compares mtimes rather than content: the generated file prepends YAML
 *  frontmatter, so it is never byte-equal to its source, and any real edit
 *  moves the source's mtime ahead of the copy's. */
export function isSkillStale(name: string, harness: HarnessId): boolean {
  const source = SKILL_SOURCES[name];
  if (!source) return false;
  const sourcePath = join(REPO_ROOT, "lib", "widget-creator", "prompts", source);
  if (!existsSync(sourcePath)) return false;
  try {
    const sourceMtime = statSync(sourcePath).mtimeMs;
    return skillCandidatePaths(name, harness)
      .filter((p) => existsSync(p))
      .some((p) => statSync(p).mtimeMs < sourceMtime);
  } catch {
    return false;
  }
}

/** null if available and current, else an actionable error message. */
export function checkSkillOrError(name: string, harness: HarnessId): string | null {
  if (!isSkillAvailable(name, harness)) {
    return `Widget Creator skill "${name}" is missing for ${harness} (expected under .claude/skills/ or .agents/skills/). Run "npm run sync:widget-skill" to regenerate it.`;
  }
  if (isSkillStale(name, harness)) {
    return `Widget Creator skill "${name}" is out of date — lib/widget-creator/prompts/${SKILL_SOURCES[name]} has been edited since the skill was generated, so ${harness} would run against the older rules. Run "npm run sync:widget-skill" (or the in-app "regenerate skills" action) and retry.`;
  }
  return null;
}
