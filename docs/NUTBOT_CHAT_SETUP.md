# NutBot Chat Setup

NutBot chat is optional. AVN Hub runs normally if no chat backend is configured; the chat tab will show an offline or disabled state while the rest of the dashboard keeps working.

There are two supported backend paths:

- **Bonfire local/custom LLM**: best if you want a self-hosted, steerable GGUF model with NutBot's NSFW and web-search toggles.
- **CLI harness fallback**: easiest if you already have `claude`, `codex`, or `opencode` installed and authenticated on the machine running AVN Hub.

The chat backend preference lives in `localStorage["nutmag-prefs"]` as `chatBackend`:

- `auto` (default): try Bonfire first, then walk the shared `harnessChain`.
- `bonfire`: use only Bonfire.
- `claude` / `codex` / `opencode`: use that CLI directly.
- `off`: keep the chat tab disabled.

The Widget Creator has its own `creatorEnabled` switch, but both chat and creator share the same `activeHarness` and `harnessChain` ordering.

## Option A: Bonfire Local/Custom LLM

Bonfire is a separate FastAPI backend that talks to a local llama.cpp server. AVN Hub only proxies to it through `/api/nutbot-chat`; the Bonfire URL never reaches the browser.

The split is:

- **llama.cpp** runs the actual GGUF model.
- **Bonfire** provides chat memory, presets/personas, and optional search orchestration.
- **AVN Hub** talks only to Bonfire through `NUTBOT_CHAT_URL`.

### 1. Clone And Set Up Bonfire

```bash
git clone https://github.com/shahwaizse/bonfire.git
cd bonfire
```

Follow Bonfire's own backend setup for Python dependencies and `.env` values. AVN Hub does not need Bonfire's internals in its own `.env.local`; it only needs the base URL.

### 2. Build llama.cpp For Your Platform

Use the accelerator that matches your machine:

- Vulkan or CUDA for NVIDIA/AMD GPUs.
- Metal on macOS.
- CPU if you only need a slow fallback.

### 3. Choose A GGUF Model

Dolphin 3.0 Llama 3.1 8B Q4_K_M was verified for NutBot, but it is not hardcoded. Any llama.cpp-compatible chat/instruct GGUF can work if Bonfire is configured to use it.

When choosing a custom model, check:

- It fits your RAM/VRAM at the quantization you downloaded.
- It is a chat/instruct model, not just a base model.
- Its prompt format is supported by Bonfire or llama.cpp's server template handling.
- You have enough context length for your expected chat history.

### 4. Start llama.cpp

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

### 5. Find The Right Settings For Your Machine

Do not copy someone else's `--gpu-layers` blindly. The right value depends on your GPU VRAM, system RAM, model size, quantization, driver/backend, context length, and whether the same GPU is also running your desktop or games.

Use this tuning loop:

1. **Start with a known-stable baseline.**

   Run the model with CPU-only or very low GPU offload first:

   ```bash
   ./llama-server \
     --model /path/to/model.gguf \
     --host 127.0.0.1 \
     --port 8080 \
     --ctx-size 4096 \
     --gpu-layers 0 \
     --parallel 1
   ```

   Send one short chat request through Bonfire. This proves the model, prompt template, Bonfire wiring, and AVN Hub proxy are basically correct before GPU tuning enters the picture.

2. **Raise `--gpu-layers` in chunks.**

   For a new machine/model, increase `--gpu-layers` by 5-10 layers at a time. Watch memory while the model loads and while it generates:

   - NVIDIA: `nvidia-smi`
   - Windows: Task Manager -> Performance -> GPU
   - Linux desktop: your GPU monitor of choice

   Keep enough headroom for the OS and browser. A config that loads with 100-200 MB free can still crash once generation starts.

3. **Find the failure point, then back off.**

   If llama.cpp fails to load, crashes, returns CUDA/Vulkan/Metal allocation errors, or the whole system becomes unstable, lower `--gpu-layers`.

   A good daily-driver setting is usually a few layers below the maximum that barely fits. Prefer stability over squeezing out the last token per second.

4. **Tune context after GPU layers.**

   `--ctx-size` controls how much conversation/history the model can consider. Larger context uses more memory, but for GQA models such as Llama 3.1, lowering context often saves less VRAM than people expect compared with lowering `--gpu-layers`.

   Suggested starting points:

   | Machine | Starting `--ctx-size` | Notes |
   | --- | --- | --- |
   | Low VRAM / older GPU | `2048` | Safer, shorter memory |
   | 6-8 GB VRAM | `4096` | Good first target for 7B/8B Q4 models |
   | 12 GB+ VRAM | `4096`-`8192` | Increase only if you need longer chat memory |

5. **Keep `--parallel` low for NutBot.**

   NutBot chat is usually one user, one conversation. Start with `--parallel 1`. Higher values reserve more memory for concurrent work and are rarely useful for this dashboard.

6. **Measure the actual chat experience.**

   Use a short prompt, then a longer prompt. Look for:

   - Time to first token
   - Tokens per second
   - Whether the machine stays responsive
   - Whether a few back-to-back messages stay stable

   If time-to-first-token is awful, raise `--gpu-layers` if memory allows. If the machine stutters or crashes, lower `--gpu-layers`, lower `--ctx-size`, or choose a smaller/more-quantized model.

7. **Write down a profile per machine.**

   Keep a small note next to your Bonfire/llama.cpp setup:

   ```text
   machine: desktop-1660ti
   model: Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf
   backend: Vulkan
   ctx-size: 4096
   gpu-layers: 20
   parallel: 1
   result: stable, browser remains responsive
   ```

   Treat that as a local profile, not a universal recommendation.

Quick symptom guide:

| Symptom | First thing to try |
| --- | --- |
| Model does not load / GPU allocation error | Lower `--gpu-layers` |
| Loads but crashes during generation | Lower `--gpu-layers`, then lower `--ctx-size` |
| Very slow but stable | Raise `--gpu-layers` if memory allows |
| Browser/desktop becomes laggy | Lower `--gpu-layers` or leave more VRAM headroom |
| Long conversations lose context | Raise `--ctx-size` if memory allows |
| System RAM fills up | Use a smaller model or stronger quantization |

For 7B/8B Q4 models, a good first attempt on midrange GPUs is often `--ctx-size 4096`, `--parallel 1`, and `--gpu-layers` around 60-70% of the model's layer count. Then tune from there.

### 6. Configure And Start Bonfire

Create Bonfire's backend `.env` with the llama.cpp base URL and any search settings Bonfire needs, then start the FastAPI app, commonly on `http://127.0.0.1:8000`.

The exact Bonfire variables are owned by Bonfire, but the important relationship is:

```text
AVN Hub -> NUTBOT_CHAT_URL -> Bonfire -> llama.cpp server -> GGUF model
```

### 7. Point AVN Hub At Bonfire

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
