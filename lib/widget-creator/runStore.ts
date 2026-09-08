import { prisma } from "@/lib/db";
import { DEFAULT_MODELS, sanitizeModelDefaults } from "./models";
import type { UsageRun } from "./usage";

export async function readModelDefaults() {
  try {
    const row = await prisma.kV.findUnique({ where: { key: "nutmag-prefs" } });
    return row ? sanitizeModelDefaults(JSON.parse(row.value).modelDefaults) : DEFAULT_MODELS;
  } catch (cause) { throw new Error("Could not load saved model defaults. Retry when the settings store is available.", { cause }); }
}

export async function saveUsage(run: UsageRun) {
  try {
    await prisma.kV.upsert({ where: { key: `nutbot-usage:${run.id}` }, create: { key: `nutbot-usage:${run.id}`, value: JSON.stringify(run) }, update: { value: JSON.stringify(run) } });
    const old = await prisma.kV.findMany({ where: { key: { startsWith: "nutbot-usage:" } }, orderBy: { updatedAt: "desc" }, skip: 200, select: { key: true } });
    if (old.length) await prisma.kV.deleteMany({ where: { key: { in: old.map((r) => r.key) } } });
  } catch (error) { console.error("Could not persist NutBot usage", error); }
}

export async function resolveSession(id: string | null | undefined, harness: string, model: string) {
  if (!id) return undefined;
  try {
    const row = await prisma.kV.findUnique({ where: { key: `nutbot-session:${id}` } });
    const saved = row ? JSON.parse(row.value) : null;
    return saved?.harness === harness && saved?.model === model ? id : undefined;
  } catch { return undefined; }
}
export async function saveSession(id: string, harness: string, model: string) {
  try {
    await prisma.kV.upsert({ where: { key: `nutbot-session:${id}` }, create: { key: `nutbot-session:${id}`, value: JSON.stringify({ harness, model }) }, update: { value: JSON.stringify({ harness, model }) } });
  } catch (error) { console.error("Could not persist NutBot session binding", error); }
}
