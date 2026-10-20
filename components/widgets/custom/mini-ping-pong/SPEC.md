# Mini Ping Pong

> Maintained automatically by the Widget Creator after every successful
> build turn. Describes this widget's intent and settings so any future
> turn — edit mode, a new session, a different device — has full context
> without exploring other files. Do not edit or delete this by hand.

- **slug**: `mini-ping-pong`
- **icon**: Gamepad2
- **sizes**: S, M, L
- **orientations**: h
- **originated from**: plan mode

## Concept

A tiny Pong-style arcade widget for quick play directly on the AVN Hub canvas. It works as a glanceable score badge in S and becomes a playable mini game in M and L.

## Requirements

1. Build a mini ping pong game widget.
2. The game is a compact Pong-style paddle game with a player paddle, CPU paddle, ball, center line, player score, CPU score, and high score.
3. Include exact controls: "Start", "Pause", "Reset".
4. Include a difficulty control with exact options: "Easy", "Normal", "Hard".
5. Player controls use mouse drag or touch drag inside the playfield; keyboard controls use Up Arrow and Down Arrow.
6. CPU paddle tracks the ball with difficulty-based speed.
7. First side to 7 points wins the round.
8. After a round ends, show "You Win" or "CPU Wins" and keep the final score visible until "Reset" or "Start" is pressed.
9. Persist high score locally per browser/canvas.
10. S size is not fully playable; it shows quick game status and high score only.
11. M size is the default playable version with compact controls.
12. L size adds a larger playfield, round history, and difficulty selector.
13. Empty state shows "Ready" before the first game starts.
14. Avoid external APIs, multiplayer, sound effects, and complex physics.

## Per-size content

- **S**: Top to bottom: title "PING"; current score as Player-CPU; small status label "Ready", "Playing", "Paused", "You Win", or "CPU Wins"; high score.
- **M**: Top to bottom: compact header with score and status; playable Pong canvas; footer controls "Start", "Pause", "Reset".
- **L**: Top to bottom: larger header with player score, CPU score, high score, and status; larger playable Pong canvas; controls row with "Start", "Pause", "Reset"; difficulty segmented control "Easy", "Normal", "Hard"; recent round history.
