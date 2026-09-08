# NutBot v2.4 models and usage

Open **Models** in NutBot's top action row. The second header row is reserved for Log, Chat, Shells and Creator navigation.

- Save a Creator provider and a Chat backend independently. Chat supports Auto, Bonfire, the three CLIs, and Off. Auto asks before sending a request to a CLI when Bonfire is unavailable.
- Save a Claude and Codex model, with optional supported low/medium/high reasoning effort. CLI default inherits the CLI configuration; custom model IDs are also accepted. These controls apply to the next request, including Chat and Plan.
- Suggested models describe capabilities, not account entitlement. Availability depends on the installed CLI, subscription and provider rollout. An unavailable model reports an error; AvnHub does not silently choose a different provider.
- Build and Ideate fallback requires a confirmation showing the next provider/model and reason. Cancel or five minutes without a decision stops the chain and preserves partial files. Stop/disconnect also cancels the pending request. To retry or use another provider, select it in Models and resend the request.
- The menu animates its opening, model cards, hover states and save feedback. Reduced-motion preferences disable these animations. It supports keyboard focus, Escape and narrow screens.

## Subscription usage

The hub stores the last 200 CLI attempts in its existing SQLite key/value database, under `nutbot-usage:<runId>`. Each record contains stage (Chat, Plan, Ideate, Build or Fix), provider, requested/reported model, result, elapsed time and reported token counters. Prompts and generated code are not stored in these records.

Claude terminal `result.usage` reports uncached input, cached reads, cache creation and output separately. The displayed input total includes all three input categories. Codex `turn.completed.usage.input_tokens` already includes cached input, so the cached count must not be added again. Intermediate frames are ignored to avoid counting cumulative usage twice. Claude's reported model list can include auxiliary models.

Unknown counters are **not reported**, never zero. OpenCode and interrupted/error runs may not emit supported counters. Stage totals sum reported counts and show how many attempts have missing counts. A `done` result means the CLI completed; it does not prove widget validation succeeded. Compiler repair requests appear separately under Fix.

Token counts are not dollars or remaining subscription quota. Subscription usage limits are provider-controlled and cannot be inferred from these counters. No historical CLI sessions are imported. Start comparing the stages after new runs accumulate.

## Session continuity and fixes

Claude and Codex build sessions are saved before TypeScript validation, so a failed validation does not lose the CLI session. The next request includes outstanding compiler diagnostics. Sessions are bound to their provider and saved model choice on the server (`nutbot-session:<id>`); changing either starts fresh with available task context. Legacy sessions without a binding also start fresh once. A resumed session still uses context tokens; a short new prompt is not equivalent to a proportional reduction in usage.

Claude Chat/Plan no longer use `--bare`, which the installed CLI documents as bypassing subscription authentication. Codex Build uses `--sandbox workspace-write` instead of the removed `--full-auto` option.

## Verification

Run `node scripts/test-model-integration.cjs` for deterministic tests of CLI arguments, reported usage, fallback confirmation/cancellation, partial-work continuation, and session/model isolation. These tests simulate CLI processes and never call a model.

Model descriptions and configuration references:
- [Claude model configuration](https://code.claude.com/docs/en/model-config)
- [Codex models](https://learn.chatgpt.com/docs/models)
