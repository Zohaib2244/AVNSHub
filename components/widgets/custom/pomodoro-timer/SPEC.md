# Pomodoro Timer

> Maintained automatically by the Widget Creator after every successful
> build turn. Describes this widget's intent and settings so any future
> turn — edit mode, a new session, a different device — has full context
> without exploring other files. Do not edit or delete this by hand.

- **slug**: `pomodoro-timer`
- **icon**: Timer
- **sizes**: S, M, L
- **orientations**: h
- **originated from**: plan mode

## Concept

A pomodoro timer widget with start/pause/reset, session counter, focus/break phases, and daily stats — all inline on the dashboard, no external service.

## Per-size content

- **S**: Compact circular timer showing remaining minutes with a progress ring and current phase label (FOCUS / BREAK).
- **M**: Full timer card with start/pause/reset controls, phase toggle indicator, session counter (e.g. 3/4), and an editable focus duration dial.
- **L**: Extended panel with all of M plus a daily session log, distraction/break tally, and a quick task-name input bound to the current session.

## Design reference

Originally built to match a finalized Ideate-mode mockup. The mockup's
raw HTML/CSS is not repeated here — see the widget's own code for the
translated result.
