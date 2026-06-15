// Footprint -> size/orientation best-fit mapping — the seam that makes every
// existing widget "just work" in Slot Layout. iOS WidgetKit (widgetFamily)
// and Android Jetpack Glance (SizeMode.Responsive) both converge on the same
// rule: a discrete size class picks a discrete content variant, chosen by
// best fit. NutMagCard's widgets already branch on useWidget().size/
// .orientation (S/M/L x h/v) — Slot Layout just derives that size class from
// a widget's cell footprint and feeds it through the existing plumbing.

import type { Orientation, WidgetSize } from "@/config/widgets";

export type Footprint = { colSpan: number; rowSpan: number };

const SIZE_ORDER: WidgetSize[] = ["S", "M", "L"];

/** nearest allowed size to `ideal` by distance in S/M/L order; ties favor
    the smaller size (safer — less likely to overflow its cell) */
function clampSize(ideal: WidgetSize, allowed: readonly WidgetSize[]): WidgetSize {
  if (allowed.includes(ideal)) return ideal;
  const idealIndex = SIZE_ORDER.indexOf(ideal);
  let best = allowed[0];
  let bestDistance = Infinity;
  for (const size of allowed) {
    const distance = Math.abs(SIZE_ORDER.indexOf(size) - idealIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = size;
    }
  }
  return best;
}

/** best-fit S/M/L + h/v from total cell area, clamped to what the widget
    declares; area thresholds (1 -> S, 2-3 -> M, 4+ -> L) are a starting
    point, tuned in Phase 5 against real content */
export function sizeClassForFootprint(
  footprint: Footprint,
  allowedSizes: readonly WidgetSize[],
  allowedOrientations: readonly Orientation[],
): { size: WidgetSize; orientation: Orientation } {
  const area = footprint.colSpan * footprint.rowSpan;
  const ideal: WidgetSize = area <= 1 ? "S" : area <= 3 ? "M" : "L";
  const size = clampSize(ideal, allowedSizes);

  // taller than wide -> vertical, otherwise (wider or square) -> horizontal
  const idealOrientation: Orientation = footprint.rowSpan > footprint.colSpan ? "v" : "h";
  const orientation = allowedOrientations.includes(idealOrientation) ? idealOrientation : allowedOrientations[0];

  return { size, orientation };
}

/** the terminal slot always renders its occupant at the largest/most-detailed
    variant it supports — mirrors nutbot's existing "L = full terminal"
    behavior, and the terminal region has no smaller footprint to derive from */
export function terminalSizeClass(
  allowedSizes: readonly WidgetSize[],
  allowedOrientations: readonly Orientation[],
): { size: WidgetSize; orientation: Orientation } {
  const size = allowedSizes.includes("L") ? "L" : allowedSizes[allowedSizes.length - 1];
  const orientation = allowedOrientations.includes("h") ? "h" : allowedOrientations[0];
  return { size, orientation };
}
