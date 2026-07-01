# Using the Widget Creator

A step-by-step walkthrough of NutBot's **Widget Creator** — the in-app tool
that builds a new dashboard widget for you from a plain description, no
coding required. If you want to hand-write a widget's code yourself instead,
see [CREATING_WIDGETS.md](CREATING_WIDGETS.md) — this guide is about the
chat-driven tool, not the code underneath it.

---

## Before you start

The Widget Creator needs an AI "engine" to actually write the widget for
you. AVN Hub can use any of three: **claude**, **codex**, or **opencode** —
you pick which one (or let it pick for you) in Step 6 below. The builder now
uses compact skill references and token-optimized prompt loading, so large
authoring guidance stays lightweight and fast. At least one of these needs to
be installed and signed in on the machine running AVN Hub. If none are
available, the Creator tab will say so and stay disabled — nothing else in
the dashboard is affected.

---

## Step 1 — Open NutBot's Creator tab

NutBot lives in the center slot of your dashboard. Its terminal has four
tabs across the top: `log`, `chat`, `shells`, and `creator`. Click **`✦
creator`**.

![NutBot terminal tab bar](<screenshots/nutbot-terminal-v2.2.png>)

---

## Step 2 — Start a new widget

You'll land on the project list — every widget you've started or finished
building, each with a little progress indicator showing which stage it's at.

Click **"new widget"** on the banner at the top.

![Widget Creator project list](<screenshots/widget-creator-project-list.png>)

---

## Step 3 — Pick where to start

You'll be asked to choose one of three starting points:

- **Plan** — you're not sure exactly what to build yet. Chat with the AI
  about an idea and refine it together.
- **Ideate** — you already know roughly what you want and want to see a few
  *visual* mockups before committing to real code.
- **Build** — you already know exactly what you want. Skip straight to
  filling in the details and generating the real widget.

You don't have to use all three — pick whichever matches how far along your
idea already is. Plan can hand off into Ideate, and both can hand off into
Build, but you're free to jump straight to Build any time.

![Choosing where to start](<screenshots/widget-creator-entry-picker.png>)

---

## Step 4 (optional) — Plan: figure out what to build

If you picked Plan, you'll see a chat box. Describe what you're thinking of
— even something vague like "something for tracking my sleep" is enough to
start. The AI will either:

- ask you a question or two to narrow it down, or
- come back with a proposed concept card: a title, suggested sizes, and a
  short description of what each size would show.

Once you're happy with a concept card, you have two buttons:

- **"build this"** — skips straight to Build with the concept pre-filled.
- **"visualize first"** — sends the concept to Ideate to see it as an actual
  mockup before writing real code.

Click **"new"** any time to clear the conversation and start over.

![Plan chat with a concept brief card — a fidget toy widget, in this example](<screenshots/widget-creator-plan-chat.png>)

---

## Step 5 (optional) — Ideate: see it before you build it

Ideate generates a handful of throwaway HTML mockups so you can see roughly
what the widget could look like before any real code gets written. Describe
the concept (or arrive here already carrying one from Plan), choose how many
variations you want (1–6, default 3), and generate.

Each variation renders live so you can actually see it, not just read about
it. For any variation you can:

- **"regenerate"** — describe what you'd change, and get a revised version
  in the same spot.
- **"finalize → build"** — lock this one in as the visual target and move on
  to Build, which will recreate it as a real, working widget component.

![Ideate's variation gallery — a fidget toy widget, in this example](<screenshots/widget-creator-ideate-gallery.png>)

---

## Step 6 — Build: fill in the details

This is where the real widget gets written. The left panel has a settings
form; fill in what you know (skip what you don't — the AI will make
reasonable choices for anything left blank):

![The Build settings panel](<screenshots/widget-creator-settings.png>)

- **Identity** — a name, an icon (start typing and it'll suggest icon
  names), and a slug (auto-filled from the name — this becomes the widget's
  internal id, so it's best not to change it later).
- **Sizes & layout** — which sizes the widget should support (**S**mall,
  **M**edium, **L**arge) and which shapes (horizontal / vertical). Every
  widget can be resized on the dashboard later, but only within whatever you
  pick here.
- **What each size shows** — a separate tab for S, M, and L where you
  describe (in plain words) what that size should display. A good rule of
  thumb: S is one glanceable number or status, M is the normal everyday
  view, and L is the "I want more detail" view — they should feel like
  different views, not the same thing just bigger. You can also attach a
  reference image per size if you have one in mind.
- **Data source** *(optional, collapsed by default)* — if the widget needs
  to pull in live data from somewhere, you can point it at a URL and
  describe the shape of the response. Leave this closed if the widget is
  self-contained (a game, a static display, a calculator, etc.).

Then describe the widget in your own words in the chat box on the right and
send it.

![Widget Creator build workspace](<screenshots/widget-creator-workspace.png>)

---

## Step 7 — Pick the AI engine (optional)

In the top-right corner of the terminal there's a small pill showing which
AI engine is currently active. Click it to open a list of the ones
installed on your machine — a green dot means it's ready to use, red means
it's not installed. You can drag to reorder them: if your first choice hits
a rate limit mid-build, AVN Hub automatically falls back to the next one in
the list rather than stopping. This same choice is shared with NutBot's chat
tab.

![AI engine picker](<screenshots/nutbot-model-picker.png>)

---

## Step 8 — Watch it build

Once you send your description, the AI starts writing the actual component.
You'll see its progress stream in as it works, and a status indicator
cycling through `connecting → generating → checking types → done`. That
type-check step is automatic and happens whether or not you asked for it —
if it finds a mistake, the AI gets the error back and fixes it itself before
you see a final result.

---

## Step 9 — Add it to your dashboard

When the build finishes, you'll see two buttons appear one after another:

1. **"install widget"** — registers it into AVN Hub for real.
2. **"add to layout"** — places it on your dashboard automatically. Once
   placed, this becomes an **"added ✓"** confirmation.

At that point it's a normal widget — resize it, move it, or tweak its
settings from its gear icon, exactly like any of the ones AVN Hub ships
with.

---

## If something goes wrong

If a build fails partway through, nothing on your existing dashboard
breaks. AVN Hub keeps the last working version of anything it was editing
and tells you what happened in the chat. If it was actively editing a widget
that's currently on your canvas, you may see a **"restore to canvas"**
button to put the previous working version back while you sort out the next
attempt. You can just describe the fix in the chat and try again.

---

## Editing a widget you already made

In the Build settings panel, there's an **"edit"** toggle with a dropdown of
your existing custom widgets. Pick one to switch into edit mode — you can
rename it, change its icon, or adjust its sizes directly, or describe a
change in the chat to have the AI modify the actual behavior/code.

---

## One thing to know: switching canvases mid-build

If you have multiple canvases set up and you switch away
while a widget is actively generating, AVN Hub will ask you to confirm first
— switching cancels the build in progress, so nothing gets silently lost.

![Canvas switch confirmation](<screenshots/canvas-switch-dialog.png>)
