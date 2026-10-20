# Gym Ledger

> Maintained automatically by the Widget Creator after every successful
> build turn. Describes this widget's intent and settings so any future
> turn — edit mode, a new session, a different device — has full context
> without exploring other files. Do not edit or delete this by hand.

- **slug**: `gym-ledger`
- **icon**: Dumbbell
- **sizes**: S, M, L
- **orientations**: h
- **originated from**: plan mode
- **hover on expand**: enabled (both)

## Concept

Gym Ledger is a local-first fitness dashboard widget for logging workouts and meals while turning gaps into practical next-step suggestions. It gives quick daily accountability in S/M and a fuller training plus nutrition panel in L.

## Requirements

1. Build a custom gym tracking widget that tracks workouts, meals, smart suggestions, and progress snapshots in one widget.
2. Use a manual/local-first model for v1: all workouts, meals, settings, and history persist locally for this canvas; no external API is required unless added later.
3. Include a Workout Log section with these fields: date, split, exercises, sets, reps, weight, RPE, notes, PRs, skipped muscle groups.
4. Include Workout Log controls with exact labels: "+ Workout", "+ Exercise", "Save Workout", "Mark PR", "Skip Muscle", "Clear Draft".
5. Workout entries must support multiple exercises per workout, and each exercise must support sets, reps, weight, and optional RPE.
6. PRs must be tracked from saved workouts and surfaced in the progress snapshot.
7. Skipped muscle groups must be recorded so the widget can suggest what to train next.
8. Include a Meals + Macros section with these fields: meals, calories, protein, carbs, fats, water, protein left today.
9. Include Meals + Macros controls with exact labels: "+ Meal", "Save Meal", "+ Water", "Reset Today".
10. Meal entries must support meal name, calories, protein, carbs, fats, and optional notes.
11. Water tracking must show today’s water progress against a configurable daily target.
12. Include daily target settings for calories, protein, carbs, fats, water, weekly workout goal, weight unit, and preferred split.
13. Include a Smart Suggestions section that suggests what more the user can add based on today’s gaps and recent history.
14. Smart Suggestions must include suggestions like: add protein, hit legs next, increase weight, take a rest day, drink water, or prep a meal based on today’s gaps.
15. Suggestions should be practical and short, with one primary suggestion and optional secondary suggestions.
16. Include a Progress Snapshot section with these metrics: weekly volume, streak, body weight trend, PR history, adherence score.
17. Weekly volume should summarize total sets and total lifted weight when weight data exists.
18. Streak should count consecutive days with either a saved workout or saved meal activity.
19. Body weight trend should be supported as an optional manual entry; if no body weight entries exist, show an empty state instead of a fake trend.
20. Adherence score should combine workout completion, macro completion, and water completion into a simple percentage.
21. Empty states must be specific: no workouts yet, no meals yet, no targets set, no PRs yet, no body weight trend yet.
22. Error states should avoid blocking the widget; invalid numeric entries should show inline validation and keep the draft editable.
23. Avoid duplicating existing widgets such as Pomodoro Timer, Weather, Now Playing, Office Time Tracker, Notes, or Server Stats.
24. Keep the widget dense and glanceable in AVN Hub’s chunky card style; do not add long instructional text inside the widget.

## Per-size content

- **S**: Top to bottom: title label "Gym Ledger"; one large adherence score percentage; compact line for protein left today; compact line for next smart suggestion; tiny streak indicator.
- **M**: Top to bottom: header with today’s adherence score and streak; Workout Log mini form with split, quick exercise row, and "+ Workout" / "Save Workout" controls; Meals + Macros summary with calories, protein, carbs, fats, water, protein left today, and "+ Meal" / "+ Water" controls; Smart Suggestions area with one primary suggestion and up to two secondary suggestions.
- **L**: Top to bottom: header with adherence score, streak, and weekly volume; full Workout Log with date, split, exercises, sets, reps, weight, RPE, notes, PRs, skipped muscle groups, and all workout controls; full Meals + Macros section with meals, calories, protein, carbs, fats, water, protein left today, and all meal controls; Smart Suggestions panel listing add protein, hit legs next, increase weight, take a rest day, drink water, or prep a meal when relevant; Progress Snapshot with weekly volume, streak, body weight trend, PR history, and adherence score; settings drawer for daily targets and units.
