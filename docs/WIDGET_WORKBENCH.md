# Widget Workbench — implementation plan

Status: implemented 2026-09-16 (phases 1–3). Code: `lib/widget-creator/workbench.ts`.

## Problem

The Widget Creator runs its CLI harness (claude / codex / opencode) **inside the
live source tree** that `next dev` is serving. Every intermediate write is seen
by Turbopack immediately:

- `config/customComponentMap.tsx` statically imports every registered custom
  widget, so a registered widget file that is momentarily missing, half-written,
  or importing something not written yet makes the **whole dashboard** fail to
  compile (HTTP 500), not just that widget.
- The crash disconnects the browser, which cancels the SSE stream, which aborts
  the harness mid-edit — so the replacement never lands.
- Current mitigations are races, not fixes: `.tsx.bak` backups,
  `componentKeepAlive.ts` (an inotify watcher restoring deleted files, racing
  Turbopack's own watcher), and the client temporarily removing a widget from
  the canvas while it is being edited.
- A turn that fails the TypeScript gate still leaves the broken code live
  (`restoreMissingWidgetFiles` only restores *deleted* files).
- Widget import (`/api/widget-creator/import`) writes a zip straight into the
  live tree and registers it with no check at all.

## Idea

Each widget being created or edited gets a **workbench**: a private copy of the
project's source, outside the repo. The harness works only there. The live tree
changes exactly once per successful turn, after the draft passes the gate.

```
live repo (served by next dev)            workbench (per widget, outside repo)
─────────────────────────────             ──────────────────────────────────
                         1. prepare  ───▶  source mirror (~5 MB, 300 files)
                                           node_modules → symlink to live
                                           2. harness edits files here
                                           3. diff: what did it change?
                                           4. gate: tsc on the widget's files
      apply  ◀───────────────  5. only if the gate passes (and live
      (temp file + rename)        didn't change underneath)
6. register (edits: registry JSON;
   new widgets: later "add to layout")
```

Why a plain directory copy rather than `git worktree`: it works without git
(the Docker image and zip-downloaded installs may not have it), needs no
`git worktree prune` bookkeeping, and seeds from the **working tree**, so
uncommitted widget work is never lost or overwritten. Change detection uses
content hashes instead of `git status`.

## Layout

- Root: `$AVNHUB_WORKBENCH_DIR`, default `~/.local/share/avn-hub/workbenches/`.
  Must resolve **outside** the repo — inside it, `tsconfig`'s `**/*.ts`,
  Turbopack's watcher and Tailwind's source scan would all pick it up.
- Per widget: `<root>/<repoKey>/<slug>/` where `repoKey` is a short hash of the
  repo path (two hub checkouts on one machine never collide).
  - `tree/` — the source mirror.
  - `state.json` — `base`: content hashes of the widget's *owned files* as last
    agreed with the live tree.
- Owned paths of a widget: `components/widgets/custom/<slug>/` and
  `app/api/<slug>/`. Only these are ever applied back.
- Symlinked (never copied): `node_modules`, `lib/generated`, `next-env.d.ts`,
  `wallpaper/node_modules` — whichever exist.
- `base/` — pristine copies of the widget's live files as of prepare, used to
  undo a harness that writes into the live tree. `escaped/` — what such a
  harness wrote, kept rather than discarded.
- Mirrored file list: `git ls-files -co --exclude-standard` when git is
  available (respects `.gitignore`, so `.env*` secrets never enter the
  workbench); otherwise a walker with a fixed exclude list.

## Turn lifecycle (`lib/widget-creator/workbench.ts`)

1. **prepare(slug)**
   - No workbench yet → copy the mirror, create symlinks, `base` = hashes of the
     live owned files. The incoming harness session id is dropped (Claude
     sessions are stored per working directory, so a session started in the
     live repo can't resume here).
   - Workbench exists → refresh every *non-owned* file from live (framework
     changes propagate). Owned files:
     compared per file against `base`:
     - unchanged in the draft → take live's version (e.g. an `update-meta`
       rename that happened between turns).
     - changed in the draft, unchanged live → keep the draft (a fix turn
       continues it).
     - changed in both, differently → the widget was edited outside the creator
       while a failed draft was pending: discard the whole draft, take live,
       and tell the user.
2. **snapshot** every workbench file's hash.
3. **run** the harness chain with `cwd` = workbench tree.
4. **diff** against the snapshot. Changes outside the owned paths are reverted
   to the live version and reported (the existing `audit` event). The live tree
   is checked too: any of the widget's live files that changed during the run
   were written by a harness that escaped its workbench, so they are restored
   from the pristine base copies taken at prepare (the harness's version is
   kept under the workbench's `escaped/` folder) and reported. The live-tree
   `git status` tripwire stays as a second check.
5. **gate** (only when the harness finished cleanly): a component module must
   exist; `tsc --noEmit` runs in the workbench, and only diagnostics inside the
   widget's owned paths count (unrelated broken widgets no longer fail this
   one). Failure → `tsc_errors`, draft stays pending, live untouched.
6. **apply**: re-check live owned files still equal `base` (else refuse:
   "changed during the run"), then write each added/modified owned file via
   temp-file + `rename` (atomic per file), delete removed ones, set `base`.
   On a create, SPEC.md is written into the workbench first so it applies with
   the component.
7. **register** exactly as today: edits re-register immediately; new widgets
   wait for the explicit "add to layout" click.

Nothing that happens inside a run — a delete-then-add patch, a half-written
file, a crash, a closed tab — is visible to the live dashboard anymore.

## Flows

- **Create**: prepare (empty owned paths) → harness writes the new folder in the
  workbench → gate → apply → "add to layout" registers it.
- **Edit**: prepare seeds from the live widget → harness edits the draft → gate
  → apply → registry refresh. The widget stays on the canvas and keeps working
  during the whole run; it updates once, when the checked version lands.
- **Fix turn after tsc errors**: prepare keeps the pending draft, so the harness
  repairs its own previous attempt, not the live version.
- **Import (sharing)**: unzip into the workbench's owned paths → gate → apply →
  register. Updating a widget you already have becomes possible (same slug =
  new version through the same conflict-checked apply).
- **Delete**: also removes that widget's workbench.

## What gets removed

- `.tsx.bak` backup / restore / cleanup in the generate route.
- `lib/widget-creator/componentKeepAlive.ts`.
- The client hiding a widget from the canvas while it is being edited.

## Phases

1. `workbench.ts` + harness `cwd` option + generate route rewrite + removals.
   Verify: create, edit, tsc-failure, delete-then-add patch simulation,
   conflict, abort — all with the live dashboard staying up.
2. Import through the workbench (gate + update-in-place). Delete cleans up.
3. Export completeness: include `app/api/<slug>/`, `SPEC.md`, and a
   `hubVersion` in `registry.json`; importer warns on missing npm packages.

## Verification (2026-09-16)

- 25 scripted scenarios against `workbench.ts` (prepare/refresh, outside-write
  revert, tsc gate, fix-turn draft kept, delete-then-add inside the draft,
  non-overlapping live change merged, apply-time conflict refused, overlapping
  conflict discards the draft, deletions, mirror refresh) — all pass.
- Real claude runs through `/api/widget-creator/generate`: a create (applied in
  one moment after the gate, nothing written live during the run) and an edit of
  a registered widget (live file hash unchanged until apply; session resumed in
  the stable workbench). Dashboard polled every second: 609 checks, all 200.
- Import through the workbench: broken TypeScript rejected with live unchanged,
  missing npm package rejected, path traversal rejected, update-in-place
  applied, new widget with an `api/` route installed and served, version-skew
  note returned. Export round-trips `api/` and `$meta.hubVersion`. Delete removes
  the widget's workbench.

## Bugs found along the way (fixed)

- **Claude couldn't write its own widget.** The per-run tool scope was a blanket
  `Read(./components/widgets/custom/**)` deny plus an allow for the run's own
  folder; deny beats allow, and claude treats a Read deny as blocking writes
  ("File is covered by a Read deny rule ... cannot be written"). Now only
  sibling folders are denied, by name — and a workbench doesn't mirror sibling
  widgets at all, so no flags are needed there.
- **Every claude run ended as "All harnesses hit a limit (quota)".** Claude Code
  2.1.x emits a `rate_limit_event` frame (status `allowed`) on every run, which
  matched the `/rate.?limit/` quota pattern. Only status `rejected` counts now.

## Known follow-ups

- The delete route's orphan prune removes unregistered widget folders older
  than 48h that no creator project references (it removed `he` during testing;
  restored from git). Consider protecting folders that have a workbench.
- The client's "restore to canvas" UI for edit-hidden widgets is now dead code
  (edits no longer hide the widget) and can be removed.

## Escapes from the workbench (2026-09-17)

`cwd` on the spawned process is not enough: **codex** takes its working root
from `-C/--cd` and **opencode** from `--dir`, and any model can type an
absolute path. A claude → codex → opencode edit of `idea-inbox` ended with a
harness rewriting the *live* file (smart punctuation ASCII-ified per the build
spec, plus two stray `}` in JSX), which 500'd the dashboard — the workbench's
own draft was clean and untouched. Fixed in two layers:

1. `-C <workbench>` for codex and `--dir <workbench>` for opencode, alongside
   the process cwd.
2. `restoreLiveEscapes()` after every run: the widget's live files must be
   byte-identical to what they were at prepare, or they are put back from
   `base/` and the harness's version is preserved in `escaped/`.

Note: opencode on this machine currently refuses to run at all — its provider
returns "OpenCode 1.18.0 or newer is required to use the free tier".

