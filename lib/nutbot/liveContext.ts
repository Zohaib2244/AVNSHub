// A compact, read-only snapshot of the box NutBot lives on — host stats, docker
// containers, Uptime Kuma, and recent trouble — so chat can talk about (and
// roast) what is actually happening instead of guessing. Built server-side per
// chat turn and cached briefly so a burst of messages doesn't fan out into a
// burst of docker/systeminformation calls. Every source fails soft: a missing
// docker socket or Kuma just drops that section.

import { execFile } from "child_process";
import { promisify } from "util";
import { getSystemStats } from "@/lib/systemStats";
import { containerName, listContainers, type DockerContainer } from "@/lib/nutbot/dockerSocket";
import { recentProblemLines } from "@/lib/nutbot/serviceLog";
import { readUptimeKuma, type KumaService } from "@/lib/uptimeKuma";

const run = promisify(execFile);
const CACHE_MS = 20_000;
let cache: { at: number; text: string } | null = null;

/**
 * Whether a chat turn explicitly asks for information that lives on the host.
 * Keep this intentionally conservative: a vague "what's up?" should be
 * ordinary banter, while "what's up with the server?" can retrieve a fresh
 * snapshot. This is the retrieval gate for Chill mode; Work mode uses its
 * shell instead.
 */
export function shouldAttachLiveContext(message: string): boolean {
  const text = message.toLowerCase();
  // An explicit host reference is enough. Other words need a local-status
  // shape around them: "tell me a memory trick" must not fetch RAM stats.
  if (/\b(?:server|host|homelab|home\s*lab|nas)\b/.test(text)) return true;
  if (/\b(?:uptime\s*kuma|journalctl|systemd)\b/.test(text)) return true;

  const localThing = "(?:docker(?:\\s+containers?)?|containers?|compose|podman|kubernetes|k8s|cpu|ram|memory|disk|storage|drives?|mounts?|filesystem|load(?:\\s+average)?|network|lan|ports?|process(?:es)?|services?|logs?|uptime)";
  return new RegExp(
    `\\b(?:my|the|this|our)\\s+${localThing}\\b|` +
      `\\b(?:check|show|list|inspect|monitor|diagnose|status|health|running|down|restart(?:ing)?|failed|broken|full|slow)\\b[^.?!]{0,45}\\b${localThing}\\b|` +
      `\\b${localThing}\\b[^.?!]{0,45}\\b(?:status|health|running|down|restart(?:ing)?|failed|broken|full|slow)\\b`,
  ).test(text);
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(0)}G`;

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return d ? `${d}d ${h}h` : `${h}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** last few log lines of one container, via the docker CLI (the socket API
    multiplexes stdout/stderr in a binary framing that isn't worth parsing here) */
async function tailLogs(name: string): Promise<string> {
  try {
    const { stdout, stderr } = await run("docker", ["logs", "--tail", "4", name], { timeout: 3000, maxBuffer: 256 * 1024 });
    return `${stdout}${stderr}`.trim().split("\n").slice(-4).map((line) => line.replace(/\x1b\[[0-9;]*m/g, "").trim().slice(0, 110)).join(" | ");
  } catch {
    return "";
  }
}

async function hostSection(): Promise<string[]> {
  try {
    const s = await getSystemStats();
    const lines = [
      `host: up ${formatUptime(s.uptime_seconds)}, cpu ${s.cpu.used_pct.toFixed(0)}% (load ${s.cpu.load_avg.map((n) => n.toFixed(2)).join(" ")}), ram ${s.memory.used_pct.toFixed(0)}% of ${gb(s.memory.total_bytes)}`,
      ...s.drives.filter((d) => d.total_bytes > 2 * 1024 ** 3).map((d) => `disk ${d.mount}: ${d.used_pct.toFixed(0)}% used (${gb(d.used_bytes)}/${gb(d.total_bytes)})`),
    ];
    if (s.missing_mounts?.length) lines.push(`MISSING MOUNTS (drive dropped off): ${s.missing_mounts.join(", ")}`);
    return lines;
  } catch {
    return [];
  }
}

async function dockerSection(): Promise<string[]> {
  let containers: DockerContainer[];
  try {
    containers = await listContainers(true);
  } catch {
    return [];
  }
  const running = containers.filter((c) => c.State === "running");
  const bad = containers.filter((c) => c.State !== "running" || /unhealthy|restarting/i.test(c.Status));
  const lines = [`containers: ${running.length}/${containers.length} running`];
  for (const c of bad.slice(0, 5)) {
    const name = containerName(c);
    const tail = await tailLogs(name);
    lines.push(`PROBLEM ${name}: ${c.Status}${tail ? ` — last logs: ${tail}` : ""}`);
  }
  return lines;
}

async function kumaSection(): Promise<string[]> {
  try {
    const kuma = await readUptimeKuma();
    if (!kuma) return [];
    const down = (kuma.services as KumaService[]).filter((s) => s.status !== "up");
    return down.length
      ? down.map((s) => `kuma DOWN ${s.name}${s.message ? `: ${s.message}` : ""}`)
      : [`kuma: all ${kuma.services.length} monitors up`];
  } catch {
    return [];
  }
}

function logSection(): string[] {
  return recentProblemLines(6).map((l) => `recent ${l.level} [${l.service}]: ${l.text.slice(0, 160)}`);
}

/** the snapshot as plain text, or "" when nothing could be read */
export async function buildLiveContext(): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.text;
  const sections = await Promise.all([hostSection(), dockerSection(), kumaSection()]);
  const text = [...sections.flat(), ...logSection()].join("\n");
  cache = { at: Date.now(), text };
  return text;
}

/** wrapped for a prompt: says what it is and how to use it */
export async function liveContextBlock(): Promise<string> {
  const text = await buildLiveContext();
  if (!text) return "";
  return `Private, read-only live snapshot of the server the user asked about. It is current for this server question only. Answer that question accurately, but do not repeat or volunteer these facts in later unrelated conversation. Never invent stats that aren't here.
${text}`;
}
