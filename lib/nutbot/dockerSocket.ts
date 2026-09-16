// Minimal Docker Engine API client over the local unix socket.
//
// Deliberately no `dockerode`: everything the service log needs is three GETs
// and two long-lived streams, and a dependency that ships its own HTTP stack
// would be far more surface than that is worth. Node's http module speaks to a
// unix socket directly via `socketPath`.
//
// Access model: AVN Hub runs as a host systemd service (see deploy/), as the
// user that owns the hub. That user must be in the `docker` group for any of
// this to work; when it isn't, every call here fails cleanly and the caller
// degrades to the demo feed rather than erroring.

import http from "http";
import type { Readable } from "stream";

export const DOCKER_SOCKET = process.env.DOCKER_SOCKET || "/var/run/docker.sock";

export type DockerContainer = {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Labels?: Record<string, string>;
};

/** "/jellyfin" -> "jellyfin"; Docker always prefixes the leading slash */
export function containerName(c: { Names?: string[] }): string {
  const raw = c.Names?.[0] ?? "";
  return raw.startsWith("/") ? raw.slice(1) : raw || "unknown";
}

function request(path: string, signal?: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: DOCKER_SOCKET, path, method: "GET" }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`docker ${path} -> ${res.statusCode}`));
        return;
      }
      resolve(res);
    });
    req.on("error", reject);
    if (signal) {
      if (signal.aborted) {
        req.destroy();
        reject(new Error("aborted"));
        return;
      }
      signal.addEventListener("abort", () => req.destroy(), { once: true });
    }
    req.end();
  });
}

async function getJson<T>(path: string): Promise<T> {
  const res = await request(path);
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

/** true when the socket is present AND this process may actually talk to it */
export async function dockerAvailable(): Promise<boolean> {
  try {
    await getJson<{ Version: string }>("/version");
    return true;
  } catch {
    return false;
  }
}

export function listContainers(all = true): Promise<DockerContainer[]> {
  return getJson<DockerContainer[]>(`/containers/json?all=${all ? 1 : 0}`);
}

export type DockerEvent = {
  Type?: string;
  Action?: string;
  Actor?: { ID?: string; Attributes?: Record<string, string> };
  time?: number;
  status?: string;
  id?: string;
};

/** Long-lived container event stream. Docker writes one JSON object per line. */
export async function streamEvents(
  signal: AbortSignal,
  onEvent: (event: DockerEvent) => void,
): Promise<void> {
  const filters = encodeURIComponent(JSON.stringify({ type: ["container"] }));
  const res = await request(`/events?filters=${filters}`, signal);
  await consumeLines(res, (line) => {
    try {
      onEvent(JSON.parse(line) as DockerEvent);
    } catch {
      // a partial/garbled frame is not worth tearing the stream down for
    }
  });
}

/**
 * Follow one container's stdout+stderr from now on (`tail=0` — no backlog).
 *
 * Docker multiplexes both streams over one connection when the container has
 * no TTY, framing each chunk with an 8-byte header: [stream, 0,0,0, len32be].
 * With a TTY the bytes are raw. `demux` handles both by sniffing the header,
 * since which one applies is a per-container setting we would otherwise have
 * to inspect separately.
 */
export async function streamContainerLogs(
  id: string,
  signal: AbortSignal,
  onLine: (line: string, stderr: boolean) => void,
): Promise<void> {
  const res = await request(
    `/containers/${id}/logs?follow=1&stdout=1&stderr=1&tail=0&timestamps=0`,
    signal,
  );
  await demux(res, onLine);
}

async function consumeLines(stream: Readable, onLine: (line: string) => void): Promise<void> {
  let buffer = "";
  for await (const chunk of stream) {
    buffer += (chunk as Buffer).toString("utf8");
    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) onLine(line);
    }
    // A single pathological line must not grow without bound
    if (buffer.length > 64_000) buffer = buffer.slice(-8_000);
  }
}

const HEADER_SIZE = 8;

async function demux(stream: Readable, onLine: (line: string, stderr: boolean) => void): Promise<void> {
  let pending = Buffer.alloc(0);
  // per-stream text buffers, so a log line split across frames still emits once
  const text = { out: "", err: "" };

  const flush = (chunk: string, stderr: boolean) => {
    const key = stderr ? "err" : "out";
    text[key] += chunk;
    let index: number;
    while ((index = text[key].indexOf("\n")) !== -1) {
      const line = text[key].slice(0, index).replace(/\r$/, "");
      text[key] = text[key].slice(index + 1);
      if (line.trim()) onLine(line, stderr);
    }
    if (text[key].length > 16_000) text[key] = text[key].slice(-4_000);
  };

  for await (const chunk of stream) {
    pending = Buffer.concat([pending, chunk as Buffer]);

    for (;;) {
      if (pending.length < HEADER_SIZE) break;
      const type = pending[0];
      // A valid multiplex header is 0-2 followed by three zero bytes. Anything
      // else means this container has a TTY and the bytes are raw text.
      const framed = type <= 2 && pending[1] === 0 && pending[2] === 0 && pending[3] === 0;
      if (!framed) {
        flush(pending.toString("utf8"), false);
        pending = Buffer.alloc(0);
        break;
      }
      const length = pending.readUInt32BE(4);
      if (pending.length < HEADER_SIZE + length) break;
      flush(pending.subarray(HEADER_SIZE, HEADER_SIZE + length).toString("utf8"), type === 2);
      pending = pending.subarray(HEADER_SIZE + length);
    }
  }
}
