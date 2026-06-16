// Thin merger — joins the DATA (customRegistry.json) with the CODE
// (customComponentMap.tsx) into the CUSTOM_WIDGETS manifest the rest of the app
// imports. Nothing else in the codebase needs to know the data and components
// live in separate files now.
//
// CRUD surface:
//   create/import → append entry to customRegistry.json + 1 line to customComponentMap.tsx
//   delete        → remove entry from customRegistry.json (UI updates instantly) then the line
//   export        → read-only
import * as Icons from "lucide-react";
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { WidgetManifest, SettingsField } from "./widgets";
import registry from "./customRegistry.json";
import { CUSTOM_COMPONENT_MAP } from "./customComponentMap";

type RegistryEntry = {
  title: string;
  iconName: string;
  sizes: WidgetManifest["sizes"];
  orientations: WidgetManifest["orientations"];
  defaults: WidgetManifest["defaults"];
  settings?: SettingsField[];
  flags?: WidgetManifest["flags"];
};

const registryEntries = registry as Record<string, RegistryEntry>;
const iconLib = Icons as unknown as Record<string, LucideIcon>;
const fallback: ComponentType = () => null;

export const CUSTOM_WIDGETS: Record<string, WidgetManifest> = Object.fromEntries(
  Object.entries(registryEntries).map(([id, meta]) => [
    id,
    {
      id,
      title: meta.title,
      icon: iconLib[meta.iconName] ?? Icons.Box,
      component: CUSTOM_COMPONENT_MAP[id] ?? fallback,
      sizes: meta.sizes,
      orientations: meta.orientations,
      defaults: meta.defaults,
      settings: meta.settings,
      flags: meta.flags,
    } satisfies WidgetManifest,
  ]),
);

export const CUSTOM_DEFAULT_ORDER: string[] = Object.keys(registryEntries);
