# Widget Size Presets — Spec

Status: **phases 1–2 implemented** (2026-09-23): presets pick each widget's layout in Slot Layout, resizing snaps to allowed footprints, new widgets are placed at their default preset. Phase 3 (re-fit on region-grid changes) next.

Deviations from this spec, decided while building:
- Legacy mapping is S → badge + **column** (even for h-only widgets, which keep
  `h`), L → panel + **hero**. Real canvases already had S widgets at 1x2, and
  hero preserves the old "fills its region → largest layout" rule.
- **Stacked layout (<1024px) keeps the pre-preset pixel rule for S/M/L** (user's
  choice): its full-width rows suit wider layouts. The preset is still computed
  there (desktop preset, §4) but doesn't pick the layout.

Replace the S/M/L × h/v size model with a small, central catalog of **size
presets**. A widget picks one or more presets; each preset is one layout with a
size range it must work across. Sizes are measured in **standard cells**, a unit
that scales with the screen but not with a region's grid. Resizing stays free
*inside* a widget's range, and region grids (2×8, 3×8, 4×9, …) can be changed
without breaking widgets.

---

## 1. Problem

Today (`lib/grid/sizeClass.ts`, `components/framework/SlotWidgetCell.tsx`):

- A widget can be resized to **any** span; the S/M/L class is then derived from
  the cell's pixel box. Each class covers a wide band — "M" spans roughly
  300×150 up to 600×250 — and a layout is only designed for one point in it,
  so it overflows at the low end and looks empty at the high end. The overflow
  currently shows up as an internal scrollbar (`.slot-cell .block { overflow-y: auto }`).
  Orientation (h/v) doubles the number of cases.
- `setRegionDims()` (`lib/slotLayout.ts`) refits widgets **by span count**. Going
  from 2×8 to 4×9 keeps a widget at, say, 1×1 while that cell shrinks from
  ~235×112 to ~118×98 px, so every widget in the region gets squeezed. This is
  why region grids are left at their defaults.
- The widget creator is asked for "an S / M / L layout" without a concrete box,
  so generated widgets guess their target size.

## 2. Goals

1. Widgets never render in a box smaller than the layout they are showing was
   designed for.
2. Free resizing inside the range each widget supports.
3. Region grids can be changed freely; widgets keep their *visible* size, not
   their span count.
4. The same layout on a bigger or smaller screen keeps its proportions (the Hub
   is a one-screen dashboard: a bigger screen should make things bigger, not
   add empty grid).
5. Every widget of the same preset has the same text size and spacing, so the
   dashboard looks consistent.
6. The widget creator gets a concrete box to design for, and checks the result.

Non-goals: Graph Layout (`lib/layout.ts`) is out of scope; it keeps S/M/L
through the compatibility mapping in §5.3.

## 3. Prior art

| | iOS | Android | AVN Hub (this spec) |
|---|---|---|---|
| Grid changeable | No | Yes | Yes |
| Widget sizes defined in | 3–4 fixed families | dp (fixed physical size), converted to cells | Standard cells, converted to real cells |
| Layout choice | One layout per family | Largest declared layout that fits (`SizeMode.Responsive`) | Largest preset that fits |
| Bigger screen gives | Slightly bigger widgets | More cells, same-size widgets | Bigger widgets, same proportions |

This is Android's model (declare a size range in a grid-independent unit,
launcher converts to cells, responsive layouts inside) with one change: the
unit scales with the screen, like iOS, because the Hub fills one screen
instead of scrolling.

---

## 4. Standard cells

A **standard cell** (SC) is the box a side-column cell would have at the
default 2×8 grid and default frame ratios, **on the current screen**. It is
computed live from the measured `.slot-frame`, so it depends only on the
viewport — never on a region's grid or a frame-ratio drag:

```ts
// desktop layout (≥1024px): .slot-frame is 2fr 3fr 2fr, 12px gaps
const defaultLeftW = (frameW - 2 * GAP) * (2 / 7);
const scPitchX = (defaultLeftW + GAP) / 2;   // default side grid: 2 cols
const scPitchY = (frameH + GAP) / 8;         //                    8 rows
const sc = { width: scPitchX - GAP, height: scPitchY - GAP };
```

At 1920×1080 this measures 235×112 px. On a smaller screen it shrinks,
on a bigger one it grows, and every widget scales with it.

Below 1024 px the frame stacks into one column (`globals.css`, `@media
(max-width: 1023px)`) and every cell becomes a full-width, content-height row
that ignores its rect, so there is no box to measure. There (and before the
frame is first measured) the preset is worked out on `REFERENCE_FRAME` — the
frame measured at 1920×1080 — with the canvas's own region dims and frame
ratios (`referenceGeometry()`), so a phone shows the widget's desktop preset.

The calculation lives in `lib/grid/standardCell.ts`. Whatever computes it must
use `DEFAULT_FRAME_RATIOS`, not the user's current ratios: a frame-ratio drag
resizes regions, it doesn't change the unit.

---

## 5. The preset catalog

One file, `config/sizePresets.ts`. Ranges are in **standard cells** (cols × rows).

| Preset | Min | Max | Readability floor (px) | Typical content |
|---|---|---|---|---|
| `badge`  | 1x1 | 2x1 | 140×56  | One number or status |
| `strip`  | 2x1 | 4x1 | 280×56  | Wide one-row band: status lights, ticker, media controls, link row |
| `column` | 1x2 | 1x4 | 70×120  | Narrow vertical list |
| `card`   | 2x2 | 3x4 | 300×130 | Standard data card |
| `panel`  | 2x4 | 3x8 | 300×260 | Charts, logs, detail views |
| `hero`   | —   | —   | —       | Whole region: terminal, Central Base content |

- At the default grids, standard cells and real side-column cells are the same
  thing, so "Card is 2x2" means exactly that on a fresh Hub.
- 3-wide maxima only matter in regions wider than 2 SC (base, Central Base).
  Region bounds clamp everything anyway.
- **Readability floor** is a hard pixel minimum, applied on top of the SC
  range. It only kicks in on small screens (phones, small windows), where the
  SC itself gets small. The numbers are placeholders to tune by eye.
- `badge` and `strip` overlap at 2x1. A widget that declares both gets `strip`
  there (§6.2: the larger min wins).
- `hero` has no range. It applies only when a widget fills its whole region, the
  same way the "fills region → largest variant" rule works today.

### Hero rules

A hero's box is unpredictable: a whole side column is tall and narrow, Central
Base is big and wide, the base region is wide and short. So:

- Any widget may declare `hero`, built-in or custom. It is opt-in; the widget
  creator only offers it when asked.
- A hero layout must either use `fill: "scale"`, or be fully fluid: no fixed
  widths or heights, and it must reflow between portrait and landscape.
- The creator's verification (§10) renders a hero in three shapes before saving:
  a whole side column (2x8 SC, tall), Central Base at default ratios (wide), and
  the base region (wide and short).

```ts
export type SizePreset = {
  id: "badge" | "strip" | "column" | "card" | "panel" | "hero";
  label: string;
  /** in standard cells */
  min: { cols: number; rows: number } | null;
  max: { cols: number; rows: number } | null;
  /** hard pixel minimum for legibility, regardless of screen */
  floorPx: { width: number; height: number } | null;
  /** text/spacing scale bounds for reflow mode, relative to the base size */
  scale: { min: number; max: number };      // e.g. { min: 0.9, max: 1.25 }
  /** base tokens the layout is designed at (px at the 1920×1080 reference) */
  text: { base: number; small: number; large: number };
  pad: number;
  /** what useWidget().size / .orientation report, for legacy widgets */
  legacy: { size: "S" | "M" | "L"; orientation: "h" | "v" };
};
```

### 5.1 Widget manifest

```ts
type WidgetManifest = {
  // …existing fields…
  /** presets this widget ships a layout for, smallest first */
  presets: PresetId[];
  /** preset used when the widget is first placed */
  defaultPreset: PresetId;
  /** how content fills extra space inside a preset's range (§8) */
  fill: "reflow" | "scale";
};
```

`sizes`, `orientations`, `defaults.size/orientation` and `minPx` become
**derived** during migration and are removed in the last phase (§12).

### 5.2 `useWidget()`

```ts
type WidgetCtx = {
  preset: PresetId;                        // new — the layout to render
  box: { width: number; height: number };  // new — measured cell box, px
  size: WidgetSize;                        // kept — preset.legacy.size
  orientation: Orientation;                // kept — preset.legacy.orientation
  // …unchanged…
};
```

New and migrated widgets branch on `preset`. Unmigrated widgets keep branching
on `size`, which keeps working through the legacy mapping.

### 5.3 Legacy mapping (S/M/L → presets)

| Declared sizes | Presets |
|---|---|
| S | badge |
| S with `v` orientation | badge + column |
| M | card |
| L | panel |

So `["S","M","L"] × ["h"]` → `badge, card, panel`. `clock` (`S, M × h, v`) →
`badge, column, card`.

---

## 6. Placement and resizing

### 6.1 Standard cells ↔ real cells

In `lib/grid/presetFit.ts`. Per axis, with `pitch` = the real cell pitch of the
region (§6.4):

```ts
// n standard cells cover n * scPitch - gap px; real spans needed to cover that:
realSpans(n, scPitch, pitch) = ceil((n * scPitch) / pitch - 0.1)
// a real footprint expressed in standard cells (fractional):
scSpan(spans, pitch, scPitch) = (spans * pitch) / scPitch
```

The 0.1-span tolerance (`SPAN_TOLERANCE`) exists because regions' cells are
never exactly a standard cell: at 1920×1080 a base column is ~2 px narrower
than a side column, and without slack "2 standard cells" in the base rounded up
to 3 columns (found in live verification: GitHub at 2x2 in the base resolved to
`badge`). The readability floor still guards legibility.

Then apply the preset's `floorPx` with the formula already in
`SlotWidgetCell.startDrag`: `ceil((px + gap) / pitch - 0.01)`, and take the
larger of the two.

### 6.2 Which preset applies to a footprint

1. If the widget fills the whole region and declares `hero` → `hero`.
2. Convert the footprint to standard cells (§6.1). Of the presets whose **min
   fits** (in SC, and whose `floorPx` fits in px), pick the one with the
   largest min area.
3. If none fits (small screen, §9), use the smallest declared preset and apply
   the fallback in §8.3.

The existing `layoutSize` framework setting becomes **"layout preset"**:
`auto` or one of the widget's own presets. A stale value falls back to `auto`,
as it does today.

### 6.3 Resize limits

At drag start, convert each declared preset's SC range to real spans at the
region's pitch. The allowed footprint is their union, clamped to the region:

- Minimum spans = the smallest preset's min (and its `floorPx`).
- Maximum spans = the largest preset's max (unbounded for `hero`).
- Keep the existing guard: never force a widget that is already below its floor
  to *grow* into its neighbours; it just can't shrink further.
- While dragging, the resize ghost shows the preset that will apply
  ("Card · 3x2"), so crossing into another layout is visible.

### 6.4 Region metrics

`lib/slotLayout.ts` is a DOM-free store, but conversions need pixels. Add
`lib/grid/regionMetrics.ts`: `SlotRegion` and the slot frame report their
measured `{ width, height, gap }` via `ResizeObserver`; the store reads the
latest value. Real pitch for any dims is then `(width + gap) / cols`, and the
standard cell comes from the frame (§4).

---

## 7. Changing region grids and frame ratios

`setRegionDims(region, dims)` re-fits **in standard cells**:

1. For each widget in the region, express its current footprint in SC at the
   **old** pitch (§6.1).
2. Clamp that to its current preset's SC range.
3. Convert back to real spans at the **new** pitch, apply `floorPx`, clamp to
   the region.
4. Keep the current cell if it's free, else `findFit`, else back to the unplaced
   pool (existing behaviour).
5. If metrics are missing (not measured yet), fall back to today's span clamp.

Committing a **frame-ratio** drag (`setFrameRatios`) runs the same re-fit for
every region whose pitch changed. Since the SC doesn't depend on frame ratios,
widgets keep their visible size; a region that got smaller may just fit fewer
of them.

**Preview before apply.** The Hub Core region-dims editor runs the re-fit as a
dry run and shows: "4×9: 3 widgets resize, 1 moves, 1 returns to the unplaced
pool." The user then confirms.

Example, left region at 1920×1080 (SC pitch ~248×108), Card at 2x2 SC:

| Left grid | Real pitch (x × y) | Card becomes |
|---|---|---|
| 2×8 | 248 × 108 | 2x2 |
| 3×8 | 165 × 108 | 3x2 |
| 4×9 | 124 × 96  | 4x3 |

Denser grids give finer resize steps; the widget's visible size stays the same.

---

## 8. Content scaling

### 8.1 Reflow (default)

The widget content wrapper gets `container-type: size`. Per-preset tokens are
set on it by the shell:

```css
.slot-cell[data-preset="card"] .widget-content {
  --t-base: clamp(calc(13px * 0.9), 2.7cqi, calc(13px * 1.25));
  --pad:    clamp(10px, 2.5cqi, 16px);
}
```

Widgets use `var(--t-base)`, `var(--t-small)`, `var(--t-large)` and `var(--pad)`
instead of fixed pixel sizes. Text grows with the box, capped at the preset's
`scale` bounds, so every Card's text stays within the same range. Beyond the
cap, extra space is for **more content** (extra list rows, a longer chart), not
bigger content.

Because the box itself scales with the screen (via the SC), a layout keeps its
proportions across screens without extra work.

The final token names should come from the Nutstyle design system
(`/mnt/nuttyd/design-system/nutstyle/SKILL.md`), not be invented here.

### 8.2 Scale

For clocks, gauges, the NutBot face and single big numbers. The shell wraps
content in `<FitBox>`: the layout is rendered at its preset's min box and
`transform: scale()`d to fit the cell (`contain`, centred, aspect preserved).

### 8.3 Below-floor fallback

A box below every declared preset's `floorPx` is never produced by resize or
grid changes; it only happens on a small screen. There:

- `scale` widgets just scale down.
- `reflow` widgets render the smallest preset, scaled down to at most 0.85 via
  `FitBox`. Beyond that: `overflow: hidden` with a bottom fade, never
  a scrollbar or cut-off text.
- In edit mode, the cell shows a small "too small" marker.

---

## 9. Other screens

The SC scales with the screen, so a layout arranged on the desktop looks the
same, proportionally, on a laptop. Only the readability floors can differ, and
only on small screens.

Layouts sync across devices through `lib/serverSync.ts`, so re-fitting (§7) is
triggered **only by explicit edits** on the device making them, never by just
opening the Hub on a different screen.

---

## 10. Widget creator

**Plan** (`app/api/widget-creator/plan/route.ts`, `avn-widget-plan` skill):

- Ask for presets instead of S/M/L. The question block offers the catalog with
  each preset's range and example content.
- `sDescription / mDescription / lDescription` → `presetContent: Record<PresetId, string>`.
  Same for the per-size image refs.
- Ask whether the widget is `reflow` or `scale`.
- Offer `hero` only when the user asks for a full-region widget, and state the
  hero rules (§5) in the plan.

**Build** (`generate/route.ts`, `avn-widget-build` skill), rules added:

- Design each preset's layout **at its min**, stated in both SC and reference
  pixels in the prompt ("Card: design at 2x2 SC ≈ 484×204 px, must also fill
  3x4 SC ≈ 732×420 px").
- No fixed heights. Only preset tokens for type and padding. Extra space shows
  more content.
- `manifest.json` gets `presets`, `defaultPreset`, `fill`.

**Verify** (new step after build, before registering):

- A dev-only route `/dev/widget-frame?id=…&preset=…&w=…&h=…` renders a single
  widget in a cell of exactly that box.
- `avns-browser` renders each declared preset at its **min** and **max** (at the
  1920×1080 reference) and at its **readability floor**, plus the three hero
  shapes if `hero` is declared, saves screenshots, and
  checks every element for `scrollWidth > clientWidth || scrollHeight > clientHeight`
  inside the widget.
- Any overflow → sent back to the builder once with the screenshots and the
  offending selectors. Still failing → the widget is registered with a warning
  in the Widget Manager rather than silently accepted.

---

## 11. Files

| New | Purpose |
|---|---|
| `config/sizePresets.ts` | The catalog (§5) |
| `lib/grid/standardCell.ts` | SC from the measured frame (§4) |
| `lib/grid/regionMetrics.ts` | Measured region/frame boxes for the store (§6.4) |
| `lib/grid/presetFit.ts` | SC ↔ span conversion, preset choice, resize range (§6) |
| `components/framework/FitBox.tsx` | Scale mode + below-floor fallback (§8) |
| `app/dev/widget-frame/` | Creator verification harness (§10) |

---

## 12. Migration and phases

Each phase ships on its own and leaves the Hub working.

| # | Phase | Main files |
|---|---|---|
| 1 | Preset catalog, standard cell, region metrics, `presetFit.ts`; manifests gain derived `presets` via §5.3; `useWidget()` gains `preset` + `box`. No visible change. | new files above, `config/widgets.tsx`, `lib/widget-creator/customRegistry.ts`, `WidgetContext.tsx` |
| 2 | Preset selection (§6.2) and resize limits (§6.3) replace `sizeClassForFootprint` / `minPixelSize`. | `lib/grid/sizeClass.ts`, `SlotWidgetCell.tsx` |
| 3 | SC-based re-fit and dry-run preview for region dims and frame ratios. **Unlocks changing region grids.** | `lib/slotLayout.ts`, Hub Core layout settings |
| 4 | Content tokens, `FitBox`, below-floor fallback. | `styles/globals.css` (plain CSS only — see the Tailwind note in SETUP), `WidgetShell.tsx` |
| 5 | Widget creator: plan, build, verify. | `plan/route.ts`, `generate/route.ts`, both skills |
| 6 | Migrate widgets one at a time to branch on `preset` and use tokens. Built-in: `clock`, `homelab`, `server-stats`, `disk-storage`, `network-stats`, `nutbot`, `identity`, `now-playing`, `github`, `notes`, `dictionary`, `dot-matrix`. Custom: `cube-timer`, `glyph-matrix`, `quick-links`, `verlet-sim`, `world-clock`, `spotify-visualizer`, `weather-updated`, `idea-inbox`. | each widget |
| 7 | Remove `sizes`, `orientations`, `minPx`, `SPAN_MAP` and `MIN_FOOTPRINT` once nothing reads them. | `config/widgets.tsx`, `config/slotLayout.ts` |

**Stored layouts** need no data migration: placements are rects, and presets
are derived at render time. Widgets whose stored rect is below their floor keep
their placement (existing guard) and are flagged in edit mode.

**Live-server notes.** The Hub runs as `next dev` under `avn-hub.service`, so
edits hot-reload for anyone who has it open. Removing lines from
`config/customComponentMap.tsx` triggers full reloads; phase 7 must not remove
map lines for widgets that are still registered.

---

## 13. Open questions

1. **Preset ranges and floors.** The SC ranges in §5 are a first pass; tune by
   eye once phase 2 is running. Floors only matter on small screens.
2. **Stacked layout (<1024 px).** Resolved in phase 1: use the widget's
   desktop preset (§4). Open: whether content-height rows should also cap at
   that preset's max height.
3. **Graph Layout.** Keep S/M/L there via the legacy mapping, or move it to
   presets too?

Decided (2026-09-23): `strip` added to the catalog; `hero` is open to custom
widgets as an opt-in, under the hero rules in §5.
