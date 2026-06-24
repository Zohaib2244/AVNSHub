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
  subscribers: Set<(chunk: string) => void>;
  exited: boolean;
};

// Survive Turbopack/HMR module reloads in dev so live sessions aren't orphaned
// on every file edit.
const globalForPty = globalThis as unknown as { __nutbotPtySessions?: Map<string, PtySession> };
const sessions: Map<string, PtySession> = globalForPty.__nutbotPtySessions ?? new Map();
globalForPty.__nutbotPtySessions = sessions;

const MAX_BUFFER_CHUNKS = 2000;

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
  const session: PtySession = { pty: term, buffer: [], subscribers: new Set(), exited: false };

  term.onData((chunk) => {
    session.buffer.push(chunk);
    if (session.buffer.length > MAX_BUFFER_CHUNKS) session.buffer.shift();
    for (const fn of session.subscribers) {
      try { fn(chunk); } catch { /* a dead subscriber must not break the others */ }
    }
  });

  term.onExit(() => {
    session.exited = true;
    const bye = "\r\n\x1b[90m[process exited]\x1b[0m\r\n";
    for (const fn of session.subscribers) {
      try { fn(bye); } catch {}
    }
    // keep the session briefly so the exit notice can flush, then drop it
    setTimeout(() => sessions.delete(id), 1000);
  });

  sessions.set(id, session);
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
  try { session.pty.kill(); } catch {}
  sessions.delete(id);
}
