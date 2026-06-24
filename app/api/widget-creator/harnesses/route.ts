import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { HARNESS_ADAPTERS, type HarnessId } from "@/lib/widget-creator/harnessAdapters";

const availabilityCache: Map<HarnessId, boolean> = new Map();

// Spawn the real binary rather than shelling out to which/where — `which`
// doesn't exist on Windows at all, and even on Unix it bypasses the same
// shim-resolution the actual generate spawn needs (see generate/route.ts:
// Windows CLIs are .cmd/.ps1 shims that bare spawn can't resolve without
// shell:true). We only care whether the binary could be started at all
// (ENOENT => not installed) — not its exit code or whether it recognizes
// --version, so any CLI quirk there can't produce a false negative.
function checkAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.on("error", () => resolve(false));
    child.on("spawn", () => {
      resolve(true);
      child.kill();
    });
  });
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
