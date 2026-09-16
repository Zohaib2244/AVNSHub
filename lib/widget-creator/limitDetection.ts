// Patterns that indicate a CLI turn failed and the chain should fall back to
// the next harness. Split into two buckets so the UI can tell the user what
// actually happened instead of always saying "rate limit":
//   - QUOTA: the account's own rate limit/usage quota was hit (429, "usage limit",
//     "credits exhausted") — this is about the user's remaining allowance.
//   - OVERLOAD: a transient server-side condition (529 "overloaded", 503
//     "service unavailable") — nothing to do with the user's quota; it would
//     likely succeed on retry, but falling forward to the next harness is
//     still the right move for a non-interactive generation run.
//   - SANDBOX: the CLI's own execution sandbox is broken, so *every* command
//     it runs fails before it starts. Not a quota or a server problem — the
//     harness is simply unusable on this machine until an operator fixes it.

const QUOTA_PATTERNS = [
  /rate.?limit/i,
  /quota.?exceeded/i,
  /too.?many.?requests/i,
  /\b429\b/,
  /\busage.?limit\b/i,
  /\bcredits?.?exhausted\b/i,
];

const OVERLOAD_PATTERNS = [/\boverloaded\b/i, /\bservice.?unavailable\b/i, /\b503\b/, /\b529\b/];

// Deliberately narrow, because unlike the patterns above these are matched
// against the harness's *content* frames too (see below) — a mockup or widget
// that happens to print the words "sandbox" or "permission denied" must not
// trip this. Each pattern names a specific sandbox binary + its own failure
// text, which generated code has no reason to contain.
//
// codex bundles bubblewrap and runs every command inside it. On a host with
// `kernel.apparmor_restrict_unprivileged_userns=1` (Ubuntu 24.04+), AppArmor
// transitions that bwrap into the restrictive `unprivileged_userns` profile
// and denies `net_admin`, so bwrap cannot bring up loopback in the new netns
// and aborts before exec'ing anything — every command, including `true`,
// fails with this. Observed on avns2 with codex 0.153.4; the CLI does not
// treat it as fatal and still exits 0 having done nothing.
const SANDBOX_PATTERNS = [
  /bwrap:\s.*Operation not permitted/i,
  /bwrap:\s.*Failed RTM_NEWADDR/i,
  /bwrap:\s.*(?:setting up uid map|creating new namespace|No permissions to creat)/i,
];

export type LimitReason = "quota" | "overload" | "sandbox" | null;

export function lineSignalsLimit(line: string): LimitReason {
  if (QUOTA_PATTERNS.some((re) => re.test(line))) return "quota";
  if (OVERLOAD_PATTERNS.some((re) => re.test(line))) return "overload";
  return null;
}

/** Checked against every line including tool-output/content frames — a broken
 *  sandbox surfaces inside the harness's own command-output frames, which
 *  lineSignalsLimit deliberately skips. One hit is enough: if the sandbox
 *  can't start one command it can't start any, so there is nothing to gain by
 *  letting the run continue. */
export function lineSignalsSandboxFailure(line: string): boolean {
  return SANDBOX_PATTERNS.some((re) => re.test(line));
}

export function describeLimitReason(reason: LimitReason): string {
  if (reason === "quota") return "rate limit / quota reached";
  if (reason === "overload") return "upstream service overloaded (not your quota)";
  if (reason === "sandbox") return "the CLI's sandbox failed to start — every command it ran was blocked before executing (see the harness output above)";
  return "unknown";
}
