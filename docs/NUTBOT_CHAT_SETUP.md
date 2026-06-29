# NutBot Chat Setup

NutBot chat is optional. AVN Hub runs normally if no chat backend is configured; the chat tab will show an offline or disabled state while the rest of the dashboard keeps working.

There are two supported backend paths:

- **Bonfire local LLM**: best if you want a self-hosted, steerable model with NutBot's NSFW and web-search toggles.
- **CLI harness fallback**: easiest if you already have `claude`, `codex`, or `opencode` installed and authenticated on the machine running AVN Hub.

The chat backend preference lives in `localStorage["nutmag-prefs"]` as `chatBackend`:

- `auto` (default): try Bonfire first, then walk the shared `harnessChain`.
- `bonfire`: use only Bonfire.
- `claude` / `codex` / `opencode`: use that CLI directly.
- `off`: keep the chat tab disabled.

The Widget Creator has its own `creatorEnabled` switch, but both chat and creator share the same `activeHarness` and `harnessChain` ordering.

## Option A: Bonfire Local LLM

Bonfire is a separate FastAPI backend that talks to a local llama.cpp server. AVN Hub only proxies to it through `/api/nutbot-chat`; the Bonfire URL never reaches the browser.

1. Clone and set up Bonfire.

```bash
git clone https://github.com/shahwaizse/bonfire.git
cd bonfire
```

2. Build llama.cpp for your platform.

Use the accelerator that matches your machine:

- Vulkan or CUDA for NVIDIA/AMD GPUs.
- Metal on macOS.
- CPU if you only need a slow fallback.

3. Download a GGUF chat model.

Dolphin 3.0 Llama 3.1 8B Q4_K_M was verified for NutBot, but any OpenAI-compatible llama.cpp chat model can work if Bonfire is configured for it.

4. Tune GPU layers instead of assuming one fixed value.

For GQA models such as Llama 3.1, lowering `--ctx-size` usually does little for VRAM compared with `--gpu-layers`. Start around 60-70% of the model's layer count, watch actual headroom in `nvidia-smi` or Task Manager, then adjust. Going much lower often gives up a lot of speed for only a little extra memory.

Example llama.cpp server shape:

```bash
./llama-server \
  --model /path/to/model.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  --ctx-size 4096 \
  --gpu-layers 20 \
  --parallel 1 \
  --fit off
```

5. Configure and start Bonfire.

Create Bonfire's backend `.env` with the llama.cpp base URL and any search settings Bonfire needs, then start the FastAPI app, commonly on `http://127.0.0.1:8000`.

6. Point AVN Hub at Bonfire.

```bash
NUTBOT_CHAT_URL=http://127.0.0.1:8000
```

If `NUTBOT_CHAT_URL` is omitted, AVN Hub defaults to `http://127.0.0.1:8000`.

With Bonfire reachable and `chatBackend` set to `auto`, NutBot uses Bonfire. The NSFW and search toggles appear only in this mode.

## Option B: CLI Harness Fallback

Install and authenticate at least one supported CLI on the same host/container that runs AVN Hub:

- `claude`
- `codex`
- `opencode`

No model download, GPU, Bonfire process, or extra AVN Hub config is required.

When `chatBackend` is `auto` and Bonfire is unreachable, the chat tab calls the existing `/api/widget-creator/harnesses` endpoint and picks the first available CLI from the shared `harnessChain`. You can also pin one backend directly from the chat toolbar.

Harness chat runs in a restrained mode:

- `claude` uses `--bare`, `--system-prompt`, `--tools ""`, and native `--session-id` / `--resume`.
- `codex` uses `codex exec --json --sandbox read-only --skip-git-repo-check` and native `exec resume`.
- `opencode` uses `opencode run --format json`; session continuity depends on the installed CLI's support and may fall back to stateless turns.

NSFW and web-search toggles are hidden for harness backends because AVN Hub does not provide equivalent orchestration for hosted CLI assistants.

## Neither Configured

If Bonfire is unreachable and no supported CLI is installed, the chat tab shows an offline message. This is expected and does not affect widgets, shell tabs, the Widget Creator, or the rest of AVN Hub.
