# Prayer Times

> Maintained automatically by the Widget Creator after every successful
> build turn. Describes this widget's intent and settings so any future
> turn — edit mode, a new session, a different device — has full context
> without exploring other files. Do not edit or delete this by hand.

- **slug**: `prayer-times`
- **icon**: Moon
- **sizes**: S
- **orientations**: h, v
- **originated from**: plan mode

## Concept

A widget that pulls the day's 5 prayer times (Umm al-Qura method) for the user's location, highlights what's current/next, and fires a real browser notification the moment each prayer time arrives.

## Requirements

1. Widget shows the 5 daily Islamic prayer times: Fajr, Dhuhr, Asr, Maghrib, Isha.
2. Calculation method is fixed to Umm al-Qura (Makkah) — Aladhan API method=4. Not user-selectable in this version.
3. Location: on first load, request browser geolocation (navigator.geolocation) to get lat/long for accurate local times. If geolocation is denied or unavailable, fall back to a manual city/country text field in the widget's gear settings (persisted per-instance); if neither geolocation nor a manual location is available, show an empty state prompting the user to allow location or set one in settings.
4. Data fetched from Aladhan API using lat/long (or city if manually set), refreshed once per day (times don't change intraday) plus on location change.
5. Highlight the current prayer window and the next upcoming prayer distinctly (e.g. next prayer gets an accent border/label, current window gets a subtle fill).
6. 'Closing in' indicator: when the next prayer is within 15 minutes, show a subtle visual cue (e.g. pulsing accent dot or color shift on that row/badge) distinct from the normal next-prayer highlight.
7. Browser notification: when a prayer's time is reached, fire a real browser Notification (Notification API) with the prayer name (e.g. 'Asr — it's time'). Request Notification permission on first load or via a settings toggle; if permission is denied, silently skip notifications (no error spam) and note the disabled state in settings.
8. Time comparisons/notification checks run on a client-side interval no coarser than every 60 seconds so notifications fire close to the actual minute.
9. Times display in the user's local time, 12-hour format with am/pm (e.g. '5:42 am').
10. Empty/error states: no location set → prompt to enable location or set city; API fetch failure → show last successfully cached times with a small 'stale' indicator if available, otherwise an error state with a retry action.
11. Settings (gear popover): manual city/country override field, notification on/off toggle.
12. Do not add other calculation methods, Qibla direction, or Hijri calendar in this version — out of scope.

## Per-size content

- **S**: [badge] Single glanceable line: next prayer name + live countdown (e.g. 'Asr in 42m'). Countdown text/dot shifts to the 'closing in' visual cue when under 15 minutes. No full list. [column] Top: next prayer name + live countdown, visually accented. Below: vertical stack of all 5 prayers (Fajr, Dhuhr, Asr, Maghrib, Isha) each with its time, current prayer window subtly filled, next prayer row bordered/accented, and the closing-in cue applied to the next row when under 15 minutes.

## Data source

- **shape**: `{ data: { timings: { Fajr: '05:12', Dhuhr: '12:04', Asr: '15:28', Maghrib: '18:11', Isha: '19:41', ...extraFieldsIgnored }, date: { readable: '...', ... } } }`

## Design reference

Originally built to match a finalized Ideate-mode mockup. The mockup's
raw HTML/CSS is not repeated here — see the widget's own code for the
translated result.
