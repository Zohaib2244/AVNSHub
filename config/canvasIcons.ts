// Curated icon choices for AVN Hub Canvases — same idea as the custom widget
// creator's LUCIDE_SUGGESTIONS list (components/widgets/default/nutbot/creator/SettingsPane.tsx),
// but statically imported (no async DynamicIcon loading/flicker) since the
// set is small and fixed. A canvas with no icon falls back to the first
// letter of its name (see CanvasSwitcher.tsx) — these are purely optional.

import {
  Activity,
  Bell,
  Box,
  Briefcase,
  Camera,
  Clock,
  Cloud,
  Code,
  Compass,
  Cpu,
  Database,
  Eye,
  Film,
  Flag,
  Gamepad2,
  Globe,
  Heart,
  Home,
  Map,
  Music,
  Package,
  Rocket,
  Server,
  Smile,
  Star,
  Sun,
  Terminal,
  Tv,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { NutBotChip, NutBotFace, NutBotScreen } from "@/components/icons/NutBotIcons";

export const CANVAS_ICONS: Record<string, LucideIcon> = {
  NutBotFace,
  NutBotChip,
  NutBotScreen,
  Activity,
  Bell,
  Box,
  Briefcase,
  Camera,
  Clock,
  Cloud,
  Code,
  Compass,
  Cpu,
  Database,
  Eye,
  Film,
  Flag,
  Gamepad2,
  Globe,
  Heart,
  Home,
  Map,
  Music,
  Package,
  Rocket,
  Server,
  Smile,
  Star,
  Sun,
  Terminal,
  Tv,
  Wifi,
  Zap,
};

export const CANVAS_ICON_NAMES = Object.keys(CANVAS_ICONS);

export function isCanvasIconName(value: unknown): value is keyof typeof CANVAS_ICONS {
  return typeof value === "string" && value in CANVAS_ICONS;
}
