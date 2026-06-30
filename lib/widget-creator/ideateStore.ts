// Shared path/validation helpers for Ideate-mode scratch mockups, used by
// both the generation route and the file-serving route. Kept out of the
// route files themselves — Next.js route handlers may only export the
// recognized HTTP-verb functions plus a small allowlist of config fields.
import { join } from "path";
import { isValidSlug } from "@/lib/widget-creator/slug";

const REPO_ROOT = process.cwd();
export const IDEATE_ROOT = join(REPO_ROOT, ".nutbot-ideate");

export const VARIATION_FILE_RE = /^variation-([1-9][0-9]*)\.html$/;

export function variationFile(index: number): string {
  return `variation-${index}.html`;
}

export function isValidIdeateSessionId(id: unknown): id is string {
  // crypto.randomUUID() output (lowercase hex + hyphens) already matches this
  return typeof id === "string" && id.length > 0 && id.length <= 64 && isValidSlug(id);
}

export function sessionDirFor(sessionId: string): string {
  return join(IDEATE_ROOT, sessionId);
}
