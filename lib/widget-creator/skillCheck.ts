// Verifies a harness skill this project ships (see scripts/sync-widget-skill.mjs)
// is actually present before spawning that harness — generation should fail
// loudly and immediately if it's missing, not silently proceed with a
// degraded prompt the harness has no framework rules to follow.
import { existsSync } from "fs";
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

/** null if available, else an actionable error message for the caller to surface. */
export function checkSkillOrError(name: string, harness: HarnessId): string | null {
  if (isSkillAvailable(name, harness)) return null;
  return `Widget Creator skill "${name}" is missing for ${harness} (expected under .claude/skills/ or .agents/skills/). Run "npm run sync:widget-skill" to regenerate it.`;
}
