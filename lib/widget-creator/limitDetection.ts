// Patterns that indicate a CLI turn failed and the chain should fall back to
// the next harness. Split into two buckets so the UI can tell the user what
// actually happened instead of always saying "rate limit":
//   - QUOTA: the account's own rate limit/usage quota was hit (429, "usage limit",
//     "credits exhausted") — this is about the user's remaining allowance.
//   - OVERLOAD: a transient server-side condition (529 "overloaded", 503
//     "service unavailable") — nothing to do with the user's quota; it would
//     likely succeed on retry, but falling forward to the next harness is
//     still the right move for a non-interactive generation run.

const QUOTA_PATTERNS = [
  /rate.?limit/i,
  /quota.?exceeded/i,
  /too.?many.?requests/i,
  /\b429\b/,
  /\busage.?limit\b/i,
  /\bcredits?.?exhausted\b/i,
];

const OVERLOAD_PATTERNS = [/\boverloaded\b/i, /\bservice.?unavailable\b/i, /\b503\b/, /\b529\b/];

export type LimitReason = "quota" | "overload" | null;

export function lineSignalsLimit(line: string): LimitReason {
  if (QUOTA_PATTERNS.some((re) => re.test(line))) return "quota";
  if (OVERLOAD_PATTERNS.some((re) => re.test(line))) return "overload";
  return null;
}

export function describeLimitReason(reason: LimitReason): string {
  if (reason === "quota") return "rate limit / quota reached";
  if (reason === "overload") return "upstream service overloaded (not your quota)";
  return "unknown";
}
