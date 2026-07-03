# Weather

> Maintained automatically by the Widget Creator after every successful
> build turn. Describes this widget's intent and settings so any future
> turn — edit mode, a new session, a different device — has full context
> without exploring other files. Do not edit or delete this by hand.

- **slug**: `weather-updated`
- **icon**: CloudSun
- **sizes**: S, M, L
- **orientations**: h
- **originated from**: plan mode

## Concept

Current conditions, hourly outlook, and a 7-day forecast sourced from Open-Meteo (free, no API key). The widget scales from a glanceable temp badge (S) to a full weather panel (L).

## Requirements

1. Display current weather conditions from Open-Meteo API (no API key needed).
2. Settings panel (gear icon in card chrome) exposes: latitude, longitude, location display name (default 'Home'), temperature unit (°C / °F), wind speed unit (km/h / mph), polling interval in minutes (default 30).
3. Current conditions block: temperature (large), condition label from WMO weather code mapping, feels-like temperature, humidity %, wind speed + direction arrow, weather condition icon (mapped from WMO code 0–99 — sun, partly cloudy, overcast, fog, drizzle, rain, snow, thunderstorm).
4. Hourly forecast: a horizontal scrollable strip of time slots. Each slot shows: hour label (e.g. '2 PM'), temperature, weather condition icon, precipitation probability % (shown as a small number or bar). M shows next 8 hours, L shows all 24 hours of today.
5. 7-day daily forecast (L size only): one row per day with day label (Mon/Tue/…), weather condition icon, high temp / low temp, precipitation sum, and a small horizontal bar showing precip probability.
6. Loading state: skeleton placeholders for each section.
7. Error state: banner reading 'Weather data unavailable' with the error message and a Retry button that re-fetches.
8. Empty state: if lat/lon are default (0,0) and never configured, show 'Configure your location in settings' with a button that opens the settings panel directly.
9. Stale data indicator: when the last fetch is older than 2× the polling interval, show a subtle '(stale)' label next to the temperature and auto-refresh.
10. Manual refresh button in the card footer.
11. WMO weather code to condition label mapping: 0=Clear, 1-3=Partly Cloudy, 45/48=Fog, 51-55=Drizzle, 56-57=Freezing Drizzle, 61-65=Rain, 66-67=Freezing Rain, 71-77=Snow, 80-82=Rain Showers, 85-86=Snow Showers, 95-99=Thunderstorm.

## Per-size content

- **S**: Location display name (small label, top). Current temperature (large, bold). Weather condition icon (large, beside temp). Everything fits in a compact badge — no hourly strip, no feels-like.
- **M**: Location display name (top left). Current conditions card (left/top area): temperature (large), weather condition icon, feels-like label, humidity %, wind speed + direction arrow. Below: 'Hourly' section label, then a horizontal scrollable strip of 8 hourly slots (hour label, condition icon, temp, precip probability % as a small number). Footer: last-updated timestamp + manual refresh button.
- **L**: Location display name (top left). Current conditions card (wide): temperature (x-large), weather condition icon, feels-like temp, humidity %, wind speed + direction arrow, pressure hPa, UV index. Below: 'Hourly' label + full 24-slot horizontal strip (hour label, condition icon, temp, precip probability as a small bar). Below that: '7-Day Forecast' label + table with rows: day label (Mon/Tue/…), weather icon, Hi temp / Lo temp, precipitation sum, precip probability bar. Footer: last-updated timestamp + manual refresh button.

## Data source

- **shape**: `{
  "current": {
    "temperature_2m": number,
    "relative_humidity_2m": number,
    "apparent_temperature": number,
    "weather_code": number,
    "wind_speed_10m": number,
    "wind_direction_10m": number,
    "pressure_msl": number,
    "surface_pressure": number
  },
  "hourly": [{
    "time": string (ISO),
    "temperature_2m": number,
    "precipitation_probability": number,
    "weather_code": number
  }],
  "daily": [{
    "time": string (ISO date),
    "temperature_2m_max": number,
    "temperature_2m_min": number,
    "weather_code": number,
    "precipitation_sum": number,
    "precipitation_probability_max": number
  }]
}`

## Additional notes

Open-Meteo requires lat/lon as query params. The hourly endpoint returns 168 hours by default — the widget should request just today or pass forecast_days=1 for hourly and forecast_days=7 for daily to keep responses lean. WMO codes map to Lucide icons via a static lookup table, not an image CDN.

## Design reference

Originally built to match a finalized Ideate-mode mockup. The mockup's
raw HTML/CSS is not repeated here — see the widget's own code for the
translated result.
