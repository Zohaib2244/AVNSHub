// Regenerates every harness skill this project ships from its source-of-truth
// fragment files under lib/widget-creator/prompts/. Run this after editing
// either source.
import { syncWidgetSkills } from "../lib/widget-creator/skillSync.mjs";

await syncWidgetSkills({ log: (message) => console.log(message) });
