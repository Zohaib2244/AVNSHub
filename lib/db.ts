// Server-only Prisma client singleton — backs the shared-hub KV store so the
// same canvases/theme/layout/prefs/etc. are visible from every browser/device
// instead of being trapped in one browser's localStorage. Never import this
// from a client component.

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/hub.db",
  });
  return new PrismaClient({ adapter });
}

// Reuse the client across Next.js dev-server hot reloads so we don't open a
// new SQLite connection (and file handle) on every edit.
export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
