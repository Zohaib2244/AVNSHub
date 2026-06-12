"use client";

// Generic fallback for a widget squeezed below its smallest supported size by
// the cascade engine (lib/gridCascade.ts): the widget's normal content renders
// underneath as a blurred, dimmed ghost, with the manifest icon centered on
// top as a glanceable badge.

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export function MicroView({ Content, Icon, title }: { Content: ComponentType; Icon: LucideIcon; title: string }) {
  return (
    <div className="micro-view" title={title}>
      <div className="micro-ghost" aria-hidden="true">
        <Content />
      </div>
      <div className="micro-badge">
        <Icon size={16} strokeWidth={1.75} />
      </div>
    </div>
  );
}
