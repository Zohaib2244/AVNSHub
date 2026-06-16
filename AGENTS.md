# AGENTS.md - NutMag Card

## Project Shape

NutMag Card is a Next.js App Router dashboard rendered as a living personal identity card. The UI is a dense widget system inside the chunky "G - Chunky Blocks + Accent Border" design direction from `DESIGN_VARIATIONS.md`.

Use these files as the source of truth:

- `CLAUDE.md` - broad product, architecture, design, deployment, and history context.
- `docs/CREATING_WIDGETS.md` - widget authoring rules; keep this synced when framework behavior changes.
- `config/widgets.tsx` - widget registry, size/orientation contracts, default order.
- `config/slotLayout.ts` and `lib/slotLayout.ts` - Slot Layout region grid defaults, persistence, placement, and resize rules.
- `styles/globals.css` - design tokens, layout CSS, widget-specific CSS.

## Architecture Notes

- Widgets are content components plus manifest entries. Do not hand-roll `.block`, `.capsule`, label chrome, polling loops, or persistence inside widget content.
- `WidgetShell` owns card chrome and provides `useWidget()` context.
- Slot Layout is the current preferred layout. Widgets occupy explicit cell rectangles inside `left`, `right`, and `base` regions; the terminal is a separate single slot.
- Graph Layout still exists and uses dnd-kit reorder over a CSS grid. Avoid changes that accidentally break it unless the task is Slot-only and clearly scoped.
- Layout state is persisted in localStorage:
  - `nutmag-slot-layout` for Slot Layout.
  - `nutmag-layout` for Graph Layout.
  - `nutmag-layout-mode`, `nutmag-theme`, `nutmag-palette`, `nutmag-prefs` for global UI state.

## Interaction Rules

- Existing widgets are resizable and repositionable in edit mode.
- Slot Layout has opt-in Hover On Expand (HOE) implemented as transient fractional preview boxes in `lib/grid/hoverExpand.ts`, `SlotRegion`, and `SlotWidgetCell`. The per-widget `hoverExpand` setting defaults to `false`.
- A previous hover/click expansion system was removed after causing reflow and maximum-update-depth loops.
- Do not use `framer-motion layout`, dnd-kit layout animation, measurement callbacks that set state during hover, or persisted layout mutations for HOE.
- Prefer transient preview state, real preview dimensions, and pure grid math over DOM measurement loops.
- Hover effects must be disabled in edit mode, on touch/coarse pointers, and while resizing or moving widgets.

## Styling Rules

- Stay within the chunky sticker/card design: warm surfaces, hard offset shadows, 1.5px borders, DotGothic16 labels, JetBrains Mono values.
- Use existing CSS variables and theme tokens. Do not add hard-coded hex colors unless updating the token system itself.
- `.capsule` is a named container query surface (`container-name: widget`). Use `@container widget (...)` for width-dependent widget behavior.
- Compact widgets must survive narrow Slot Layout cells. Rows of controls should wrap or stack.

## Verification

Run the narrowest useful checks for the change:

```bash
npx tsc --noEmit
npm run build
npx eslint <touched TS/TSX files>
```

Full lint currently has known unrelated failures:

- `components/HubCorePanel.tsx` calls `setState` synchronously in an effect.
- `components/UptimeMilestones.tsx` calls `Date.now()` during render.

For UI changes, use Playwright or the Playwright CLI against `http://localhost:3000`. Disable the boot sequence in temporary browser storage when taking screenshots:

```json
{"pollingEnabled":true,"bootSequence":false}
```

## Development Hygiene

- Keep edits scoped. Do not refactor unrelated widgets while fixing layout behavior.
- Do not revert user changes or generated assets.
- Prefer `rg` for search.
- Use `apply_patch` for manual file edits.
- Keep docs updated when widget framework behavior changes.
