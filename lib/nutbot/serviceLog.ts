// Shared, process-wide collector behind NutBot's realtime log feed.
//
// One collector serves every browser tab: opening the widget in three tabs must
// not open three Docker event streams. Subscribers reference-count the two
// sources independently, so the (expensive) stdout followers only exist while
// somebody actually has that toggle on.
//
// Two sources, both generic over every container — nothing is registered per
// service, so a container deployed tomorrow shows up with no code change:
//   lifecycle — Docker's own event stream: start/die/restart/health_status
//   stdout    — each running container's stdout+stderr, followed from `now`
//
// Cadence note: unlike the demo ticker this replaces, real events are bursty
// and then silent for hours. Two consequences are handled here: the buffer is
// replayed to each new subscriber (so the widget never opens empty), and
// identical repeats collapse into a count instead of flooding the feed — a
// crash-looping container would otherwise bury everything else.

import {
  containerName,
  dockerAvailable,
  listContainers,
  streamContainerLogs,
  streamEvents,
  type DockerEvent,
} from "@/lib/nutbot/dockerSocket";

export type LogLevel = "ok" | "info" | "warn" | "err" | "log";
export type LogSource = "lifecycle" | "stdout";

export type ServiceLogLine = {
  id: number;
  at: number;
  level: LogLevel;
  service: string;
  text: string;
  source: LogSource;
  repeat: number;
};

export type LogEvent =
  | { type: "line"; line: ServiceLogLine }
  | { type: "repeat"; id: number; repeat: number; at: number }
  | { type: "status"; connected: boolean; detail: string };

const BUFFER_LIMIT = 250;
/** identical (service, source, text) inside this window bumps a counter */
const REPEAT_WINDOW_MS = 60_000;
/** per-container stdout ceiling — a chatty service must not starve the feed */
const STDOUT_TOKENS_PER_SEC = 2;
const STDOUT_BURST = 8;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

type Subscriber = {
  sources: Set<LogSource>;
  send: (event: LogEvent) => void;
};

const subscribers = new Set<Subscriber>();
const buffer: ServiceLogLine[] = [];
let nextId = 1;

let lifecycleAbort: AbortController | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectDelay = RECONNECT_MIN_MS;
let connected = false;
let statusDetail = "idle";

/** container id -> abort handle for its stdout follower */
const stdoutStreams = new Map<string, AbortController>();
const stdoutBudget = new Map<string, { tokens: number; last: number; dropped: number }>();
let stdoutWanted = false;

function refCount(source: LogSource): number {
  let n = 0;
  for (const sub of subscribers) if (sub.sources.has(source)) n += 1;
  return n;
}

function broadcast(event: LogEvent, source?: LogSource) {
  for (const sub of subscribers) {
    if (source && !sub.sources.has(source)) continue;
    try {
      sub.send(event);
    } catch {
      // a dead SSE writer is cleaned up by its own abort handler
    }
  }
}

function setStatus(next: boolean, detail: string) {
  connected = next;
  statusDetail = detail;
  broadcast({ type: "status", connected, detail });
}

function push(level: LogLevel, service: string, text: string, source: LogSource) {
  const now = Date.now();

  // Collapse an identical repeat rather than appending. Scanning only the tail
  // keeps this O(1)-ish: a repeat that isn't recent isn't a repeat worth
  // collapsing, it is a genuinely new occurrence.
  for (let i = buffer.length - 1; i >= Math.max(0, buffer.length - 6); i -= 1) {
    const line = buffer[i];
    if (line.source !== source || line.service !== service || line.text !== text) continue;
    if (now - line.at > REPEAT_WINDOW_MS) break;
    line.repeat += 1;
    line.at = now;
    broadcast({ type: "repeat", id: line.id, repeat: line.repeat, at: now }, source);
    return;
  }

  const line: ServiceLogLine = { id: nextId++, at: now, level, service, text, source, repeat: 1 };
  buffer.push(line);
  if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);
  broadcast({ type: "line", line }, source);
}

// ─── lifecycle ────────────────────────────────────────────────────────────

function levelForAction(action: string): LogLevel {
  if (action === "die" || action === "oom") return "err";
  if (action === "kill" || action === "stop" || action === "health_status: unhealthy") return "warn";
  if (action === "start" || action === "health_status: healthy" || action === "unpause") return "ok";
  return "info";
}

function describeAction(event: DockerEvent): string | null {
  const action = event.Action ?? "";
  const attrs = event.Actor?.Attributes ?? {};

  if (action.startsWith("health_status")) {
    const state = action.split(":")[1]?.trim() || "unknown";
    return `health: ${state}`;
  }
  switch (action) {
    case "start":
      return "started";
    case "die": {
      const code = attrs.exitCode;
      return code && code !== "0" ? `died (exit ${code})` : "stopped";
    }
    case "restart":
      return "restarted";
    case "kill":
      return "killed";
    case "oom":
      return "out of memory";
    case "pause":
      return "paused";
    case "unpause":
      return "unpaused";
    case "destroy":
      return "removed";
    case "create":
      return "created";
    default:
      // create/attach/exec_* and friends are noise for a status feed
      return null;
  }
}

function handleEvent(event: DockerEvent) {
  const description = describeAction(event);
  if (!description) return;
  const service = event.Actor?.Attributes?.name ?? event.id?.slice(0, 12) ?? "unknown";
  push(levelForAction(event.Action ?? ""), service, description, "lifecycle");

  // keep stdout followers in step with the world as containers come and go
  if (stdoutWanted) {
    const id = event.Actor?.ID ?? event.id;
    if (!id) return;
    if (event.Action === "start") void followContainer(id, service);
    else if (event.Action === "die" || event.Action === "destroy") stopFollowing(id);
  }
}

async function connectLifecycle() {
  if (lifecycleAbort) return;
  const abort = new AbortController();
  lifecycleAbort = abort;

  try {
    if (!(await dockerAvailable())) {
      throw new Error("docker socket unreachable — is this user in the `docker` group?");
    }
    await seedSnapshot();
    setStatus(true, "connected");
    reconnectDelay = RECONNECT_MIN_MS;
    await streamEvents(abort.signal, handleEvent);
    // a clean end means the daemon closed the stream; treat it as a drop
    throw new Error("event stream ended");
  } catch (error) {
    if (abort.signal.aborted) return;
    const detail = error instanceof Error ? error.message : "unknown error";
    setStatus(false, detail);
    scheduleReconnect();
  } finally {
    if (lifecycleAbort === abort) lifecycleAbort = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || subscribers.size === 0) return;
  // Exponential backoff: a docker daemon restart or a socket permission problem
  // must not turn into a hot retry loop for as long as the widget stays open.
  const delay = reconnectDelay;
  reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (subscribers.size > 0) void connectLifecycle();
  }, delay);
}

/** One line per notable container, so a freshly opened widget shows the world
    as it stands rather than waiting for something to happen. */
/** a reopened widget re-connects, and re-seeding on top of a snapshot that is
    still on screen just prints the world twice */
const SEED_COOLDOWN_MS = 30_000;
let lastSeedAt = 0;

async function seedSnapshot() {
  if (Date.now() - lastSeedAt < SEED_COOLDOWN_MS) return;
  lastSeedAt = Date.now();
  const containers = await listContainers(true);
  const running = containers.filter((c) => c.State === "running");
  const unhealthy = running.filter((c) => /unhealthy/i.test(c.Status));
  const restarting = containers.filter((c) => c.State === "restarting");
  const stopped = containers.filter((c) => c.State === "exited" || c.State === "dead");

  push("info", "docker", `${running.length} containers running`, "lifecycle");
  for (const c of restarting) {
    // "Restarting (1) 15 seconds ago" -> "restarting (exit 1)". The raw Status
    // carries a humanised relative time that changes every read, which would
    // defeat repeat collapsing and give a crash-looping container a fresh line
    // on every reconnect.
    const code = /\((\d+)\)/.exec(c.Status ?? "")?.[1];
    push("err", containerName(c), code ? `restarting (exit ${code})` : "restarting", "lifecycle");
  }
  for (const c of unhealthy) push("warn", containerName(c), "health: unhealthy", "lifecycle");
  if (stopped.length > 0) {
    const names = stopped.map(containerName).sort().join(", ");
    push("warn", "docker", `${stopped.length} stopped: ${names}`, "lifecycle");
  }
}

// ─── stdout ───────────────────────────────────────────────────────────────

function allowStdoutLine(id: string): boolean {
  const now = Date.now();
  const budget = stdoutBudget.get(id) ?? { tokens: STDOUT_BURST, last: now, dropped: 0 };
  budget.tokens = Math.min(
    STDOUT_BURST,
    budget.tokens + ((now - budget.last) / 1000) * STDOUT_TOKENS_PER_SEC,
  );
  budget.last = now;
  stdoutBudget.set(id, budget);
  if (budget.tokens >= 1) {
    budget.tokens -= 1;
    return true;
  }
  budget.dropped += 1;
  return false;
}

async function followContainer(id: string, name: string) {
  if (stdoutStreams.has(id)) return;
  const abort = new AbortController();
  stdoutStreams.set(id, abort);
  try {
    await streamContainerLogs(id, abort.signal, (line, stderr) => {
      if (!allowStdoutLine(id)) return;
      // stdout is already voluminous; one long line must not blow out the feed
      const text = line.length > 300 ? `${line.slice(0, 300)}…` : line;
      push(stderr ? "warn" : "log", name, text, "stdout");
    });
  } catch {
    // container stopped, or the daemon closed the follow — lifecycle events
    // will re-open it if it comes back
  } finally {
    if (stdoutStreams.get(id) === abort) stdoutStreams.delete(id);
  }
}

function stopFollowing(id: string) {
  stdoutStreams.get(id)?.abort();
  stdoutStreams.delete(id);
  stdoutBudget.delete(id);
}

async function startStdout() {
  if (stdoutWanted) return;
  stdoutWanted = true;
  try {
    const containers = await listContainers(false);
    for (const c of containers) void followContainer(c.Id, containerName(c));
  } catch {
    // lifecycle status already reports an unreachable socket
  }
}

function stopStdout() {
  stdoutWanted = false;
  for (const id of [...stdoutStreams.keys()]) stopFollowing(id);
}

// ─── subscription ─────────────────────────────────────────────────────────

export function subscribe(sources: LogSource[], send: (event: LogEvent) => void): () => void {
  const sub: Subscriber = { sources: new Set(sources), send };
  subscribers.add(sub);

  // Replay what we already have, filtered to what this subscriber asked for,
  // so the feed opens populated instead of blank.
  for (const line of buffer) {
    if (sub.sources.has(line.source)) send({ type: "line", line });
  }
  const connecting = sub.sources.has("lifecycle") && !connected;
  send({ type: "status", connected, detail: connecting ? "connecting" : statusDetail });

  if (sub.sources.has("lifecycle")) void connectLifecycle();
  if (sub.sources.has("stdout")) void startStdout();

  return () => {
    subscribers.delete(sub);
    if (refCount("stdout") === 0) stopStdout();
    if (subscribers.size === 0) {
      // nobody is watching: drop the event stream and any pending retry
      lifecycleAbort?.abort();
      lifecycleAbort = null;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectDelay = RECONNECT_MIN_MS;
      connected = false;
      statusDetail = "idle";
    }
  };
}
