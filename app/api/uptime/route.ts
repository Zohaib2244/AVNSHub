// Uptime for the About card. Reports two different numbers:
//   sessionSeconds — this Node process, resets on every restart (process.uptime)
//   totalSeconds   — cumulative across every restart since the hub first ran
//
// There is no OS-level record of "how long has this app run in total", so the
// total is accumulated in the KV store. Each poll folds the live session into
// the stored figure; when a *new* process is seen (a different bootId), the
// previous session's last-known length is banked first. The cost of that design
// is that a crash loses at most one poll interval of credit — deliberate, since
// the alternative (writing on a timer of our own) means a DB write every few
// seconds forever for a number nobody is watching that closely.
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const KV_KEY = "nutmag-uptime-total";
// Identifies THIS process. A restart produces a new one, which is how a fresh
// session is detected without relying on wall-clock comparisons.
const BOOT_ID = randomUUID();
// Polls arrive per client per minute; with several tabs open that is more
// writes than this number deserves. Reads stay live, writes are throttled.
const WRITE_INTERVAL_MS = 30_000;
let lastWriteAt = 0;

type Stored = { accumulated: number; bootId: string; sessionSeconds: number };

function parse(value: unknown): Stored | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.accumulated !== "number" || !Number.isFinite(v.accumulated)) return null;
  return {
    accumulated: Math.max(0, v.accumulated),
    bootId: typeof v.bootId === "string" ? v.bootId : "",
    sessionSeconds: typeof v.sessionSeconds === "number" && Number.isFinite(v.sessionSeconds)
      ? Math.max(0, v.sessionSeconds)
      : 0,
  };
}

export async function GET() {
  const sessionSeconds = process.uptime();

  let accumulated = 0;
  try {
    const row = await prisma.kV.findUnique({ where: { key: KV_KEY } });
    const stored = row ? parse(JSON.parse(row.value)) : null;
    if (stored) {
      // A different bootId means the process that wrote this has since exited,
      // so bank whatever it had last reported before starting our own tally.
      accumulated = stored.bootId === BOOT_ID
        ? stored.accumulated
        : stored.accumulated + stored.sessionSeconds;
    }

    const now = Date.now();
    if (now - lastWriteAt >= WRITE_INTERVAL_MS) {
      lastWriteAt = now;
      const value = JSON.stringify({ accumulated, bootId: BOOT_ID, sessionSeconds } satisfies Stored);
      await prisma.kV.upsert({
        where: { key: KV_KEY },
        create: { key: KV_KEY, value },
        update: { value },
      });
    }
  } catch {
    // The card degrades to session-only rather than erroring; a missing total
    // is a far better outcome than a broken About widget.
    return NextResponse.json({ uptimeSeconds: sessionSeconds, sessionSeconds, totalSeconds: null });
  }

  return NextResponse.json({
    // `uptimeSeconds` is retained for the pre-existing callers of this route.
    uptimeSeconds: sessionSeconds,
    sessionSeconds,
    totalSeconds: accumulated + sessionSeconds,
  });
}
