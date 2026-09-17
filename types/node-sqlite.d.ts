// Minimal typings for Node's built-in SQLite (node:sqlite, stable enough since
// Node 22; the hub runs Node 24). @types/node is still v20 here, which predates
// it — declaring only what lib/uptimeKuma.ts uses keeps that dependency where
// it is instead of bumping types for the whole project.
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    prepare(sql: string): { all(...params: unknown[]): unknown[] };
    close(): void;
  }
}
