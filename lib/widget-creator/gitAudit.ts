// Post-run write audit for widget generation. The harness runs with
// bypassPermissions in the repo root — the prompt tells it to stay inside the
// widget's own folders, but nothing enforces that. Snapshot `git status
// --porcelain` before the run and diff after: any newly-touched path outside
// the expected set is surfaced to the user as a warning instead of silently
// landing in their working tree.
import { execFile } from "child_process";

const REPO_ROOT = process.cwd();

/** Full porcelain lines, or null when git is unavailable (audit skipped). */
export function snapshotGitStatus(): Promise<Set<string> | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["status", "--porcelain"],
      { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve(new Set(stdout.split("\n").filter(Boolean)));
      },
    );
  });
}

/** "XY path" porcelain line → repo-relative path ("R old -> new" takes the new path). */
function porcelainPath(line: string): string {
  let path = line.slice(3);
  const arrow = path.indexOf(" -> ");
  if (arrow !== -1) path = path.slice(arrow + 4);
  // git quotes paths containing special characters
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  return path;
}

/**
 * Paths that changed between the two snapshots and fall outside the allowed
 * prefixes. Either snapshot being null (git missing) → empty (audit skipped).
 */
export function unexpectedChanges(
  before: Set<string> | null,
  after: Set<string> | null,
  allowedPrefixes: string[],
): string[] {
  if (!before || !after) return [];
  const unexpected: string[] = [];
  for (const line of after) {
    if (before.has(line)) continue;
    const path = porcelainPath(line);
    if (allowedPrefixes.some((prefix) => path.startsWith(prefix))) continue;
    unexpected.push(path);
  }
  return unexpected.sort();
}
