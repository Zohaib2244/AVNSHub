// Keeps a custom widget's component file present for the duration of a
// generation run.
//
// config/customComponentMap.tsx holds a *static* import of every custom
// widget's .tsx, so the moment one of those files does not exist the module
// graph fails to resolve and the entire dashboard 500s — app/page.tsx
// included, with no error boundary able to catch it (the failure is at module
// build, not render). Harnesses routinely rewrite a file by deleting it and
// re-adding it; codex's apply_patch does exactly this:
//
//     *** Delete File: .../idea-inbox/IdeaInboxWidget.tsx
//     *** Add File:    .../idea-inbox/IdeaInboxWidget.tsx
//
// The dev server recompiles inside that gap and the page dies. Worse, the
// crash disconnects the browser, which cancels the SSE stream, which aborts
// the run mid-patch — so the file never gets re-added and the widget is left
// half-written. The build prompt now forbids delete-then-add, but a prompt is
// advisory; this is the enforcement.
//
// The generation route already writes a `<file>.tsx.bak` before each edit run
// (backupWidgetFiles). This watches the widget's folder for the whole run and,
// the instant a .tsx disappears while its .bak is still around, copies the
// backup straight back. The harness's own write lands a moment later and wins.
//
// Honest limitation: this and Turbopack's watcher are both consuming the same
// inotify events, and nothing orders them. This shrinks the exposure from
// "however long the harness takes between delete and add" to "one inotify
// hop", which in practice is the difference between reliably fatal and rarely
// noticed — but it cannot close the window to zero. Real isolation (running
// the harness in a worktree and syncing atomically) is the fix that would.
import { copyFileSync, existsSync, watch, type FSWatcher } from "fs";
import { join } from "path";

/** Watch `dir` and restore any .tsx that vanishes while its .bak survives.
 *  Returns a stop function — always call it in a finally, before the backups
 *  are cleaned up, or the watcher outlives the run. */
export function startComponentKeepAlive(dir: string, onRestore?: (file: string) => void): () => void {
  let watcher: FSWatcher | undefined;

  try {
    watcher = watch(dir, (_event, rawName) => {
      if (!rawName) return;
      const name = rawName.toString();
      if (!name.endsWith(".tsx")) return;

      const tsx = join(dir, name);
      const bak = `${tsx}.bak`;
      // Only act on the dangerous state: file gone, backup available. The
      // restore itself fires this watcher again, but by then the .tsx exists
      // so it no-ops — no loop.
      if (existsSync(tsx) || !existsSync(bak)) return;

      try {
        copyFileSync(bak, tsx);
        onRestore?.(name);
      } catch {
        // a failed restore is not worth taking the request down for; the
        // post-run restoreMissingWidgetFiles() is still there as the backstop
      }
    });
  } catch {
    // fs.watch is unavailable on some filesystems — degrade to the pre-existing
    // post-run restore rather than failing the generation
  }

  return () => {
    try { watcher?.close(); } catch {}
  };
}
