import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type UsageWindow = {
  percentUsed: number;
  resetsAt: string | null;
  resetsLabel: string | null;
};

type ClaudeUsageResponse = {
  available: boolean;
  session: UsageWindow | null;
  week: UsageWindow | null;
  fetchedAt: string;
  error?: string;
};

// The claude CLI prints reset times like "Sep 23, 6:29pm (UTC)" with no year.
// Assume the current UTC year, rolling to next year if that would land more
// than a day in the past (handles the Dec -> Jan boundary).
function parseResetTime(raw: string | undefined): { iso: string | null; label: string | null } {
  if (!raw) return { iso: null, label: null };
  const label = raw.trim();
  const match = label.match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*([ap]m)/i);
  if (!match) return { iso: null, label };
  const [, monStr, dayStr, hourStr, minStr, ampm] = match;
  const monthIndex = MONTHS.findIndex((m) => m.toLowerCase() === monStr.slice(0, 3).toLowerCase());
  if (monthIndex === -1) return { iso: null, label };

  let hour = parseInt(hourStr, 10) % 12;
  if (ampm.toLowerCase() === "pm") hour += 12;
  const day = parseInt(dayStr, 10);
  const minute = parseInt(minStr, 10);

  const now = new Date();
  const year = now.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  if (candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    candidate = new Date(Date.UTC(year + 1, monthIndex, day, hour, minute));
  }
  return { iso: candidate.toISOString(), label };
}

function parseWindow(text: string, pattern: RegExp): UsageWindow | null {
  const match = text.match(pattern);
  if (!match) return null;
  const percentUsed = parseInt(match[1], 10);
  const { iso, label } = parseResetTime(match[2]);
  return { percentUsed, resetsAt: iso, resetsLabel: label };
}

export async function GET() {
  try {
    const { stdout } = await execFileAsync("claude", ["-p", "/usage", "--output-format", "json"], {
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });

    const parsed = JSON.parse(stdout) as { result?: unknown };
    const text = typeof parsed.result === "string" ? parsed.result : "";

    const session = parseWindow(text, /Current session:\s*(\d+)%\s*used(?:.*?resets\s+(.+))?$/m);
    const week = parseWindow(text, /Current week[^:\n]*:\s*(\d+)%\s*used(?:.*?resets\s+(.+))?$/m);

    if (!session && !week) {
      const body: ClaudeUsageResponse = {
        available: false,
        session: null,
        week: null,
        fetchedAt: new Date().toISOString(),
        error: "Could not parse claude usage output",
      };
      return NextResponse.json(body);
    }

    const body: ClaudeUsageResponse = {
      available: true,
      session,
      week,
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(body);
  } catch (err) {
    const body: ClaudeUsageResponse = {
      available: false,
      session: null,
      week: null,
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : "claude CLI unavailable",
    };
    return NextResponse.json(body);
  }
}
