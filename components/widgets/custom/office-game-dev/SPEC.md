# game ops

Per-game workspace for office game-dev work. Sizes S / M / L, horizontal only. No settings. Data lives in `store.ts` (canvas-scoped, DB-synced via `createCanvasStore`).

## Data (per game)
- Identity: name, game id, store name, live link (edited via the pencil next to the game name).
- Quick links: 3 fixed slots (Firebase, APK Folder, Game Ids) + freeform custom links (label + url).
- Publish draft: stage, version, bundle code, previous/new rollout, country, bundle link, release notes; "Copy Email" composes the publishing email.
- Todos: a checklist per game (`todos: GameTodo[]`, each `{ id, text, done, createdAt, updatedAt }`), newest first, checked items sink to the bottom. Games saved with the old `notes` load them as todos (a numbered-list note becomes one todo per item).

## Layouts
- **S**: game count + count of games with incomplete release setup.
- **M**: game list (search once >4 games, add, two-tap delete). Selecting a game opens a detail view with a back row, identity editor toggle, and a **Links / Publish / Todo** tab bar.
- **L**: game list on the left and the selected game's workspace on the right. The first game is selected initially so the workspace never opens as a large blank panel.

## Workspace tabs
- **Links / Publish / Todo** use ARIA tab semantics.
- Left/right arrows, Home, and End move keyboard focus between tabs.
- Publish fields are grouped into Build, Rollout, and Delivery sections.

## Links tab
- Links are portrait tiles in a responsive grid (three across at L, two at narrow widths): a large icon box on top, the name and hostname centred below, and copy + edit buttons bottom-right. The icon and text open the link.
- An unset fixed slot is a dashed tile; clicking it opens an inline editor. Editing any link replaces its tile with a full-width form (custom links edit label + url, and have a two-tap Delete there). "add link" opens the same form.

## Todo tab
- Auto-growing textarea at the top adds a todo (Enter adds, Shift+Enter inserts a newline, plus button also adds). Blank todos are ignored.
- Each todo has a checkbox (checked = struck through, sinks below open ones), and copy / edit / delete buttons. Edit swaps in an inline textarea (Enter or check saves, Escape or X cancels). Delete is two-tap.
- Switching games resets to the Links tab.

## Notes on behavior
- Deleting a game is two-tap confirm.
- Older stored games without `notes` load with an empty list.
