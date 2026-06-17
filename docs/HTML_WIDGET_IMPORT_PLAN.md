# HTML Widget Import and Native Conversion Plan

## Goal

Let AVN Hub accept widgets built elsewhere as plain HTML/CSS/JS, make them usable
inside the existing widget manager, and optionally convert them into native AVN
Hub React widgets later.

This should support two paths:

- **Iframe import**: keep the original HTML widget mostly intact and run it in a
  sandboxed iframe inside the AVN widget shell.
- **Native conversion**: translate an HTML widget into the standard AVN widget
  framework shape: React component, manifest metadata, settings schema, theme
  tokens, size-aware layouts, and shared data helpers.

## Current Foundation

AVN Hub already has the important pieces for the first path:

- `IframeWidget` can render `/public/custom-widgets/<id>/index.html`.
- `config/customRegistry.json` supports `"type": "iframe"`.
- The iframe host sends theme tokens and widget context with `postMessage`.
- Iframe widgets can call same-origin API routes such as `/api/now-playing`.

The current widget ZIP import route is aimed at React/TSX custom widgets. It
expects a `registry.json` file and at least one `.tsx` component under the widget
folder, so it is not yet an HTML-widget importer.

## User Experience

The Widget Manager should expose an import flow with two modes:

- **Import HTML widget**
  Accepts a `.zip` containing an HTML widget and installs it as an iframe widget.

- **Convert HTML to native widget**
  Takes the imported HTML widget and generates a native AVN Hub widget draft.
  This can be a later phase because it needs code generation and review.

## HTML Import ZIP Format

Support this simple archive shape:

```text
my-widget.zip
  widget.json
  index.html
  assets/
    optional files...
```

`widget.json`:

```json
{
  "id": "my-widget",
  "title": "My Widget",
  "iconName": "Box",
  "sizes": ["S", "M", "L"],
  "orientations": ["h"],
  "defaults": { "size": "M", "orientation": "h" },
  "settings": []
}
```

`index.html` is copied to:

```text
public/custom-widgets/my-widget/index.html
```

Any local assets are copied under:

```text
public/custom-widgets/my-widget/assets/
```

The registry entry is written to `config/customRegistry.json` with:

```json
"type": "iframe"
```

No React component map entry should be required for iframe widgets.

## Phase 1: Robust Iframe HTML Import

1. Add `POST /api/widget-creator/import-html`.
2. Validate uploaded ZIP:
   - requires `widget.json`
   - requires `index.html`
   - `id` must be kebab-case
   - reject duplicate ids
   - reject path traversal entries
   - allow only files inside the archive root or `assets/`
3. Sanitize and normalize the manifest:
   - default `iconName` to `Box`
   - default `sizes` to `["S", "M", "L"]`
   - default `orientations` to `["h"]`
   - default placement to `{ "size": "M", "orientation": "h" }`
   - force `"type": "iframe"`
4. Copy files into `public/custom-widgets/<id>/`.
5. Add the registry entry to `config/customRegistry.json`.
6. Return `{ ok: true, id, title }`.
7. Update Widget Manager import UI:
   - add an import type selector or separate button for HTML widgets
   - show clear success/error states
   - keep imported iframe widgets under the Custom tab

## Phase 2: HTML Widget Runtime Polish

1. Extend `IframeWidget` with better runtime messages:
   - `NUTMAG_THEME`
   - `NUTMAG_CONTEXT`
   - `NUTMAG_PREFS` if useful later
2. Support optional iframe height modes:
   - fixed height
   - iframe-reported height through `NUTMAG_RESIZE`
   - fill available card height
3. Add a tiny helper script template for imported widgets:
   - applies theme tokens
   - reads size/settings
   - reports height after render
4. Add docs and a downloadable starter template ZIP.

## Phase 3: Native Conversion Prototype

Build a conversion command or API endpoint that creates a draft native widget
from an imported iframe widget.

Input:

```text
public/custom-widgets/<id>/index.html
public/custom-widgets/<id>/assets/*
config/customRegistry.json entry
```

Output:

```text
components/widgets/custom/<id>/<PascalName>Widget.tsx
config/customRegistry.json entry without "type": "iframe"
config/customComponentMap.tsx lazy import entry
```

Conversion responsibilities:

- convert static HTML structure to JSX
- move inline style rules into widget-scoped CSS or inline token styles
- replace hard-coded colors with AVN CSS variables
- map obvious inputs/toggles/selects to `settings`
- replace local intervals/fetch loops with `usePolling` where appropriate
- branch on `useWidget().size` for S/M/L layout differences
- preserve behavior where safe
- mark unsupported browser APIs or external scripts for manual review

This phase should generate a draft and keep the iframe original until the user
accepts the conversion.

## Phase 4: Review and Safe Apply Flow

Native conversion should not silently overwrite a working iframe widget.

Flow:

1. Generate native draft under a temporary folder or preview id.
2. Run:
   - `npx tsc --noEmit`
   - focused `npx eslint` on generated files
3. Show a summary:
   - files created
   - behaviors preserved
   - behaviors needing manual review
4. Let the user choose:
   - keep iframe widget
   - install native widget as a new id
   - replace iframe widget with native version

## Phase 5: Editing Existing HTML Widgets

Add a lightweight edit flow for iframe widgets:

- edit title/icon/sizes/orientations/defaults/settings from the manager
- replace uploaded HTML ZIP while keeping the same id
- export iframe widgets as ZIP
- delete iframe widgets and their public files

## Security Notes

Iframe widgets should stay sandboxed.

Recommended default:

```tsx
sandbox="allow-scripts allow-same-origin"
```

Avoid granting:

- `allow-forms`
- `allow-popups`
- `allow-top-navigation`
- broad external script trust

Import validation should reject path traversal and avoid writing outside
`public/custom-widgets/<id>/`.

## Success Criteria

- A user can export/build a plain HTML widget from another app, zip it, and
  import it into AVN Hub without writing React.
- The imported widget appears in Widget Manager under Custom.
- The imported widget receives AVN theme tokens and size/settings context.
- Palette/theme changes update the iframe widget.
- The widget can be exported or deleted cleanly.
- A later conversion path can produce a native AVN widget without destroying the
  original iframe version.

## First Implementation Slice

Start with the smallest useful feature:

1. Create `app/api/widget-creator/import-html/route.ts`.
2. Add an HTML import button in `HubCorePanel`.
3. Write uploaded files to `public/custom-widgets/<id>/`.
4. Write a `"type": "iframe"` registry entry.
5. Verify with one hand-made HTML widget ZIP.
6. Update `docs/CREATING_WIDGETS.md` with the supported ZIP format.
