import type { HarnessId } from "./harnessAdapters";

export type ModelChoice = { model: string; effort: "default" | "low" | "medium" | "high" };
export type ModelDefaults = Record<HarnessId, ModelChoice>;
export const DEFAULT_MODELS: ModelDefaults = {
  claude: { model: "", effort: "default" },
  codex: { model: "", effort: "default" },
  opencode: { model: "", effort: "default" },
};
export const MODEL_OPTIONS = {
  claude: [
    { id: "haiku", label: "Haiku", strength: "Fast, efficient; simple tasks" },
    { id: "sonnet", label: "Sonnet", strength: "Everyday coding and widget builds" },
    { id: "opus", label: "Opus", strength: "Complex reasoning and difficult fixes" },
  ],
  codex: [
    { id: "gpt-5.6-luna", label: "Luna", strength: "Fast; clear, repeatable tasks" },
    { id: "gpt-5.6-terra", label: "Terra", strength: "Balanced everyday coding" },
    { id: "gpt-5.6-sol", label: "Sol", strength: "Complex coding and deeper analysis" },
    { id: "gpt-6-astra", label: "Astra", strength: "Hardest work across multiple steps" },
  ],
};

export function sanitizeModelDefaults(raw: unknown): ModelDefaults {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(DEFAULT_MODELS).map((id) => {
    const value = source[id] as Partial<ModelChoice> | undefined;
    // IDs are passed as individual argv values. Restrict metacharacters also
    // because Windows CLI shims currently require shell:true.
    const model = typeof value?.model === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._/:\[\]-]{0,119}$/.test(value.model) ? value.model : "";
    const supportsEffort = id === "codex" && MODEL_OPTIONS.codex.some((m) => m.id === model)
      || id === "claude" && ["sonnet", "opus"].includes(model);
    const effort = supportsEffort && ["low", "medium", "high"].includes(value?.effort ?? "") ? value!.effort : "default";
    return [id, { model, effort }];
  })) as ModelDefaults;
}

export function modelArgs(harness: HarnessId, choice: ModelChoice): string[] {
  const safe = sanitizeModelDefaults({ [harness]: choice })[harness];
  const args = safe.model ? ["--model", safe.model] : [];
  if (safe.effort !== "default") {
    if (harness === "claude") args.push("--effort", safe.effort);
    if (harness === "codex") args.push("-c", `model_reasoning_effort="${safe.effort}"`);
  }
  return args;
}
