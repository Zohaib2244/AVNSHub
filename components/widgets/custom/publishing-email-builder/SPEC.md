# Publishing Email Builder

> Maintained automatically by the Widget Creator after every successful
> build turn. Describes this widget's intent and settings so any future
> turn - edit mode, a new session, a different device - has full context
> without exploring other files. Do not edit or delete this by hand.

- **slug**: `publishing-email-builder`
- **icon**: ClipboardCheck
- **sizes**: M, L
- **orientations**: h
- **originated from**: plan mode

## Concept

A reusable publishing email composer for game release builds. It stores game details once, then turns each build's rollout, version, bundle, country, and notes inputs into Zohaib's exact Gmail-ready format without showing the generated email body in the widget.

## Requirements

1. Widget purpose: create Zohaib's standard latest Publishing Build email from saved game details plus per-release inputs, then copy the finished email to clipboard for pasting into Gmail.
2. The widget must let the user add games to a saved game list.
3. Each saved game must store core details: Game Name, Game ID, Store Name, and Live Link.
4. The main view must show a selectable list of saved games.
5. Clicking a saved game must open the build email form for that game.
6. The build email form must include Stage with options Beta, Production, and Other/custom.
7. If Stage is Other/custom, show a custom Stage text input.
8. The build email form must include Version Number.
9. The build email form must include Bundle Code, formatted inside parentheses after Version Number in the email.
10. The build email form must include Previous RollOut.
11. If Previous RollOut is 0, the email must render Previous RollOut as Halt.
12. The build email form must include New RollOut.
13. Rollout values must support percentages such as x% and y%.
14. The build email form must include Country Based as an optional country/name entry field.
15. The Country Based line must only appear in the email if country based names are entered; otherwise omit this field entirely.
16. The build email form must include Bundle Link.
17. The build email form must include Release Notes as an optional multiline field.
18. The Release Notes section must only be created if Release Notes has any field/content; otherwise omit the Release Notes section entirely.
19. The generated email must start exactly with: Hello,
20. The generated email must include: Following is the information for the latest Publishing Build.
21. The generated email must render saved game details as: Game Name: {Name} | {Game ID}
22. The generated email must render saved game details as: Store Name: {Store Name}
23. The generated email must render saved game details as: Live Link: {link}
24. The generated email must include a separator line: ---
25. The generated email must render build details as: Stage: {Beta/Production/Other(custom)}
26. The generated email must render build details as: Version: {Version Number} {(bundle code)}
27. The generated email must render build details as: Previous RollOut: {x%/if x is 0 then Halt}
28. The generated email must render build details as: New RollOut: {y%}
29. The generated email must render build details as: Country Based: {Countries, Names,} only when country based names are entered.
30. The generated email must render build details as: Bundle Link: {link}
31. The generated email must include a second separator line: ---
32. The generated email must render: Release Notes: {content} only if Release Notes content exists.
33. The generated email must always include: Attached is the finalized publishing checklist confirming all technical and operational requirements have been met
34. The generated email must end exactly with: Best Regards,
Zohaib Shahjehan
35. The widget must include a Copy button labeled Copy Email.
36. Pressing Copy Email must copy the full generated email into the user's clipboard.
37. After copying, show a short copied confirmation state.
38. Saved games must persist locally so the list remains available after refresh.
39. Build field values should persist locally for the selected game until replaced by the user.
40. Include an Edit Game control for updating saved Game Name, Game ID, Store Name, and Live Link.
41. Empty state: if no games exist, show an add-game form first.
42. Do not require completed fields before saving a game or copying the email; the widget should copy the current values as entered.
43. Do not show the generated email body in the widget UI; the generated email is clipboard-only.
44. Avoid sending email directly; the widget only prepares and copies text for Gmail.

## Per-size content

- **S**: S is not supported because the widget needs a saved-game list, release form, and copy action.
- **M**: Two-column workspace with a compact saved-game selector and Add/Edit controls on the left; the game editor replaces the build form when Add Game or Edit Game is pressed. Build fields for Stage, Version Number, Bundle Code, Previous RollOut, New RollOut, Country Based, Bundle Link, and Release Notes with a Copy Email button below them and a short copied state.
- **L**: Two-column workspace with saved-game list and Add/Edit controls on the left; collapsible selected game summary (default collapsed) and build fields in the center. The Copy Email button sits in the panel header above the build fields. The game editor replaces the build fields when Add Game or Edit Game is pressed.

## Additional notes

Game ID is included in saved game details because the provided email format requires it in the Game Name line.

The widget intentionally does not render a visible email preview and does not include a Clear Draft control.

The Copy Email button lives in the panel header above the build fields, not within the build fields section itself. The game editor replaces the build form when Add or Edit is pressed, and a Close button returns to the build form.

In the L layout, the selected game summary (name, store, live link) is hidden behind a collapsible toggle; collapsed by default so build fields are immediately visible.

## Design reference

Originally built to match a finalized Ideate-mode mockup. The mockup's
raw HTML/CSS is not repeated here - see the widget's own code for the
translated result.
