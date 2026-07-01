import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Clock,
  Cpu,
  GitCommitHorizontal,
  HardDrive,
  IdCard,
  Music,
  Network,
  Server,
  SquareTerminal,
  Star,
  StickyNote,
} from "lucide-react";
import { ClockWidget } from "@/components/widgets/default/identity/ClockWidget";
import { HomelabStatus, HomelabStatusMore } from "@/components/widgets/default/homelab/HomelabStatus";
import { ServerStats, ServerStatsMore } from "@/components/widgets/default/homelab/ServerStats";
import { DiskStorage, DiskStorageMore } from "@/components/widgets/default/homelab/DiskStorage";
import { NetworkStats, NetworkStatsMore } from "@/components/widgets/default/homelab/NetworkStats";
import { NutBotFaceWidget } from "@/components/widgets/default/nutbot/NutBotFaceWidget";
import { IdentityBlock } from "@/components/widgets/default/identity/IdentityBlock";
import { NowPlaying } from "@/components/widgets/default/media/NowPlaying";
import { GitHubActivity, GitHubActivityMore } from "@/components/widgets/default/github/GitHubActivity";
import { NotesWidget } from "@/components/widgets/default/notes/NotesWidget";
import { DotMatrixWidget } from "@/components/widgets/default/dot-matrix/DotMatrixWidget";
import { DictionaryWidget } from "@/components/widgets/default/dictionary/DictionaryWidget";
import { CUSTOM_WIDGETS, CUSTOM_DEFAULT_ORDER } from "./customWidgets";

/* ─── widget framework contracts ─────────────────────────────────────
   A widget = a content component + a manifest entry here. The shell
   (components/framework/WidgetShell.tsx) supplies the card chrome, label,
   and grid placement; per-instance overrides (size, orientation, settings)
   come from the layout store. Widgets are resizable (S/M/L × h/v, limited to
   what the manifest declares) and rearrangeable in edit mode. Slot Layout
   also has transient visual-only hover preview boxes; they must not mutate
   stored layout or replace a widget's size contract. A widget that wants a
   richer large layout reads useWidget().size and/or declares a `detail` component
   (rendered automatically at L size).

   See docs/CREATING_WIDGETS.md for the full authoring guide.
──────────────────────────────────────────────────────────────────── */

export type WidgetSize = "S" | "M" | "L";
export type Orientation = "h" | "v";

export type SettingsField =
  | { key: string; label: string; type: "toggle"; default: boolean }
  | { key: string; label: string; type: "select"; default: string; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "text"; default: string; placeholder?: string }
  // "password" is a text value rendered with a masked input — use it for API
  // keys/tokens/secrets entered in widget settings (stored client-side in the
  // layout, sent to that widget's own API route). Validated like text.
  | { key: string; label: string; type: "password"; default: string; placeholder?: string }
  | { key: string; label: string; type: "number"; default: number; min?: number; max?: number };

export type SettingsValues = Record<string, string | number | boolean>;

export const FRAMEWORK_SETTINGS: SettingsField[] = [
  { key: "hoverExpand", label: "slot hover expand", type: "toggle", default: false },
  {
    key: "hoverExpandAxis",
    label: "expand axis",
    type: "select",
    default: "both",
    options: [
      { value: "both", label: "both" },
      { value: "width", label: "width" },
      { value: "height", label: "height" },
    ],
  },
  {
    key: "cardBackdrop",
    label: "card backdrop",
    type: "select",
    default: "auto",
    options: [
      { value: "auto", label: "auto (widget default)" },
      { value: "solid", label: "solid" },
      { value: "blur", label: "blur" },
      { value: "transparent", label: "transparent" },
      { value: "glass", label: "glass" },
    ],
  },
  { key: "showHeader", label: "show name & icon", type: "toggle", default: true },
];

export type WidgetManifest = {
  /** stable unique identifier — the object key, the layout/persistence key,
      and the DOM id of the card. Must be unique across the whole registry. */
  id: string;
  /** human-readable name, shown as the card label and in Hub widget controls */
  title: string;
  icon: LucideIcon;
  /** card content only — no .block markup, no label, no fetch boilerplate.
      Reads placement/settings via useWidget(); render different markup per
      size for distinct S/M/L layouts. */
  component: ComponentType;
  /** optional extra content rendered by the shell BELOW the main content when
      the instance is at L size — the lowest-effort way to add a richer large
      layout (e.g. a detail list) without size-branching the main component */
  detail?: ComponentType;
  /** sizes/orientations this widget formats correctly in — these double as the
      resize limits surfaced in the per-widget settings popover */
  sizes: WidgetSize[];
  orientations: Orientation[];
  defaults: { size: WidgetSize; orientation: Orientation; hidden?: boolean };
  /** widget-specific options — drives the auto-generated settings form */
  settings?: SettingsField[];
  flags?: {
    /** no card chrome at all (identity namecard renders its own) */
    plainChrome?: boolean;
    /** card chrome but the content renders its own header */
    customHeader?: boolean;
    /** orange accent-left border */
    accent?: boolean;
    /** extra class on the .block element */
    className?: string;
  };
};

/** manifest settings schema → default values, overlaid with stored values
    (wrong types / unknown select options fall back to the field default) */
export function resolveSettings(manifest: WidgetManifest, stored?: SettingsValues): SettingsValues {
  const values: SettingsValues = {};
  for (const field of [...FRAMEWORK_SETTINGS, ...(manifest.settings ?? [])]) {
    const saved = stored?.[field.key];
    const valid =
      typeof saved === typeof field.default &&
      (field.type !== "select" || field.options.some((o) => o.value === saved));
    values[field.key] = valid ? (saved as string | number | boolean) : field.default;
  }
  return values;
}

/* ─── grid placement ─────────────────────────────────────────────
   size × orientation → [column span, row span] on the dashboard grid
   (6 tracks at full width; spans are clamped at narrower breakpoints —
   see useGridColumns + .widget-grid in globals.css) */
export const SPAN_MAP: Record<`${WidgetSize}-${Orientation}`, [cols: number, rows: number]> = {
  "S-h": [1, 1],
  "S-v": [1, 2],
  "M-h": [2, 1],
  "M-v": [2, 2],
  "L-h": [3, 2],
  "L-v": [2, 3],
};

export const WIDGETS = {
  clock: {
    id: "clock",
    title: "clock & date",
    icon: Clock,
    component: ClockWidget,
    sizes: ["S", "M"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "v" },
    settings: [
      { key: "showCalendar", label: "mini calendar", type: "toggle", default: true },
      { key: "showLofi", label: "lofi radio", type: "toggle", default: true },
    ],
  },
  homelab: {
    id: "homelab",
    title: "a very nutty home server",
    icon: Server,
    component: HomelabStatus,
    detail: HomelabStatusMore,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
    settings: [
      {
        key: "pollSeconds",
        label: "refresh every",
        type: "select",
        default: "60",
        options: [
          { value: "30", label: "30s" },
          { value: "60", label: "60s" },
          { value: "120", label: "2m" },
        ],
      },
    ],
  },
  "server-stats": {
    id: "server-stats",
    title: "system stats",
    icon: Cpu,
    component: ServerStats,
    detail: ServerStatsMore,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
  },
  "disk-storage": {
    id: "disk-storage",
    title: "disk storage",
    icon: HardDrive,
    component: DiskStorage,
    detail: DiskStorageMore,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
  },
  "network-stats": {
    id: "network-stats",
    title: "network stats",
    icon: Network,
    component: NetworkStats,
    detail: NetworkStatsMore,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
  },
  nutbot: {
    id: "nutbot",
    title: "nutbot v2.2",
    icon: SquareTerminal,
    component: NutBotFaceWidget,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
    flags: { className: "nutbot-block" },
  },
  identity: {
    id: "identity",
    title: "identity",
    icon: IdCard,
    component: IdentityBlock,
    sizes: ["M", "L"],
    orientations: ["h"],
    defaults: { size: "M", orientation: "h" },
    settings: [
      { key: "displayName", label: "display name", type: "text", default: "AVN Hub", placeholder: "Name to show" },
      { key: "tagline", label: "tagline", type: "text", default: "front page to your life", placeholder: "Short tagline" },
      { key: "initials", label: "initials", type: "text", default: "AVN", placeholder: "AVN" },
    ],
    flags: { plainChrome: true },
  },
  "now-playing": {
    id: "now-playing",
    title: "now playing",
    icon: Music,
    component: NowPlaying,
    sizes: ["S", "M", "L"],
    orientations: ["h"],
    defaults: { size: "M", orientation: "h" },
    // Spotify credentials — entered here per-widget; the server route falls back
    // to SPOTIFY_* env vars when a field is left blank. Run `npm run spotify:auth`
    // to obtain a refresh token.
    settings: [
      { key: "spotifyClientId", label: "spotify client id", type: "text", default: "", placeholder: "client id" },
      { key: "spotifyClientSecret", label: "spotify client secret", type: "password", default: "", placeholder: "client secret" },
      { key: "spotifyRefreshToken", label: "spotify refresh token", type: "password", default: "", placeholder: "refresh token" },
    ],
    flags: { customHeader: true, className: "spotify-capsule" },
  },
  github: {
    id: "github",
    title: "github activity",
    icon: GitCommitHorizontal,
    component: GitHubActivity,
    detail: GitHubActivityMore,
    sizes: ["S", "M", "L"],
    orientations: ["h"],
    defaults: { size: "M", orientation: "h" },
    // GitHub config — username drives which public activity is shown; token is
    // optional (raises rate limit 60→5000/hr). Server route falls back to
    // GITHUB_TOKEN env var + the built-in default username when blank.
    settings: [
      { key: "githubUsername", label: "github username", type: "text", default: "", placeholder: "octocat" },
      { key: "githubToken", label: "github token (optional)", type: "password", default: "", placeholder: "ghp_…" },
      { key: "flyoutCommits", label: "commits shown", type: "number", default: 5, min: 1, max: 15 },
    ],
    flags: { customHeader: true, accent: true },
  },
  notes: {
    id: "notes",
    title: "notes",
    icon: StickyNote,
    component: NotesWidget,
    sizes: ["M", "L"],
    orientations: ["h"],
    defaults: { size: "M", orientation: "h" },
    flags: { customHeader: true },
  },
  dictionary: {
    id: "dictionary",
    title: "dictionary",
    icon: BookOpen,
    component: DictionaryWidget,
    sizes: ["S", "M", "L"],
    orientations: ["h"],
    defaults: { size: "M", orientation: "h" },
    settings: [
      { key: "defaultWord", label: "default word", type: "text", default: "serendipity", placeholder: "serendipity" },
      { key: "showSuggestions", label: "spelling hints", type: "toggle", default: true },
      { key: "showSentence", label: "example sentence", type: "toggle", default: true },
      { key: "showPronunciation", label: "pronunciation", type: "toggle", default: true },
    ],
  },
  "dot-matrix": {
    id: "dot-matrix",
    title: "dot matrix",
    icon: Star,
    component: DotMatrixWidget,
    sizes: ["S", "M", "L"],
    orientations: ["h"],
    defaults: { size: "M", orientation: "h" },
    settings: [
      {
        key: "colorMode",
        label: "accent color",
        type: "select",
        default: "orange",
        options: [
          { value: "orange", label: "orange" },
          { value: "cyan", label: "cyan" },
        ],
      },
      {
        key: "interaction",
        label: "mouse mode",
        type: "select",
        default: "repel",
        options: [
          { value: "repel", label: "repel" },
          { value: "attract", label: "attract" },
        ],
      },
    ],
  },
} satisfies Record<string, WidgetManifest>;

export type WidgetId = keyof typeof WIDGETS;

/** look up a manifest by id — checks built-in registry first, then custom */
export function getManifest(id: string): WidgetManifest | undefined {
  return (WIDGETS as Record<string, WidgetManifest>)[id] ?? CUSTOM_WIDGETS[id];
}

/** default grid order — instances flow into the grid in this sequence
    (dense auto-placement back-fills gaps); custom widget ids appended at end */
export const DEFAULT_ORDER: string[] = [
  "identity",
  "clock",
  "nutbot",
  "now-playing",
  "github",
  "homelab",
  "server-stats",
  "disk-storage",
  "network-stats",
  "notes",
  "dictionary",
  "dot-matrix",
  ...CUSTOM_DEFAULT_ORDER,
];
