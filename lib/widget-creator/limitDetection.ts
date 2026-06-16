// Patterns that indicate a CLI has hit a rate limit or quota.
// Checked against each stdout/stderr line emitted by the subprocess.

const LIMIT_PATTERNS = [
  /rate.?limit/i,
  /quota.?exceeded/i,
  /too.?many.?requests/i,
  /\b429\b/,
  /\busage.?limit\b/i,
  /\bcredits?.?exhausted\b/i,
  /\boverloaded\b/i,
  /\bservice.?unavailable\b/i,
  /\b503\b/,
];

export function lineSignalsLimit(line: string): boolean {
  return LIMIT_PATTERNS.some((re) => re.test(line));
}
