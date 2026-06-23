// Isomorphic slug helpers shared between the creator UI (client) and the
// generate route (server) — keep in sync with the `^[a-z0-9-]+$` check in
// lib/widget-creator/customRegistry.ts's isValidCustomWidgetId.

export function slugify(input: string): string {
  return input.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function isValidSlug(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}
