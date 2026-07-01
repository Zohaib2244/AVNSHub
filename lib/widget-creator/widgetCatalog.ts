// Built from the live manifest registries (never hand-maintained, so it can't
// drift) — hands the LLM the full list of widgets that already exist on this
// canvas so brainstorming/build prompts don't need to Glob/Read config files
// or components/widgets/* to discover it themselves.
import { WIDGETS } from "@/config/widgets";
import { readRegistry } from "@/lib/widget-creator/customRegistry";

/** "id — title" for every built-in + custom widget, one per line. */
export function buildWidgetCatalog(): string {
  const builtIn = Object.values(WIDGETS).map((w) => `- ${w.id} — "${w.title}"`);
  const custom = Object.entries(readRegistry()).map(([id, entry]) => `- ${id} — "${entry.title}" (custom)`);
  return [...builtIn, ...custom].join("\n");
}

/** the catalog wrapped with instructions telling the LLM this list is
    complete/current so it doesn't waste turns re-discovering it. */
export function buildWidgetCatalogSection(): string {
  return `## Widgets that already exist on this canvas

${buildWidgetCatalog()}

This list is complete and current as of this request — do not Glob/Read config files or components/widgets/* to rediscover it, and don't suggest a duplicate of anything on it.`;
}
