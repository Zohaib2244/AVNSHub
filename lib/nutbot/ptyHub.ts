// Server-side PTY session manager for NutBot's integrated terminal.
//
// Each "shell" tab in the NutBot terminal is a real pseudo-terminal on the
// machine the Next.js server runs on, spawned via node-pty. Output is streamed
// to the browser over Server-Sent Events and input/resize/kill arrive as POSTs
// (see app/api/nutbot-shell/route.ts) — this keeps the shell *inside* the Next
// app, so no separate websocket process is needed (the old dev-only
// scripts/nutbot-shell-server.mjs path). Works on Windows / macOS / Linux
// because node-pty picks the right backend (ConPTY / forkpty) per platform.
//
// SECURITY: anyone who can reach the AVN Hub web UI can run commands on the host
// as the server's user. That is acceptable for AVN Hub's single-user,
// self-hosted, full-trust model (served privately over Tailscale), and is the
// explicit intent of this feature. Set NUTBOT_SHELL_DISABLED=true to turn the
// shell route off entirely (e.g. if you ever expose the hub more widely).

import * as pty from "node-pty";
import { randomUUID } from "crypto";

export type PtySession = {
  pty: pty.IPty;
  /** ring buffer of recent output, replayed when a browser (re)connects so a
      tab switch / reconnect doesn't lose the visible scrollback */
  buffer: string[];
  bufferChars: number;
  subscribers: Set<(chunk: string) => void>;
  exited: boolean;
  orphanTimer: ReturnType<typeof setTimeout> | null;
};

// Survive Turbopack/HMR module reloads in dev so live sessions aren't orphaned
// on every file edit.
const globalForPty = globalThis as unknown as { __nutbotPtySessions?: Map<string, PtySession> };
const sessions: Map<string, PtySession> = globalForPty.__nutbotPtySessions ?? new Map();
globalForPty.__nutbotPtySessions = sessions;

// Dev HMR may preserve sessions created by an older module shape.
for (const session of sessions.values()) {
  if (typeof session.bufferChars !== "number") {
    session.bufferChars = session.buffer.reduce((sum, chunk) => sum + chunk.length, 0);
  }
  session.orphanTimer ??= null;
}

// A chunk-count cap alone is not a memory bound because one terminal write can
// be arbitrarily large. Keep at most about 1 MB of reconnect scrollback.
const MAX_BUFFER_CHUNKS = 1000;
const MAX_BUFFER_CHARS = 1_000_000;
const ORPHAN_TTL_MS = 5 * 60_000;

function clearOrphanTimer(session: PtySession) {
  if (session.orphanTimer) clearTimeout(session.orphanTimer);
  session.orphanTimer = null;
}

function scheduleOrphanCleanup(id: string, session: PtySession) {
  clearOrphanTimer(session);
  if (session.exited || session.subscribers.size > 0) return;
  session.orphanTimer = setTimeout(() => {
    const current = sessions.get(id);
    if (current !== session || current.subscribers.size > 0) return;
    killSession(id);
  }, ORPHAN_TTL_MS);
}

function appendToBuffer(session: PtySession, chunk: string) {
  const storedChunk = chunk.length > MAX_BUFFER_CHARS ? chunk.slice(-MAX_BUFFER_CHARS) : chunk;
  session.buffer.push(storedChunk);
  session.bufferChars += storedChunk.length;
  while (
    session.buffer.length > 1 &&
    (session.buffer.length > MAX_BUFFER_CHUNKS || session.bufferChars > MAX_BUFFER_CHARS)
  ) {
    session.bufferChars -= session.buffer.shift()?.length ?? 0;
  }
}

export function shellDisabled(): boolean {
  return process.env.NUTBOT_SHELL_DISABLED === "true";
}

/** Pick a sensible default interactive shell for the host platform. */
function defaultShell(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    // PowerShell if present, else cmd.exe. (node-pty drives both via ConPTY.)
    const comspec = process.env.COMSPEC;
    if (comspec && /cmd\.exe$/i.test(comspec)) return { file: comspec, args: [] };
    return { file: "powershell.exe", args: ["-NoLogo"] };
  }
  // macOS / Linux: honour $SHELL, fall back to bash then sh.
  return { file: process.env.SHELL || "/bin/bash", args: [] };
}

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd();
}

export function createSession(): string {
  const { file, args } = defaultShell();
  const term = pty.spawn(file, args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: homeDir(),
    env: process.env as Record<string, string>,
  });

  const id = randomUUID();
  const session: PtySession = {
    pty: term,
    buffer: [],
    bufferChars: 0,
    subscribers: new Set(),
    exited: false,
    orphanTimer: null,
  };

  term.onData((chunk) => {
    appendToBuffer(session, chunk);
    for (const fn of session.subscribers) {
      try { fn(chunk); } catch { /* a dead subscriber must not break the others */ }
    }
  });

  term.onExit(() => {
    session.exited = true;
    clearOrphanTimer(session);
    const bye = "\r\n\x1b[90m[process exited]\x1b[0m\r\n";
    for (const fn of session.subscribers) {
      try { fn(bye); } catch {}
    }
    // keep the session briefly so the exit notice can flush, then drop it
    setTimeout(() => sessions.delete(id), 1000);
  });

  sessions.set(id, session);
  // Reap sessions whose client disappears between create and SSE connect.
  scheduleOrphanCleanup(id, session);
  return id;
}

export function getSession(id: string): PtySession | undefined {
  return sessions.get(id);
}

export function writeSession(id: string, data: string): boolean {
  const session = sessions.get(id);
  if (!session || session.exited) return false;
  session.pty.write(data);
  return true;
}

export function subscribeSession(id: string, listener: (chunk: string) => void): () => void {
  const session = sessions.get(id);
  if (!session || session.exited) return () => {};
  clearOrphanTimer(session);
  session.subscribers.add(listener);
  return () => {
    const current = sessions.get(id);
    if (current !== session) return;
    session.subscribers.delete(listener);
    scheduleOrphanCleanup(id, session);
  };
}

export function resizeSession(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session || session.exited) return;
  if (cols > 0 && rows > 0) {
    try { session.pty.resize(cols, rows); } catch { /* terminal may have just exited */ }
  }
}

export function killSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  clearOrphanTimer(session);
  try { session.pty.kill(); } catch {}
  sessions.delete(id);
}
