"use client";

// Ctrl/Cmd+K command palette — every Hub Core action (and a few Hub Core
// can only reach three clicks deep) without opening anything first: switch
// canvas, toggle edit mode, jump straight to a settings section, change the
// theme or palette, snapshot, export or reset the layout.
//
// Mounted by LayoutProvider next to HubDialog, so it works whether or not the
// control deck is out. Its open state lives in the provider (`paletteOpen`):
// the deck's own Escape handlers read it and stand down while the palette is
// up, so one Escape closes one thing.
//
// Two places it deliberately does NOT take Ctrl+K:
//   · the NutBot shell (.term-xterm) — Ctrl+K is readline's kill-line there,
//     and a real terminal must keep its real bindings;
//   · while a HubDialog confirm is up or a widget is installing — both are
//     modal, and a palette on top of either would be reaching around them.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CornerDownLeft,
  Download,
  LayoutGrid,
  Lock,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sun,
  SunMoon,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useLayout } from "@/components/dashboard/LayoutProvider";
import { CanvasGlyph, CREATE_POPOVER_KEY, requestCanvasSwitch } from "@/components/dashboard/CanvasSwitcher";
import { getCanvases, getServerCanvases, subscribeCanvases, type Canvas } from "@/lib/canvases";
import {
  getPalette,
  getServerPalette,
  getServerThemeMode,
  getThemeMode,
  setPalette,
  setThemeMode,
  subscribeTheme,
  type ThemeMode,
} from "@/lib/theme";
import { THEME_PACKS } from "@/config/themes";
import { SETTINGS_SECTIONS } from "@/config/hubSettings";
import { exportSlotLayout, resetSlotLayout } from "@/lib/slotLayout";
import { snapshotCanvas } from "@/lib/snapshotCanvas";
import { getDialogConfig, showHubDialog } from "@/lib/hubDialog";

type Command = {
  id: string;
  group: string;
  label: string;
  /** right-hand detail: the current state, or what the action affects */
  hint?: string;
  /** extra words that should find it, beyond its group and label */
  keywords?: string;
  icon?: LucideIcon;
  canvas?: Canvas;
  run: () => void;
};

const THEME_MODES: { mode: ThemeMode; Icon: LucideIcon }[] = [
  { mode: "light", Icon: Sun },
  { mode: "auto", Icon: SunMoon },
  { mode: "dark", Icon: Moon },
];

/** every word of the query must appear somewhere in the command — order-free,
    so "dark theme" and "theme dark" both land, and nothing is fuzzy enough to
    surprise */
function matches(cmd: Command, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${cmd.group} ${cmd.label} ${cmd.keywords ?? ""}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export function CommandPalette() {
  const {
    paletteOpen: open,
    setPaletteOpen: setOpen,
    editMode,
    startEdit,
    lockLayout,
    resetLayout,
    setHubCoreTab,
    setSettingsSection,
    setActivePopover,
    isInstalling,
  } = useLayout();

  const { canvases, activeId } = useSyncExternalStore(subscribeCanvases, getCanvases, getServerCanvases);
  const themeMode = useSyncExternalStore(subscribeTheme, getThemeMode, getServerThemeMode);
  const palette = useSyncExternalStore(subscribeTheme, getPalette, getServerPalette);

  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** where focus was before opening — handed back on a plain dismiss, not
      after running a command (the command may have put focus somewhere on
      purpose, e.g. the new-canvas name field) */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // ── the global chord ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k" || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      if (target?.closest?.(".term-xterm")) return;
      if (isInstalling || getDialogConfig() !== null) return;
      e.preventDefault();
      setOpen((wasOpen) => {
        if (!wasOpen) returnFocusRef.current = document.activeElement as HTMLElement | null;
        return !wasOpen;
      });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isInstalling, setOpen]);

  // an install starting underneath the palette takes the page — close it
  const [prevInstalling, setPrevInstalling] = useState(isInstalling);
  if (isInstalling !== prevInstalling) {
    setPrevInstalling(isInstalling);
    if (isInstalling && open) setOpen(false);
  }

  // every open starts clean, however it was opened (chord or deck button)
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setSel(0);
    }
  }

  // ── the command list, rebuilt from live state each render ─────────────
  const commands = useMemo<Command[]>(() => {
    const openSettings = (section: (typeof SETTINGS_SECTIONS)[number]["id"]) => () => {
      setSettingsSection(section);
      setHubCoreTab("settings");
    };
    return [
      ...canvases.map<Command>((canvas) => ({
        id: `canvas:${canvas.id}`,
        group: "canvas",
        label: canvas.name,
        hint: canvas.id === activeId ? "current" : undefined,
        keywords: "switch go to",
        canvas,
        run: () => {
          if (canvas.id !== activeId) requestCanvasSwitch(canvas.id);
        },
      })),
      {
        id: "canvas:new",
        group: "canvas",
        label: "new canvas…",
        keywords: "add create",
        icon: Plus,
        run: () => setActivePopover(CREATE_POPOVER_KEY),
      },

      editMode
        ? { id: "edit", group: "hub core", label: "exit edit mode", keywords: "lock done view", icon: Lock, run: lockLayout }
        : { id: "edit", group: "hub core", label: "enter edit mode", keywords: "rearrange move", icon: Wrench, run: startEdit },
      {
        id: "widgets",
        group: "hub core",
        label: "widget manager",
        keywords: "add remove install import",
        icon: LayoutGrid,
        run: () => setHubCoreTab("widgets"),
      },
      {
        id: "snapshot",
        group: "hub core",
        label: "snapshot canvas",
        hint: "to clipboard",
        keywords: "screenshot copy image",
        icon: Camera,
        run: () => void snapshotCanvas(),
      },

      ...SETTINGS_SECTIONS.map<Command>((section) => ({
        id: `settings:${section.id}`,
        group: "settings",
        label: section.label,
        keywords: "open preferences",
        icon: Settings,
        run: openSettings(section.id),
      })),

      ...THEME_MODES.map<Command>(({ mode, Icon }) => ({
        id: `theme:${mode}`,
        group: "theme",
        label: `${mode} mode`,
        hint: themeMode === mode ? "on" : undefined,
        icon: Icon,
        run: () => setThemeMode(mode),
      })),
      ...THEME_PACKS.map<Command>((pack) => ({
        id: `palette:${pack.id}`,
        group: "palette",
        label: pack.label,
        hint: palette === pack.id ? "on" : undefined,
        keywords: "colour color theme",
        icon: Palette,
        run: () => setPalette(pack.id),
      })),

      {
        id: "layout:export",
        group: "layout",
        label: "export layout",
        hint: "json",
        keywords: "download backup save",
        icon: Download,
        run: exportSlotLayout,
      },
      {
        // one keystroke from the palette is too close to a destructive reset
        // to run it outright — it goes through the same confirm as everything
        // else that throws work away
        id: "layout:reset",
        group: "layout",
        label: "reset layout & widget config…",
        keywords: "default clear",
        icon: RotateCcw,
        run: () =>
          showHubDialog({
            title: "reset this canvas's layout?",
            body: "Every widget goes back to the default arrangement and loses its per-widget settings. This can't be undone.",
            confirmLabel: "reset",
            onConfirm: () => {
              resetLayout();
              resetSlotLayout();
            },
          }),
      },
    ];
  }, [
    canvases,
    activeId,
    editMode,
    themeMode,
    palette,
    startEdit,
    lockLayout,
    resetLayout,
    setHubCoreTab,
    setSettingsSection,
    setActivePopover,
  ]);

  const hits = useMemo(() => commands.filter((c) => matches(c, query)), [commands, query]);
  const active = hits.length === 0 ? -1 : Math.min(sel, hits.length - 1);

  // keep the highlighted row in view as the arrows walk past the fold
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-cmd-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function dismiss() {
    setOpen(false);
    const back = returnFocusRef.current;
    returnFocusRef.current = null;
    // after the exit animation's first frame, so focus doesn't land on a
    // node that is about to unmount
    if (back?.isConnected) window.requestAnimationFrame(() => back.focus());
  }

  function run(cmd: Command | undefined) {
    if (!cmd) return;
    returnFocusRef.current = null;
    setOpen(false);
    // after the close commits, so a command that opens something else (a
    // settings tab, the new-canvas flyout, a confirm) isn't racing the
    // palette's own teardown for focus or for Escape
    window.setTimeout(cmd.run, 0);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    const n = hits.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (n) setSel((active + 1) % n);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (n) setSel((active - 1 + n) % n);
        break;
      case "Home":
        if (n) {
          e.preventDefault();
          setSel(0);
        }
        break;
      case "End":
        if (n) {
          e.preventDefault();
          setSel(n - 1);
        }
        break;
      case "Enter":
        e.preventDefault();
        run(hits[active]);
        break;
      case "Escape":
        e.preventDefault();
        // first Escape clears a typed query, the next one closes
        if (query) {
          setQuery("");
          setSel(0);
        } else {
          dismiss();
        }
        break;
      case "Tab":
        // the input is the palette's only focus stop — keep focus inside
        e.preventDefault();
        break;
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cmdk"
          className="cmdk-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
        >
          <motion.div
            className="cmdk"
            role="dialog"
            aria-modal="true"
            aria-label="command palette"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <div className="cmdk-input-row">
              <Search size={14} strokeWidth={1.75} aria-hidden />
              <input
                ref={inputRef}
                autoFocus
                className="cmdk-input"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSel(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="type a command — canvas, theme, palette, settings…"
                spellCheck={false}
                autoComplete="off"
                role="combobox"
                aria-expanded="true"
                aria-controls="cmdk-list"
                aria-activedescendant={active >= 0 ? `cmdk-opt-${active}` : undefined}
              />
              <kbd className="cmdk-kbd">esc</kbd>
            </div>

            <ul ref={listRef} id="cmdk-list" className="cmdk-list" role="listbox">
              {hits.length === 0 && <li className="cmdk-empty">no command matches “{query}”</li>}
              {hits.map((cmd, i) => {
                const firstOfGroup = i === 0 || hits[i - 1].group !== cmd.group;
                const Icon = cmd.icon;
                return (
                  <li key={cmd.id} role="presentation">
                    {firstOfGroup && <div className="cmdk-group">{cmd.group}</div>}
                    <div
                      id={`cmdk-opt-${i}`}
                      data-cmd-index={i}
                      role="option"
                      aria-selected={i === active}
                      className={`cmdk-item${i === active ? " selected" : ""}`}
                      // mousemove, not mouseenter: the list scrolling under a
                      // still pointer must not steal the keyboard's selection
                      onMouseMove={() => {
                        if (i !== active) setSel(i);
                      }}
                      onClick={() => run(cmd)}
                    >
                      <span className="cmdk-item-icon" aria-hidden>
                        {cmd.canvas ? <CanvasGlyph canvas={cmd.canvas} /> : Icon ? <Icon size={14} strokeWidth={1.75} /> : null}
                      </span>
                      <span className="cmdk-item-label">{cmd.label}</span>
                      {cmd.hint && <span className="cmdk-item-hint">{cmd.hint}</span>}
                      {i === active && <CornerDownLeft size={12} strokeWidth={1.75} className="cmdk-item-enter" aria-hidden />}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="cmdk-foot" aria-hidden>
              <span>
                <kbd className="cmdk-kbd">↑</kbd>
                <kbd className="cmdk-kbd">↓</kbd> move
              </span>
              <span>
                {/* an icon, not the ↵ character — neither house font has
                    that glyph, and it rendered as a tofu box */}
                <kbd className="cmdk-kbd">
                  <CornerDownLeft size={10} strokeWidth={2} />
                </kbd>{" "}
                run
              </span>
              <span>
                <kbd className="cmdk-kbd">esc</kbd> {query ? "clear" : "close"}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
