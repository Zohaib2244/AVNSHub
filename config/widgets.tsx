import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Cpu,
  Database,
  Download,
  Gamepad2,
  GitCommitHorizontal,
  HardDrive,
  IdCard,
  LayoutGrid,
  Link2,
  Music,
  Network,
  Server,
  SlidersHorizontal,
  SquareTerminal,
  Trophy,
  Tv,
} from "lucide-react";
import { ClockWidget } from "@/components/ClockWidget";
import { QuickLinks } from "@/components/QuickLinks";
import { UptimeMilestones } from "@/components/UptimeMilestones";
import { HomelabStatus, HomelabStatusMore } from "@/components/HomelabStatus";
import { ServerStats, ServerStatsMore } from "@/components/ServerStats";
import { DiskStorage, DiskStorageMore } from "@/components/DiskStorage";
import { NetworkStats, NetworkStatsMore } from "@/components/NetworkStats";
import { Jellyfin, JellyfinMore } from "@/components/Jellyfin";
import { ArrStack, ArrStackMore } from "@/components/ArrStack";
import { StorageApps } from "@/components/StorageApps";
import { NutBotFaceWidget } from "@/components/widgets/NutBotFaceWidget";
import { WidgetManager } from "@/components/widgets/WidgetManager";
import { IdentityBlock } from "@/components/IdentityBlock";
import { NowPlaying } from "@/components/NowPlaying";
import { CurrentlyPlaying } from "@/components/CurrentlyPlaying";
import { GitHubActivity, GitHubActivityMore } from "@/components/GitHubActivity";
import { SessionTracker, SessionTrackerMore } from "@/components/SessionTracker";
import { HubSettings } from "@/components/widgets/HubSettings";

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
  | { key: string; label: string; type: "number"; default: number; min?: number; max?: number };

export type SettingsValues = Record<string, string | number | boolean>;

export const FRAMEWORK_SETTINGS: SettingsField[] = [
  { key: "hoverExpand", label: "slot hover expand", type: "toggle", default: false },
];

export type WidgetManifest = {
  /** stable unique identifier — the object key, the layout/persistence key,
      and the DOM id of the card. Must be unique across the whole registry. */
  id: string;
  /** human-readable name, shown as the card label and in the widget manager */
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
  quicklinks: {
    id: "quicklinks",
    title: "quicklinks",
    icon: Link2,
    component: QuickLinks,
    sizes: ["S", "M"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
    flags: { className: "quicklinks-compact" },
  },
  milestones: {
    id: "milestones",
    title: "uptime milestones",
    icon: Trophy,
    component: UptimeMilestones,
    sizes: ["S", "M"],
    orientations: ["v"],
    defaults: { size: "S", orientation: "v" },
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
    title: "server stats",
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
  jellyfin: {
    id: "jellyfin",
    title: "jellyfin",
    icon: Tv,
    component: Jellyfin,
    detail: JellyfinMore,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
    flags: { accent: true },
  },
  "arr-stack": {
    id: "arr-stack",
    title: "arr stack",
    icon: Download,
    component: ArrStack,
    detail: ArrStackMore,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
  },
  "storage-apps": {
    id: "storage-apps",
    title: "storage apps",
    icon: Database,
    component: StorageApps,
    sizes: ["S", "M"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
  },
  nutbot: {
    id: "nutbot",
    title: "nutbot v1.4",
    icon: SquareTerminal,
    component: NutBotFaceWidget,
    // no `detail` — the component renders the face at S/M and the full
    // terminal at L (see NutBotFaceWidget); a per-size layout example
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
  },
  identity: {
    id: "identity",
    title: "identity",
    icon: IdCard,
    component: IdentityBlock,
    sizes: ["M", "L"],
    orientations: ["h"],
    defaults: { size: "M", orientation: "h" },
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
    flags: { customHeader: true, className: "spotify-capsule" },
  },
  "currently-playing": {
    id: "currently-playing",
    title: "currently playing",
    icon: Gamepad2,
    component: CurrentlyPlaying,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "M", orientation: "v" },
    flags: { customHeader: true, className: "steam-card" },
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
    settings: [{ key: "flyoutCommits", label: "commits shown", type: "number", default: 5, min: 1, max: 15 }],
    flags: { customHeader: true, accent: true },
  },
  widgets: {
    id: "widgets",
    title: "widget manager",
    icon: LayoutGrid,
    component: WidgetManager,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "M", orientation: "v" },
  },
  "hub-settings": {
    id: "hub-settings",
    title: "avn hub settings",
    icon: SlidersHorizontal,
    component: HubSettings,
    // component renders quick controls at S/M and the full panel at L
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "h" },
  },
  tracker: {
    id: "tracker",
    title: "session tracker",
    icon: Gamepad2,
    component: SessionTracker,
    detail: SessionTrackerMore,
    sizes: ["S", "M", "L"],
    orientations: ["h", "v"],
    defaults: { size: "S", orientation: "v" },
  },
} satisfies Record<string, WidgetManifest>;

export type WidgetId = keyof typeof WIDGETS;

/** default grid order — instances flow into the grid in this sequence
    (dense auto-placement back-fills gaps) */
export const DEFAULT_ORDER: WidgetId[] = [
  "identity",
  "clock",
  "nutbot",
  "now-playing",
  "currently-playing",
  "github",
  "homelab",
  "server-stats",
  "disk-storage",
  "network-stats",
  "jellyfin",
  "arr-stack",
  "storage-apps",
  "quicklinks",
  "milestones",
  "tracker",
  "widgets",
  "hub-settings",
];
