# Idea Inbox

A quick-capture widget for ideas, tasks, and thoughts. Persisted in localStorage.

## Per-idea actions

Each row shows a **checkmark icon button** (toggle done/restore) and a **copy icon button** (copy idea text to clipboard). When done, the checkmark fills with the accent-orange color. On copy, the icon briefly flips to a checkmark to confirm.

On M and L, rows also show **edit** (pencil) and **delete** (trash) icon buttons.

## Bulk actions

A toolbar provides **Copy All** (copies all visible ideas as a numbered list: `1. text\n2. text\n3. text`) and **Complete All** (marks every active idea as done). Both show a brief checkmark confirmation. The toolbar appears on M (active list only) and L (active or done list depending on tab).

## Per-size layouts

- **S**: Shows the most recent active idea (clamped to 2 lines) plus a compact add form. No toolbar, no edit/delete.
- **M**: Add form + toolbar + scrollable active list. No done section.
- **L**: Tabbed active/done switch (compact pill buttons with counts) + toolbar + add form (when on active tab) + scrollable list.

## Data

Ideas are objects with `{ id, title, createdAt, completedAt? }`. Stored under `nutmag-idea-inbox` in localStorage. Created with `crypto.randomUUID()` when available, timestamp-based fallback otherwise.

## Settings

None.
