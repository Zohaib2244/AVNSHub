"use client";

import { FileText, Globe, Pencil, Search, Terminal, Wrench } from "lucide-react";

function basename(value: string): string {
  const cleaned = value.trim();
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned;
}

function truncate(value: string, max = 42): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function toolLabel(tool: string, detail: string) {
  const lower = tool.toLowerCase();
  if (lower === "read") return { verb: "reading", Icon: FileText, detail: basename(detail) };
  if (lower === "write" || lower === "edit" || lower === "multiedit") return { verb: "writing", Icon: Pencil, detail: basename(detail) };
  if (lower === "bash") return { verb: "running", Icon: Terminal, detail: truncate(detail) };
  if (lower === "glob" || lower === "grep" || lower === "rg") return { verb: "searching", Icon: Search, detail: truncate(detail || tool) };
  if (lower.startsWith("web")) return { verb: "browsing", Icon: Globe, detail: truncate(detail || "web") };
  return { verb: tool, Icon: Wrench, detail: truncate(detail) };
}

export function renderMessageText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, index) => {
    const match = line.match(/^\[tool: (\w+)\](?:\s(.*))?$/);
    if (!match) {
      return (
        <span key={index} className="wc-text-line">
          {line}
          {index < lines.length - 1 ? "\n" : ""}
        </span>
      );
    }

    const [, tool, rawDetail = ""] = match;
    const { verb, Icon, detail } = toolLabel(tool, rawDetail);
    return (
      <span key={index} className="wc-tool-chip" title={line}>
        <Icon size={11} strokeWidth={2} />
        <span>{verb}</span>
        {detail && <span className="wc-tool-chip-detail">{detail}</span>}
      </span>
    );
  });
}
