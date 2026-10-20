# Shift Tracker

> Maintained automatically by the Widget Creator after every successful
> build turn. Describes this widget's intent and settings so any future
> turn — edit mode, a new session, a different device — has full context
> without exploring other files. Do not edit or delete this by hand.

- **slug**: `shift-tracker`
- **icon**: Timer
- **sizes**: S, M
- **orientations**: h
- **originated from**: plan mode

## Concept

A personal attendance widget: clock in to start a 9-hour workday timer (break time included), see live remaining time or overtime once you run past 9 hours, and clock out when you're done — with weekdays-only break windows and weekends automatically off.

## Requirements

1. Widget tracks a single 9-hour work shift per workday (Monday through Friday). Saturday and Sunday are non-work days.
2. On Saturday/Sunday, the widget shows a "no shift today" / weekend state and takes no other action — no clock-in prompt, no timers, no overtime logic, regardless of any stored state.
3. On a workday, if the user has not clocked in ("marked present"), the widget shows an idle/not-clocked-in state with a "Clock In" action; no timer runs and no prompts fire until the user clocks in.
4. Clicking "Clock In" records the current timestamp as the shift start and begins counting elapsed time from that moment.
5. The shift length is 9 hours total, wall-clock, counted continuously from the clock-in timestamp; the lunch break is INCLUDED within these 9 hours — it does not pause or extend the countdown.
6. Lunch break window: Monday–Thursday 1:00 PM–2:00 PM; Friday 1:00 PM–2:15 PM. This is a fixed wall-clock window (not relative to clock-in time).
7. While the current time falls inside that day's break window AND the user is clocked in, the widget shows a distinct "On Break" phase/label, but the 9-hour countdown keeps running underneath it unaffected.
8. Outside the break window and before the 9-hour mark (and clocked in), the widget shows a "Working" phase with elapsed time and time remaining until the 9-hour mark.
9. Once 9 hours have elapsed since clock-in and the user has NOT clocked out, the widget switches to an "Overtime" phase: visually flagged (distinct color/badge, e.g. warning/orange), and continues counting time worked past the 9-hour mark as overtime (e.g. "OT +0h 12m").
10. A "Clock Out" action is available any time after clock-in, in any phase (Working, On Break, or Overtime). Clicking it ends the shift: clears the active clock-in state and returns the widget to idle/not-clocked-in for the rest of the day.
11. Clock-in state persists across page reloads (localStorage) so refreshing the dashboard never loses an in-progress shift.
12. If the stored clock-in state is from a previous calendar day, the widget discards it on load and resets to idle for the new day — a shift never silently carries over.
13. No history/log of past days' shifts is kept; each day is a fresh idle → clock-in → clock-out cycle with no panel or detail view.
14. Time formatting: elapsed/remaining as "Hh Mm" (e.g. "4h 12m"); overtime always prefixed distinctly, e.g. "OT +0h 12m", so it is never confused with remaining time.
15. No external API or backend — fully self-contained client-side widget. All state (clock-in timestamp, derived phase) is computed locally; a local tick (e.g. every 30–60s, not a network poll) advances the displayed elapsed/remaining/overtime.
16. Empty/edge states: idle on a workday before clock-in shows a clear "Clock In" prompt; weekend shows a clear "no shift today" state; both must never show a running timer or overtime flag.

## Per-size content

- **S**: [badge] top to bottom (or single compact row): 1) a status dot/icon colored by phase — neutral/grey for idle or weekend, working color when in the Working phase, a distinct color for On Break, warning/orange for Overtime; 2) compact time text matching the phase — remaining countdown to 9h while Working (e.g. "-4h 12m"), "On Break" while on break, overtime elapsed while in Overtime (e.g. "OT +0h 12m"), "Off" on weekends, or a short "Clock In" prompt when idle on a workday. Tapping the badge clocks in when idle (workday only) or clocks out when active; no effect on weekends.
- **M**: [card] top to bottom: 1) day/phase label ("Not Clocked In", "Working", "On Break", "Overtime", or "Weekend — No Shift"); 2) large elapsed-time stat since clock-in ("—" when idle or weekend); 3) progress bar toward the 9-hour mark, visually distinguishing normal fill (0–100%) from overtime overflow past it; 4) today's break window shown only on workdays (e.g. "Break: 1:00–2:00 PM", or "1:00–2:15 PM" on Friday); 5) an overtime banner/flag shown only during the Overtime phase with the overtime duration; 6) full-width primary action button: "Clock In" when idle, "Clock Out" when active (hidden/disabled on weekends).

## Design reference

Originally built to match a finalized Ideate-mode mockup. The mockup's
raw HTML/CSS is not repeated here — see the widget's own code for the
translated result.
