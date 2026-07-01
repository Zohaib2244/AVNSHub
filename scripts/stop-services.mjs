#!/usr/bin/env node
import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const DEFAULTS = {
  hubPort: 3000,
  bonfireUrl: "http://127.0.0.1:8000",
  llamaPort: 8080,
};

const TARGETS = new Set(["hub", "llm", "all"]);
const aliases = {
  avnhub: "hub",
  "avn-hub": "hub",
  bonfire: "llm",
  "nutbot-llm": "llm",
  nutbot: "llm",
};

function readDotEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return {};

  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const dotenv = readDotEnv();

function setting(key, fallback) {
  return process.env[key] || dotenv[key] || fallback;
}

function portFromUrl(value, fallback) {
  try {
    const url = new URL(value);
    if (url.port) return Number(url.port);
    if (url.protocol === "https:") return 443;
    if (url.protocol === "http:") return 80;
  } catch {}
  return Number(fallback);
}

function numberSetting(keys, fallback) {
  for (const key of keys) {
    const value = setting(key, "");
    if (value && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function exec(command, args) {
  return new Promise((resolvePromise) => {
    execFile(command, args, { windowsHide: true }, (error, stdout) => {
      resolvePromise(error ? "" : stdout);
    });
  });
}

async function pidsForPort(port) {
  if (process.platform === "win32") {
    const output = await exec("netstat.exe", ["-ano", "-p", "tcp"]);
    const pids = new Set();
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const local = parts[1] ?? "";
      const pid = parts[4] ?? "";
      if ((local.endsWith(`:${port}`) || local.endsWith(`]:${port}`)) && /^\d+$/.test(pid)) {
        pids.add(pid);
      }
    }
    return [...pids];
  }

  const output = await exec("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
  return output
    .split(/\s+/)
    .map((pid) => pid.trim())
    .filter((pid) => /^\d+$/.test(pid));
}

async function killPid(pid) {
  if (process.platform === "win32") {
    const output = await exec("taskkill.exe", ["/PID", pid, "/T", "/F"]);
    return output.trim();
  }

  try {
    process.kill(Number(pid), "SIGTERM");
    return `sent SIGTERM to ${pid}`;
  } catch (error) {
    return `failed to stop ${pid}: ${error.message}`;
  }
}

async function stopPort(label, port) {
  if (!Number.isFinite(port) || port <= 0) {
    console.log(`[skip] ${label}: invalid port`);
    return;
  }

  const pids = await pidsForPort(port);
  if (pids.length === 0) {
    console.log(`[ok] ${label}: nothing listening on port ${port}`);
    return;
  }

  console.log(`[stop] ${label}: port ${port}, pid${pids.length === 1 ? "" : "s"} ${pids.join(", ")}`);
  for (const pid of pids) {
    const result = await killPid(pid);
    if (result) console.log(result);
  }
}

function usage() {
  console.log(`Usage:
  npm run stop:hub         stop AVN Hub dev server on AVN_HUB_PORT/PORT or 3000
  npm run stop:nutbot-llm  stop Bonfire and llama.cpp local LLM ports
  npm run stop:all         stop AVN Hub and NutBot local LLM

Overrides:
  AVN_HUB_PORT=3000
  NUTBOT_CHAT_URL=http://127.0.0.1:8000
  NUTBOT_LLAMA_PORT=8080
  LLAMA_SERVER_PORT=8080`);
}

const requested = process.argv[2] ?? "all";
const target = aliases[requested] ?? requested;

if (!TARGETS.has(target)) {
  usage();
  process.exitCode = 1;
} else {
  const hubPort = numberSetting(["AVN_HUB_PORT", "PORT"], DEFAULTS.hubPort);
  const bonfirePort = portFromUrl(setting("NUTBOT_CHAT_URL", DEFAULTS.bonfireUrl), 8000);
  const llamaPort = numberSetting(["NUTBOT_LLAMA_PORT", "LLAMA_SERVER_PORT"], DEFAULTS.llamaPort);

  if (target === "hub" || target === "all") {
    await stopPort("AVN Hub", hubPort);
  }
  if (target === "llm" || target === "all") {
    await stopPort("Bonfire", bonfirePort);
    await stopPort("llama.cpp", llamaPort);
  }
}
