// Footprint -> size/orientation best-fit mapping — the seam that makes every
// existing widget "just work" in Slot Layout. iOS WidgetKit (widgetFamily)
// and Android Jetpack Glance (SizeMode.Responsive) both converge on the same
// rule: a discrete size class picks a discrete content variant, chosen by
// best fit. AVN Hub widgets already branch on useWidget().size/
// .orientation (S/M/L x h/v) — Slot Layout just derives that size class from
// a widget's cell footprint and feeds it through the existing plumbing.

import type { Orientation, WidgetSize } from "@/config/widgets";
import type { RegionDims } from "@/config/slotLayout";

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

function largestVariant(
  allowedSizes: readonly WidgetSize[],
  allowedOrientations: readonly Orientation[],
): { size: WidgetSize; orientation: Orientation } {
  const size = allowedSizes.includes("L") ? "L" : allowedSizes[allowedSizes.length - 1];
  const orientation = allowedOrientations.includes("h") ? "h" : allowedOrientations[0];
  return { size, orientation };
}

/** measured size of a widget's cell box in CSS pixels */
export type PixelSize = { width: number; height: number };

/** Pixel breakpoints for the size class, applied to the cell's outer box.
    Calibrated against the default frame on a ~1920x1080 viewport, where a
    Left/Right grid cell is ~236x96 and a Base cell ~234x120:
      1x1 / 1x2 / 2x1  -> S   (one axis too cramped for more than a glance)
      2x2 (~485x204)   -> M
      2x4, wide Base   -> L
    Both axes count: a 3x1 strip is wide but only one cell tall, so it stays S
    instead of receiving a rich layout it would crop. */
export const SIZE_CLASS_PX = {
  /** below either of these, the widget is S */
  s: { maxWidth: 300, maxHeight: 150 },
  /** at or above either pair, the widget is L (wide-and-short, or tall) */
  l: [
    { minWidth: 600, minHeight: 250 },
    { minWidth: 400, minHeight: 400 },
  ],
} as const;

/** the smallest cell box a widget may be resized to: its declared `minPx`,
    or — when it has no S layout — the S/M boundary (and the loosest L box
    when it has no M either), so a resize can't land it in a box it has no
    layout for. null means no floor beyond one cell. */
export function minPixelSize(
  allowedSizes: readonly WidgetSize[],
  declared?: PixelSize | null,
): PixelSize | null {
  let floor: PixelSize | null = null;
  if (!allowedSizes.includes("S")) {
    floor = allowedSizes.includes("M")
      ? { width: SIZE_CLASS_PX.s.maxWidth, height: SIZE_CLASS_PX.s.maxHeight }
      : { width: SIZE_CLASS_PX.l[1].minWidth, height: SIZE_CLASS_PX.l[0].minHeight };
  }
  if (!declared) return floor;
  if (!floor) return declared;
  return { width: Math.max(floor.width, declared.width), height: Math.max(floor.height, declared.height) };
}

function idealSizeForPixels({ width, height }: PixelSize): WidgetSize {
  if (width < SIZE_CLASS_PX.s.maxWidth || height < SIZE_CLASS_PX.s.maxHeight) return "S";
  if (SIZE_CLASS_PX.l.some((t) => width >= t.minWidth && height >= t.minHeight)) return "L";
  return "M";
}

/** fallback before the region has been measured (first render / SSR):
    1x1, 1x2, 2x1 -> S; 2x2 -> M; anything larger -> L */
function idealSizeForFootprint({ colSpan, rowSpan }: Footprint): WidgetSize {
  if (colSpan * rowSpan <= 2) return "S";
  if (colSpan <= 2 && rowSpan <= 2) return "M";
  return "L";
}

/** best-fit S/M/L + h/v for a placed widget, clamped to what it declares.
    Prefers the cell's real pixel size (`px`) because cells differ between
    regions, screens and frame-ratio drags, so a span count alone doesn't say
    how much room a widget has; falls back to the span count until measured.
    Exception: a widget whose footprint fills its *entire* region always
    gets the largest/most-detailed variant it supports, regardless of size —
    a region subdivided into just one cell (Central Base's 1x1 default, e.g.)
    is visually huge, and this was previously NutBot's terminal-only behavior
    (terminalSizeClass); now it's a general rule any region gets for free. */
export function sizeClassForFootprint(
  footprint: Footprint,
  dims: RegionDims,
  allowedSizes: readonly WidgetSize[],
  allowedOrientations: readonly Orientation[],
  px?: PixelSize | null,
): { size: WidgetSize; orientation: Orientation } {
  if (footprint.colSpan >= dims.cols && footprint.rowSpan >= dims.rows) {
    return largestVariant(allowedSizes, allowedOrientations);
  }

  const ideal = px ? idealSizeForPixels(px) : idealSizeForFootprint(footprint);
  const size = clampSize(ideal, allowedSizes);

  // taller than wide -> vertical, otherwise (wider or square) -> horizontal
  const tall = px ? px.height > px.width : footprint.rowSpan > footprint.colSpan;
  const idealOrientation: Orientation = tall ? "v" : "h";
  const orientation = allowedOrientations.includes(idealOrientation) ? idealOrientation : allowedOrientations[0];

  return { size, orientation };
}
