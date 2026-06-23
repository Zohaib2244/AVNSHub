# AVN Hub Bug Report

Use this file to collect bugs found while testing AVN Hub. Keep newest reports near
the top so the active work stays easy to scan.

## New Bug Template

````md
## BUG-000 - Short title

- Status: Open
- Severity: Low | Medium | High | Critical
- Area: Widget Manager | Slot Layout | Graph Layout | NutBot | Theme | API | Other
- Found on: YYYY-MM-DD
- Browser / Device:

### Summary

What went wrong?

### Steps to Reproduce

1. 
2. 
3. 

### Expected

What should have happened?

### Actual

What happened instead?

### Evidence / Logs

```text
Paste logs, screenshots, file paths, or notes here.
```

### Notes

- Suspected files:
- Possible fix:
- Verification needed:
````

---

## BUG-002 - Deleted custom widgets leave folders behind

- Status: Fixed
- Severity: Medium
- Area: Widget Manager / Custom Widgets
- Found on: 2026-06-23
- Browser / Device: Local development

### Summary

After deleting custom widgets from the AVN Hub UI, their component folders still
remain under `components/widgets/custom/`.

### Steps to Reproduce

1. Create or import custom widgets.
2. Delete the custom widgets from the Widget Manager.
3. Check `components/widgets/custom/`.

### Expected

Deleting a custom widget should remove all generated registry entries and the
widget's source folder, or the UI should clearly explain that the widget is only
unregistered and source files are intentionally retained.

### Actual

Some folders remain after deletion, including examples currently observed in the
repo:

```text
components/widgets/custom/fifascore
components/widgets/custom/hello
components/widgets/custom/photo-slideshow
components/widgets/custom/type-test
```

The original report specifically mentioned stale folders for FIFA, hello, and
type-test style custom widgets.

### Notes

- Suspected files:
  - `app/api/...` custom widget delete route, if deletion is API-backed
  - `config/customRegistry.json`
  - `config/customComponentMap.tsx`
  - `components/widgets/custom/`
- Verify whether `photo-slideshow` is intentionally kept before deleting it.
- Check that deletion handles both component files and `manifest.json`.
- Fixed by hardening the delete route to remove widget files and prune orphan
  custom folders, then deleting the existing orphan folders from the repo.

---

## BUG-001 - Hydration mismatch after deleting a custom widget

- Status: Fixed
- Severity: High
- Area: NutBot / Widget Creator / Widget Manager
- Found on: 2026-06-23
- Browser / Device: Local development

### Summary

Deleting a custom widget produced a React hydration mismatch. The mismatch is in
the NutBot terminal UI: the server and client disagree about which terminal tab
is active and which body variant should render.

### Steps to Reproduce

1. Open AVN Hub locally.
2. Delete a custom widget from the Widget Manager.
3. Reload or allow the app to re-render.
4. Check the browser console.

### Expected

The app should hydrate cleanly after a custom widget is deleted. The active
NutBot terminal tab and body class should match between server-rendered HTML and
client render.

### Actual

React reports that hydration failed and regenerates the tree on the client. The
console diff shows the server/client mismatch around NutBot terminal tabs:

```text
[browser] Uncaught Error: Hydration failed because the server rendered HTML didn't match the client.

<NutBotTerminal>
  <div className="nutbot-terminal">
    <div className="term-row">
      <div className="term-tabs">
        <button
          type="button"
+         className="term-tab"
-         className="term-tab active"
        >
        <button>
        <button
          type="button"
+         className="term-tab active"
-         className="term-tab"
        >
      ...
    <div
+     className="term-body term-body-creator"
-     className="term-body"
    >
      <WidgetCreatorPanel>
+       <div className="wc-panel">
```

Relevant stack frames from the pasted console log:

```text
at WidgetCreatorPanel
at NutBotTerminal
at NutBotFaceWidget
at WidgetShell
at SlotDashboard
at Home
at ClientPageRoot
```

### Notes

- This may be caused by reading browser-only state during the first client render
  for the NutBot active tab, Widget Creator state, or persisted preferences.
- Suspected files:
  - NutBot terminal component
  - Widget Creator panel component
  - localStorage state around active terminal tab / creator mode
- First check whether the initial render uses deterministic defaults until the
  component is mounted, then applies localStorage state after hydration.
- Fixed by rendering the NutBot terminal with a deterministic `log` tab on the
  server and first client render, then restoring the saved tab from
  `sessionStorage` after hydration.
