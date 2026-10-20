# AVN Hub

A self-hosted, extensible dashboard: an empty canvas you fill with widgets, plus a NutBot chat tool that scaffolds new widgets from a prompt. Next.js (App Router), TypeScript, Tailwind + CSS variables, Framer Motion. Runs as `next dev` by design (the Widget Creator writes `.tsx` into the tree and relies on HMR).

## Commands
- `npm install` then `npm run dev` (port 3000; `predev` runs the Prisma setup).
- `npx tsc --noEmit` to type-check; `npm run lint`.
- `npm run sync:widget-skill` regenerates the harness skills in `.claude/skills/` and `.agents/skills/` from `lib/widget-creator/prompts/` (also runs on `npm install`; those folders are gitignored).

## Where things live
- `config/widgets.tsx` - widget manifests (one content component + one manifest entry per widget).
- `components/framework/` - widget shell, `useWidget()`, settings popover. `lib/usePolling.ts`, `lib/format.ts` - shared plumbing.
- `components/widgets/default/` shipped widgets; `components/widgets/custom/` widgets made by the Widget Creator.
- `app/api/` - every external call goes through a route here; never put keys in client components.
- `lib/slotLayout.ts`, `lib/canvases.ts`, `lib/theme.ts` - per-canvas layout, canvases and theme.
- `docs/` - setup and widget authoring. Start with `docs/WIDGETS.md` before adding a widget.

## Rules
- Widgets render different markup per size via `useWidget().size` (S/M/L). Never hand-roll `.block` markup or fetch loops inside a widget.
- Never attach layout-animation systems (framer-motion `layout`, dnd-kit `animateLayoutChanges`) to grid items; dense grid flow reflows every item and loops into "Maximum update depth exceeded".
- Design: warm, dense "Chunky Blocks + Accent Border" (`docs/design/DESIGN_VARIATIONS.md`). Hard-offset sticker shadows with no blur, 1.5px borders, 12-16px radius. Font sizes come from the five-step `--fs-*` scale in `styles/globals.css`; use the colour tokens, not raw hex. Dark and light themes are both first-class. No Inter/Roboto/Arial, pure black/white, neon glow or blurred box-shadows.
- Icons: Lucide, 14px, stroke 1.75.
- Log notable changes under `## [Unreleased]` in `CHANGELOG.md`.
