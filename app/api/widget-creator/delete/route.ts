import { NextResponse } from "next/server";
import { rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

function removeFromConfig(content: string, id: string): string {
  // Remove component import line (the one pointing to custom/<id>/)
  content = content.replace(
    new RegExp(`^import \\{[^}]+\\} from ["']@/components/widgets/custom/${id}/[^"']+["'];?\\r?\\n`, "m"),
    "",
  );

  // Remove manifest entry — generated files can occasionally have entries on
  // the same line (`},  next:`), so find a property boundary instead of
  // requiring a leading newline.
  const entryPattern = new RegExp(`(^|[,{]\\s*)(${id}|["']${id}["'])\\s*:\\s*{`, "m");
  const match = entryPattern.exec(content);
  if (match) {
    const markerIdx = match.index + match[1].length;
    let depth = 0;
    let i = markerIdx;
    while (i < content.length && content[i] !== "{") i++;
    while (i < content.length) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }
    // consume trailing comma + whitespace/newline
    let end = i + 1;
    if (content[end] === ",") end++;
    while (content[end] === " " || content[end] === "\t") end++;
    if (content[end] === "\r") end++;
    if (content[end] === "\n") end++;
    content = content.slice(0, markerIdx) + content.slice(end);
  }

  // Remove from order array — matches `  "id",\n` or `  "id"\n`
  content = content.replace(new RegExp(`^  "${id}",?\\r?\\n`, "m"), "");

  return content;
}

export async function POST(req: Request) {
  const body = await req.json() as { id?: string };
  const id = body.id;

  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // 1. Remove widget directory
  const widgetDir = join(ROOT, "components/widgets/custom", id);
  if (existsSync(widgetDir)) {
    rmSync(widgetDir, { recursive: true, force: true });
  }

  // 2. Update config/customWidgets.tsx
  const configPath = join(ROOT, "config/customWidgets.tsx");
  if (existsSync(configPath)) {
    const original = readFileSync(configPath, "utf-8");
    const updated = removeFromConfig(original, id);
    writeFileSync(configPath, updated, "utf-8");
  }

  return NextResponse.json({ ok: true });
}
