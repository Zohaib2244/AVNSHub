export type SkillSyncOptions = {
  log?: (message: string) => void;
};

export declare const SKILL_DEFINITIONS: Array<{
  name: string;
  description: string;
  sourceFile: string;
}>;

export declare function writeSkill(
  name: string,
  description: string,
  sourceFile: string,
  options?: SkillSyncOptions,
): Promise<string[]>;

export declare function syncWidgetSkills(options?: SkillSyncOptions): Promise<string[]>;
