// Deterministic integration tests: fake CLI processes, no subscription calls.
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;
const records = [], invocations = [], sessions = new Map();
let scenarios = [];
let defaults;
const store = {
  readModelDefaults: async () => defaults,
  saveUsage: async (run) => records.push(run),
  resolveSession: async (id, harness, model) => sessions.get(id) === `${harness}:${model}` ? id : undefined,
  saveSession: async (id, harness, model) => sessions.set(id, `${harness}:${model}`),
};
function spawn(command, args) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.emit("close", null, "SIGTERM"); };
  const invocation = { command, args, prompt: "" }; invocations.push(invocation);
  child.stdin.on("data", (chunk) => { invocation.prompt += chunk.toString(); });
  const scenario = scenarios.shift(); assert.ok(scenario, "unexpected extra CLI invocation");
  setImmediate(() => {
    for (const frame of scenario.frames ?? []) child.stdout.write(JSON.stringify(frame) + "\n");
    if (scenario.stderr) child.stderr.write(scenario.stderr);
    child.emit("close", scenario.code ?? 0);
  });
  return child;
}
require.extensions[".ts"] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  module._compile(code, filename);
};
Module._load = function(request, parent, isMain) {
  if (request === "child_process") return { spawn };
  if (request.endsWith("/runStore") || request === "./runStore") return store;
  if (request.startsWith("@/")) request = path.join(root, request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
const { DEFAULT_MODELS, sanitizeModelDefaults, modelArgs } = require("../lib/widget-creator/models.ts");
const { parseUsage } = require("../lib/widget-creator/usage.ts");
const { requestSwitch, answerSwitch } = require("../lib/widget-creator/switchApproval.ts");
const { runHarnessChain } = require("../lib/widget-creator/harnessRunner.ts");
const { streamHarnessChat } = require("../lib/nutbot/chatHarness.ts");
const pause = () => new Promise((resolve) => setImmediate(resolve));
const codexUsage = { type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 } };
const claudeUsage = { type: "result", usage: { input_tokens: 10, cache_read_input_tokens: 40, cache_creation_input_tokens: 5, output_tokens: 20 }, modelUsage: { "claude-sonnet-5": {} } };
const sid = "12345678-1234-4123-8123-123456789abc";
async function main() {
  defaults = sanitizeModelDefaults({ claude: { model: "sonnet", effort: "medium" }, codex: { model: "gpt-5.6-terra", effort: "low" } });
  assert.deepEqual(sanitizeModelDefaults({ codex: { model: "x; touch /tmp/bad", effort: "high" } }), DEFAULT_MODELS);
  assert.deepEqual(modelArgs("codex", defaults.codex), ["--model", "gpt-5.6-terra", "-c", 'model_reasoning_effort="low"']);
  assert.equal(parseUsage("codex", JSON.stringify(codexUsage)).usage.input, 100);
  assert.equal(parseUsage("claude", JSON.stringify(claudeUsage)).usage.input, 55);
  assert.equal(parseUsage("claude", '{"type":"assistant","usage":{"input_tokens":900}}'), null);
  assert.equal(parseUsage("codex", "invalid"), null);
  assert.equal(parseUsage("opencode", JSON.stringify(codexUsage)), null);
  let pendingId;
  const controller = new AbortController();
  const waiting = requestSwitch(controller.signal, (id) => { pendingId = id; });
  assert.equal(answerSwitch("wrong", true), false);
  assert.equal(answerSwitch(pendingId, false), true);
  assert.equal(await waiting, false);
  assert.equal(answerSwitch(pendingId, true), false);
  const abort = new AbortController();
  const aborted = requestSwitch(abort.signal, () => {}); abort.abort(); assert.equal(await aborted, false);

  let switchId;
  const events = [];
  const write = (s) => { const event = s.match(/^event: (.+)/m)[1]; const data = JSON.parse(s.match(/^data: (.+)/m)[1]); events.push({ event, data }); if (event === "switch_required") switchId = data.id; };
  scenarios = [{ stderr: "quota exceeded", code: 1 }, { frames: [{ type: "thread.started", thread_id: sid }, codexUsage] }];
  const run = runHarnessChain("full specification", "claude", ["claude", "codex"], write, new AbortController().signal, () => "partial component");
  for (let i = 0; i < 10 && !switchId; i++) await pause();
  assert.ok(switchId); assert.equal(invocations.length, 1, "must not spawn fallback before consent");
  assert.equal(answerSwitch(switchId, true), true);
  const done = await run;
  assert.equal(done.harness, "codex"); assert.equal(done.sessionId, sid);
  assert.ok(invocations[1].prompt.includes("partial component"));
  assert.ok(invocations[1].args.includes("gpt-5.6-terra"));
  assert.equal(records[0].status, "limit"); assert.equal(records[0].input, null);
  assert.equal(records[1].input, 100);

  scenarios = [{ frames: [{ type: "thread.started", thread_id: sid }, codexUsage] }];
  await runHarnessChain("full specification", "codex", ["codex"], write, new AbortController().signal, undefined, { sessionId: sid, resumePrompt: "fix only", stage: "fix" });
  assert.ok(invocations.at(-1).args.includes("resume")); assert.equal(invocations.at(-1).prompt, "fix only");
  assert.equal(records.at(-1).stage, "fix");
  defaults = { ...defaults, codex: { model: "gpt-5.6-luna", effort: "low" } };
  scenarios = [{ frames: [codexUsage] }];
  await runHarnessChain("full specification", "codex", ["codex"], write, new AbortController().signal, undefined, { sessionId: sid, resumePrompt: "fix only" });
  assert.ok(!invocations.at(-1).args.includes("resume")); assert.equal(invocations.at(-1).prompt, "full specification");

  switchId = undefined; scenarios = [{ code: 1, stderr: "unavailable model" }];
  const beforeCancel = invocations.length;
  const cancelled = runHarnessChain("spec", "claude", ["claude", "codex"], write, new AbortController().signal);
  for (let i = 0; i < 10 && !switchId; i++) await pause();
  answerSwitch(switchId, false); assert.equal((await cancelled).outcome, "aborted"); assert.equal(invocations.length, beforeCancel + 1);
  scenarios = [{ frames: [{ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } }, claudeUsage] }];
  const stream = streamHarnessChat({ harness: "claude", message: "hi", persona: "chat", modelChoice: defaults.claude, stage: "plan" });
  await new Response(stream).text();
  assert.ok(!invocations.at(-1).args.includes("--bare")); assert.ok(invocations.at(-1).args.includes("sonnet"));
  assert.equal(records.at(-1).stage, "plan"); assert.equal(records.at(-1).model, "claude-sonnet-5");
  console.log("PASS: model arguments, usage parsing, confirmation gate, cancellation, fallback continuation, session/model isolation, subscription chat");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
