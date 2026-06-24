"use client";

// Three hand-drawn NutBot glyphs for the AVN Hub Canvases icon picker
// (config/canvasIcons.ts) — same 24x24/stroke="currentColor" conventions as
// lucide-react's own icons (see defaultAttributes in lucide-react/dist/esm)
// so they sit indistinguishably alongside the curated Lucide set. Eyes/
// antenna-tip/mouth-dots are filled (not stroked) so they stay legible at
// the 13-14px size the picker and pills actually render at.

import { forwardRef, type SVGProps } from "react";

type NutBotIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
};

function createNutBotIcon(displayName: string, paths: React.ReactNode) {
  const Component = forwardRef<SVGSVGElement, NutBotIconProps>(function NutBotIcon(
    { size = 24, strokeWidth = 2, className, ...rest },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...rest}
      >
        {paths}
      </svg>
    );
  });
  Component.displayName = displayName;
  return Component;
}

/** rounded friendly head + antenna */
export const NutBotFace = createNutBotIcon(
  "NutBotFace",
  <>
    <rect x="5" y="7" width="14" height="12" rx="4" />
    <line x1="12" y1="3" x2="12" y2="7" />
    <circle cx="12" cy="2.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="13" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="13" r="1.2" fill="currentColor" stroke="none" />
    <path d="M9.5 16.5c.8.7 2.2.7 3 0" />
  </>,
);

/** chip/circuit-board bot, pins on all four edges */
export const NutBotChip = createNutBotIcon(
  "NutBotChip",
  <>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <path d="M9.5 14.5h5" />
  </>,
);

/** terminal/monitor bot with a little prompt-chevron smile */
export const NutBotScreen = createNutBotIcon(
  "NutBotScreen",
  <>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 20h8M12 17v3" />
    <circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none" />
    <path d="M8.5 13l2 1-2 1" />
  </>,
);
