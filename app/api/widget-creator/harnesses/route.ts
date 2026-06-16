import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";

const execFileAsync = promisify(execFile);

const availabilityCache: Map<HarnessId, boolean> = new Map();

async function checkAvailable(command: string): Promise<boolean> {
  try {
    await execFileAsync("which", [command]);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const results = await Promise.all(
    Object.values(HARNESS_ADAPTERS).map(async (adapter) => {
      if (!availabilityCache.has(adapter.id)) {
        availabilityCache.set(adapter.id, await checkAvailable(adapter.command));
      }
      return { id: adapter.id, label: adapter.label, available: availabilityCache.get(adapter.id)! };
    }),
  );

  return NextResponse.json(results);
}
