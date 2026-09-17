// Widget workbench — a private copy of the project source per widget, outside
// the repo, where the Widget Creator's harness does all of its writing. The
// live tree (served by `next dev`) only changes once per successful turn, when
// the finished draft passes the gate and is applied file-by-file with atomic
// renames. See docs/WIDGET_WORKBENCH.md for the full design.
//
// Why this exists: customComponentMap.tsx statically imports every registered
// widget, so a live widget file that is momentarily missing or half-written
// (a delete-then-add patch, a crash mid-edit) failed the whole dashboard's
// compile. Nothing a harness does inside a workbench is visible to Turbopack.
import { createHash, randomBytes } from "crypto";
import { execFile, spawn } from "child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { dirname, join, relative, resolve, sep } from "path";

const REPO_ROOT = process.cwd();

/** heavy or machine-specific paths linked into the workbench, never copied */
const SYMLINKED = ["node_modules", "lib/generated", "next-env.d.ts", "wallpaper/node_modules"];

/** fallback exclude list when git isn't available to apply .gitignore */
const WALK_EXCLUDES = new Set([
  "node_modules", ".next", ".git", "out", "build", "coverage", "lib/generated",
  "wallpaper/node_modules", "wallpaper/.next", "wallpaper/out", ".nutbot-ideate",
]);

type Hashes = Record<string, string>;

type WorkbenchState = {
  repo: string;
  /** hashes of the widget's owned files as last agreed with the live tree */
  base: Hashes;
};

export type Workbench = {
  slug: string;
  /** the source mirror the harness runs in */
  tree: string;
  /** true when this call created the workbench (no prior draft or session) */
  created: boolean;
  /** true when a pending draft was dropped because live changed underneath it */
  discardedDraft: boolean;
};

// ─── paths ────────────────────────────────────────────────────────────────

function workbenchRoot(): string {
  const configured = process.env.AVNHUB_WORKBENCH_DIR?.trim();
  const root = resolve(configured || join(homedir(), ".local", "share", "avn-hub", "workbenches"));
  // Inside the repo it would be type-checked, watched and Tailwind-scanned as
  // part of the live project — exactly what the workbench exists to avoid.
  if (root === REPO_ROOT || root.startsWith(REPO_ROOT + sep)) {
    throw new Error(`AVNHUB_WORKBENCH_DIR (${root}) must be outside the project directory`);
  }
  return root;
}

function repoKey(): string {
  return createHash("sha1").update(REPO_ROOT).digest("hex").slice(0, 10);
}

function workbenchDir(slug: string): string {
  return join(workbenchRoot(), repoKey(), slug);
}

export function ownedPrefixes(slug: string): string[] {
  return [`components/widgets/custom/${slug}/`, `app/api/${slug}/`];
}

function isOwned(slug: string, rel: string): boolean {
  return ownedPrefixes(slug).some((prefix) => rel.startsWith(prefix));
}

const CUSTOM_PREFIX = "components/widgets/custom/";

/** Files of *other* custom widgets are not mirrored: the harness has no reason
    to read them (the skill forbids it) and can't if they aren't there — for
    every harness, not only claude's deny flags. Nothing the gate checks
    depends on them: only diagnostics inside this widget's paths count. */
function isSiblingWidget(slug: string, rel: string): boolean {
  if (!rel.startsWith(CUSTOM_PREFIX)) return false;
  const rest = rel.slice(CUSTOM_PREFIX.length);
  const slash = rest.indexOf("/");
  return slash !== -1 && rest.slice(0, slash) !== slug;
}

// ─── file helpers ─────────────────────────────────────────────────────────

function hashFile(path: string): string | null {
  try {
    return createHash("sha1").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

/** every regular file under `dir` (relative, "/"-separated), never following symlinks */
function walkFiles(dir: string, skip: (rel: string) => boolean = () => false): string[] {
  const out: string[] = [];
  const visit = (abs: string) => {
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(abs, name);
      const rel = relative(dir, full).split(sep).join("/");
      if (skip(rel)) continue;
      let st;
      try {
        st = lstatSync(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) visit(full);
      else if (st.isFile()) out.push(rel);
    }
  };
  visit(dir);
  return out;
}

function listLiveFiles(): Promise<string[]> {
  return new Promise((resolveList) => {
    execFile(
      "git",
      ["ls-files", "-co", "--exclude-standard", "-z"],
      { cwd: REPO_ROOT, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (!err) {
          // -c also lists tracked files deleted from the working tree
          resolveList(stdout.split("\0").filter((rel) => rel && existsSync(join(REPO_ROOT, rel))));
          return;
        }
        resolveList(walkFiles(REPO_ROOT, (rel) => WALK_EXCLUDES.has(rel) || /^\.env/.test(rel.split("/").pop() ?? "")));
      },
    );
  });
}

function sameContent(a: string, b: string): boolean {
  try {
    const sa = lstatSync(a);
    const sb = lstatSync(b);
    if (sa.size !== sb.size) return false;
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

function copyInto(fromRoot: string, toRoot: string, rel: string): void {
  const dest = join(toRoot, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(fromRoot, rel), dest);
}

function removeEmptyParents(root: string, rel: string): void {
  let dir = dirname(join(root, rel));
  while (dir.startsWith(root + sep)) {
    try {
      if (readdirSync(dir).length > 0) return;
      rmSync(dir, { recursive: true });
    } catch {
      return;
    }
    dir = dirname(dir);
  }
}

/** hashes of the widget's owned files under `root` (live repo or a workbench tree) */
function ownedHashes(root: string, slug: string): Hashes {
  const hashes: Hashes = {};
  for (const prefix of ownedPrefixes(slug)) {
    const base = join(root, prefix);
    if (!existsSync(base)) continue;
    for (const rel of walkFiles(base)) {
      const full = `${prefix}${rel}`;
      const hash = hashFile(join(root, full));
      if (hash) hashes[full] = hash;
    }
  }
  return hashes;
}

function sameHashes(a: Hashes, b: Hashes): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

/** replace the tree's owned files with the live tree's */
function resetOwnedFromLive(tree: string, slug: string): Hashes {
  for (const prefix of ownedPrefixes(slug)) {
    rmSync(join(tree, prefix), { recursive: true, force: true });
    const live = join(REPO_ROOT, prefix);
    if (!existsSync(live)) continue;
    for (const rel of walkFiles(live)) copyInto(REPO_ROOT, tree, `${prefix}${rel}`);
  }
  return ownedHashes(REPO_ROOT, slug);
}

/** Pristine copies of the widget's live files as of prepare — the only way to
    put the live tree back if a harness writes into it directly (some CLIs
    resolve paths against their own project root, and a model can always type
    an absolute path). Cheap: a widget is a handful of small files. */
function saveBaseCopies(dir: string, tree: string, base: Hashes): void {
  const baseDir = join(dir, "base");
  rmSync(baseDir, { recursive: true, force: true });
  for (const rel of Object.keys(base)) {
    const from = join(tree, rel);
    if (!existsSync(from)) continue;
    const dest = join(baseDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(from, dest);
  }
}

function readState(dir: string): WorkbenchState | null {
  try {
    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf-8")) as WorkbenchState;
    return state && typeof state.base === "object" ? state : null;
  } catch {
    return null;
  }
}

function writeState(dir: string, state: WorkbenchState): void {
  writeFileSync(join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

// ─── lifecycle ────────────────────────────────────────────────────────────

/** Create or refresh the workbench for `slug` so it mirrors the live project,
    keeping a pending (not yet applied) draft of the widget's own files unless
    the live widget changed underneath it. */
export async function prepareWorkbench(slug: string): Promise<Workbench> {
  const dir = workbenchDir(slug);
  const tree = join(dir, "tree");
  const state = existsSync(tree) ? readState(dir) : null;
  const created = !state;
  if (created) rmSync(dir, { recursive: true, force: true });
  mkdirSync(tree, { recursive: true });

  for (const link of SYMLINKED) {
    const target = join(REPO_ROOT, link);
    const path = join(tree, link);
    if (!existsSync(target) || existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(target, path);
  }

  // non-owned files: mirror live exactly
  const liveFiles = await listLiveFiles();
  const liveSet = new Set(liveFiles);
  for (const rel of liveFiles) {
    if (isOwned(slug, rel) || isSiblingWidget(slug, rel)) continue;
    if (!sameContent(join(REPO_ROOT, rel), join(tree, rel))) copyInto(REPO_ROOT, tree, rel);
  }
  for (const rel of walkFiles(tree, (r) => SYMLINKED.includes(r))) {
    if (isOwned(slug, rel) || (liveSet.has(rel) && !isSiblingWidget(slug, rel))) continue;
    unlinkSync(join(tree, rel));
    removeEmptyParents(tree, rel);
  }

  // owned files: per-file three-way between base, draft and live
  let base: Hashes;
  let discardedDraft = false;
  if (!state) {
    base = resetOwnedFromLive(tree, slug);
  } else {
    base = state.base;
    const draft = ownedHashes(tree, slug);
    const live = ownedHashes(REPO_ROOT, slug);
    const keys = new Set([...Object.keys(base), ...Object.keys(draft), ...Object.keys(live)]);
    const conflict = [...keys].some((k) => draft[k] !== base[k] && live[k] !== base[k] && draft[k] !== live[k]);
    if (conflict) {
      base = resetOwnedFromLive(tree, slug);
      discardedDraft = true;
    } else {
      for (const k of keys) {
        if (draft[k] !== base[k]) continue; // draft changed it — keep the draft's version
        if (live[k] === base[k]) continue;
        // untouched in the draft but changed live (e.g. update-meta) — take live's
        if (live[k]) copyInto(REPO_ROOT, tree, k);
        else {
          rmSync(join(tree, k), { force: true });
          removeEmptyParents(tree, k);
        }
        if (live[k]) base[k] = live[k];
        else delete base[k];
      }
    }
  }

  writeState(dir, { repo: REPO_ROOT, base });
  saveBaseCopies(dir, tree, base);
  return { slug, tree, created, discardedDraft };
}

/** hash of every regular file in the tree (symlinked dirs skipped) */
export function snapshotTree(tree: string): Hashes {
  const hashes: Hashes = {};
  for (const rel of walkFiles(tree, (r) => SYMLINKED.includes(r))) {
    const hash = hashFile(join(tree, rel));
    if (hash) hashes[rel] = hash;
  }
  return hashes;
}

/** Paths the harness changed outside the widget's owned paths since `before`.
    Each is put back to the live tree's version so the mirror stays faithful;
    the list is returned for the audit report. Registry/map files are reverted
    silently — the harness is told not to write them and registration is ours. */
export function revertOutsideChanges(ws: Workbench, before: Hashes): string[] {
  const after = snapshotTree(ws.tree);
  const reported: string[] = [];
  for (const rel of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[rel] === after[rel] || isOwned(ws.slug, rel)) continue;
    if (existsSync(join(REPO_ROOT, rel)) && !isSiblingWidget(ws.slug, rel)) copyInto(REPO_ROOT, ws.tree, rel);
    else {
      rmSync(join(ws.tree, rel), { force: true });
      removeEmptyParents(ws.tree, rel);
    }
    if (!rel.startsWith("config/custom")) reported.push(rel);
  }
  return reported.sort();
}

export type LiveEscape = { rel: string; savedTo: string | null };

/** Undo writes a harness made straight into the live tree during a run.
    Anything that changed there since prepare is put back from the pristine
    base copy — after the harness's version is kept aside under the workbench's
    `escaped/` folder, so nothing it wrote is lost. Returns what it undid. */
export function restoreLiveEscapes(ws: Workbench): LiveEscape[] {
  const dir = workbenchDir(ws.slug);
  const base = readState(dir)?.base ?? {};
  const live = ownedHashes(REPO_ROOT, ws.slug);
  const escapes: LiveEscape[] = [];
  for (const rel of new Set([...Object.keys(base), ...Object.keys(live)])) {
    if (live[rel] === base[rel]) continue;
    let savedTo: string | null = null;
    if (live[rel]) {
      savedTo = join(dir, "escaped", rel);
      mkdirSync(dirname(savedTo), { recursive: true });
      copyFileSync(join(REPO_ROOT, rel), savedTo);
    }
    const baseCopy = join(dir, "base", rel);
    if (existsSync(baseCopy)) {
      const dest = join(REPO_ROOT, rel);
      mkdirSync(dirname(dest), { recursive: true });
      const tmp = `${dest}.${randomBytes(4).toString("hex")}.wbtmp`;
      copyFileSync(baseCopy, tmp);
      renameSync(tmp, dest);
    } else {
      // the file didn't exist before this run — the harness created it live
      rmSync(join(REPO_ROOT, rel), { force: true });
      removeEmptyParents(REPO_ROOT, rel);
    }
    escapes.push({ rel, savedTo });
  }
  return escapes;
}

/** true when the draft has changes not yet applied to the live tree */
export function hasPendingDraft(ws: Workbench): boolean {
  const state = readState(workbenchDir(ws.slug));
  return !!state && !sameHashes(ownedHashes(ws.tree, ws.slug), state.base);
}

/** `tsc --noEmit` in the workbench; only diagnostics inside this widget's own
    paths count, so an unrelated broken widget never fails this one. */
export function runWorkbenchTsc(ws: Workbench): Promise<{ errors: string[] }> {
  return new Promise((resolveTsc) => {
    const child = spawn("npx", ["tsc", "--noEmit", "--pretty", "false"], {
      cwd: ws.tree,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));
    child.on("close", (code) => {
      if (code === 0) return resolveTsc({ errors: [] });
      const prefixes = ownedPrefixes(ws.slug);
      resolveTsc({ errors: output.split("\n").filter((line) => prefixes.some((p) => line.startsWith(p))) });
    });
    child.on("error", () => resolveTsc({ errors: ["TypeScript validation could not start. Check that the TypeScript toolchain is installed."] }));
  });
}

export type ApplyPlan = {
  /** added or modified owned files, written into the live tree */
  writes: string[];
  /** owned files the draft removed */
  deletes: string[];
};

/** What applying the draft would change in the live tree — or a conflict when
    a file the draft changed was also changed live since the draft's base. */
export function planApply(ws: Workbench): { ok: true; plan: ApplyPlan } | { ok: false; conflicts: string[] } {
  const state = readState(workbenchDir(ws.slug));
  const base = state?.base ?? {};
  const draft = ownedHashes(ws.tree, ws.slug);
  const live = ownedHashes(REPO_ROOT, ws.slug);
  const writes: string[] = [];
  const deletes: string[] = [];
  const conflicts: string[] = [];
  for (const rel of new Set([...Object.keys(base), ...Object.keys(draft)])) {
    if (draft[rel] === base[rel]) continue;
    if (live[rel] !== base[rel] && live[rel] !== draft[rel]) {
      conflicts.push(rel);
      continue;
    }
    if (draft[rel]) {
      if (live[rel] !== draft[rel]) writes.push(rel);
    } else if (live[rel]) {
      deletes.push(rel);
    }
  }
  if (conflicts.length) return { ok: false, conflicts: conflicts.sort() };
  // data files before code, so a component never lands before its manifest
  writes.sort((a, b) => Number(a.endsWith(".tsx")) - Number(b.endsWith(".tsx")) || a.localeCompare(b));
  return { ok: true, plan: { writes, deletes: deletes.sort() } };
}

/** Write each planned file into the live tree via temp file + rename, so the
    dev server only ever sees complete files. Deletions are separate
    (applyDeletes) so the caller can repoint the component map first. */
export function applyWrites(ws: Workbench, plan: ApplyPlan): void {
  for (const rel of plan.writes) {
    const dest = join(REPO_ROOT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    const tmp = `${dest}.${randomBytes(4).toString("hex")}.wbtmp`;
    copyFileSync(join(ws.tree, rel), tmp);
    renameSync(tmp, dest);
  }
}

export function applyDeletes(plan: ApplyPlan): void {
  for (const rel of plan.deletes) {
    rmSync(join(REPO_ROOT, rel), { force: true });
    removeEmptyParents(REPO_ROOT, rel);
  }
}

/** record the draft as the new agreed base (call after a successful apply) */
export function commitBase(ws: Workbench): void {
  const dir = workbenchDir(ws.slug);
  const base = ownedHashes(ws.tree, ws.slug);
  writeState(dir, { repo: REPO_ROOT, base });
  saveBaseCopies(dir, ws.tree, base);
}

/** Throw away the widget's draft: its owned files in the tree go back to
    the live version and nothing stays pending. With `keepApi: false` (the
    default) the draft ends up identical to live; import calls it with
    `{ keepApi }` first to clear the widget folder (and the API route only when
    the archive brings its own) before unpacking over it. */
export function discardDraft(ws: Workbench, opts: { keepApi?: boolean } = {}): void {
  const dir = workbenchDir(ws.slug);
  const base = resetOwnedFromLive(ws.tree, ws.slug);
  writeState(dir, { repo: REPO_ROOT, base });
  const [widgetPrefix, apiPrefix] = ownedPrefixes(ws.slug);
  if (opts.keepApi !== undefined) {
    rmSync(join(ws.tree, widgetPrefix), { recursive: true, force: true });
    if (!opts.keepApi) rmSync(join(ws.tree, apiPrefix), { recursive: true, force: true });
  }
}

export function removeWorkbench(slug: string): void {
  try {
    rmSync(workbenchDir(slug), { recursive: true, force: true });
  } catch {
    // best-effort — a leftover workbench is harmless and re-seeded on next use
  }
}

/** absolute path of the custom-widgets folder inside a workbench tree */
export function workbenchCustomDir(ws: Workbench): string {
  return join(ws.tree, "components", "widgets", "custom");
}
