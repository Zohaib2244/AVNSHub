"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

type Props = {
  text: string;
  /** which side the popover opens toward — left sidebar content sits close to
      the frame edge, so it defaults to opening rightward */
  align?: "left" | "right";
};

/**
 * A small (i) affordance that reveals a mode's help text in a popover instead
 * of taking up permanent space in the panel — used by Plan/Ideate/Build's
 * left-sidebar panels so the space is free for actual content once there is any.
 */
export function ModeInfoButton({ text, align = "right" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="wc-mode-info" ref={ref}>
      <button
        type="button"
        className={`wc-mode-info-btn${open ? " active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="about this mode"
        title="about this mode"
      >
        <Info size={11} strokeWidth={2} />
      </button>
      {open && (
        <div className={`wc-mode-info-popover${align === "left" ? " align-left" : ""}`}>
          <p>{text}</p>
        </div>
      )}
    </div>
  );
}
