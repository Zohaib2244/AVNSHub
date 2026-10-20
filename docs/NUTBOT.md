# NutBot

NutBot is the terminal widget. It has four tabs: `log`, `chat`, `shells` (real host shell sessions) and `creator` (see [WIDGET_CREATOR.md](WIDGET_CREATOR.md)). Everything here is optional; the dashboard works with chat off.

## Chat backends

Pick one from the chat toolbar, or leave it on `auto` (saved as `chatBackend` in `localStorage["nutmag-prefs"]`):

- `auto` - try Bonfire first, then the first installed CLI in your harness order.
- `bonfire` - self-hosted local model only.
- `claude` / `codex` / `opencode` - that CLI only.
- `off` - disable chat.

Chat and the Widget Creator share the same CLI choice and fallback order. The Models menu in NutBot's header saves a provider, model and reasoning effort for each; those apply to the next request. If a build hits a rate limit, falling back to another provider asks you to confirm first.

### Option A: CLI (easiest)

Install and sign in to `claude`, `codex` or `opencode` on the machine running AVN Hub. No model download, GPU or extra config. Chat runs these in a restricted, tool-less mode with native session resume where the CLI supports it. The NSFW and web-search toggles are hidden here because they only exist for Bonfire.

### Option B: Bonfire + llama.cpp (local model)

```text
AVN Hub -> NUTBOT_CHAT_URL -> Bonfire -> llama.cpp server -> GGUF model
```

1. Clone and set up [Bonfire](https://github.com/shahwaizse/bonfire), a FastAPI backend that gives chat memory, personas and optional web search. Follow its own README for its `.env`.
2. Build [llama.cpp](https://github.com/ggml-org/llama.cpp) for your hardware (CUDA or Vulkan for GPUs, Metal on macOS, CPU as a slow fallback).
3. Download a chat/instruct GGUF that fits your RAM or VRAM. Dolphin 3.0 Llama 3.1 8B Q4_K_M is the one NutBot was verified with; it is not hardcoded.
4. Start the server:
   ```bash
   ./llama-server --model /path/to/model.gguf --host 127.0.0.1 --port 8080 \
     --ctx-size 4096 --gpu-layers 20 --parallel 1
   ```
   Tune `--gpu-layers` to your machine: raise it until you run out of VRAM, back off if the desktop gets laggy. For 7B/8B Q4 models, 60-70% of the layer count is a good first try. Lower the model size or quantization if system RAM fills up.
5. Point the hub at Bonfire (default is already `http://127.0.0.1:8000`):
   ```bash
   NUTBOT_CHAT_URL=http://127.0.0.1:8000
   ```

`npm run stop:nutbot-llm` stops Bonfire and llama.cpp on their default ports (`NUTBOT_LLAMA_PORT` overrides the llama.cpp one). The browser never sees the Bonfire URL; the hub proxies it through `/api/nutbot-chat`.

## Work mode

The chat toolbar's **chill | work** switch turns NutBot into a server-maintenance agent that runs commands itself. It needs a CLI backend (Bonfire can't run tools), runs with full host access as the user running AVN Hub, and starts in that user's home directory. It is told to read freely but to stop and ask before any change (restarts, edits, deletes, installs). That is a prompt rule, not something the harness enforces, and there is no sudo.

`/api/nutbot-chat` has no authentication. Anyone who can load the hub can drive a Work-mode agent, the same exposure as the shell. Put the hub behind a login before exposing it beyond your own devices.

## Usage tracking

The Models menu shows token usage per stage (Chat, Plan, Ideate, Build, Fix) from the last 200 CLI runs, stored locally in the hub's SQLite database. Prompts and generated code are not stored. Counts a CLI doesn't report show as missing, never zero, and are not dollars or remaining quota. `node scripts/test-model-integration.cjs` runs the offline tests for this.
