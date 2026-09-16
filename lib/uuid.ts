/**
 * `crypto.randomUUID()` is a secure-context-only API — the hub is served over
 * plain HTTP (192.168.1.24 / *.avns.nut, no TLS), so browsers leave it
 * undefined and calling it throws. `crypto.getRandomValues()` has no such
 * restriction, so build the v4 UUID from it and only fall back to Math.random
 * on the truly ancient/exotic case where even that is missing.
 *
 * Output always matches `^[a-z0-9-]+$`, which is what isValidIdeateSessionId
 * (via isValidSlug) requires of Ideate session ids.
 */
export function randomId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;

  if (typeof c?.randomUUID === "function") return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10x

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
