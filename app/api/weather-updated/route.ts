import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  const tempUnit = req.nextUrl.searchParams.get("tempUnit") === "c" ? "celsius" : "fahrenheit";
  const windUnit = req.nextUrl.searchParams.get("windUnit") === "kmh" ? "kmh" : "mph";

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing location parameters" });
  }

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set(
      "current",
      [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "weather_code",
        "wind_speed_10m",
        "wind_direction_10m",
        "pressure_msl",
        "surface_pressure",
        "uv_index",
        "visibility",
        "dew_point_2m",
      ].join(","),
    );
    url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,sunrise,sunset",
    );
    url.searchParams.set("temperature_unit", tempUnit);
    url.searchParams.set("wind_speed_unit", windUnit);
    url.searchParams.set("forecast_days", "7");
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url.toString(), { next: { revalidate: 300 } });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Open-Meteo API error: ${res.status}`, detail: text });
    }

    const raw = await res.json();

    const hourly = (raw.hourly?.time ?? []).map((t: string, i: number) => ({
      time: t,
      temperature_2m: raw.hourly.temperature_2m?.[i] ?? null,
      precipitation_probability: raw.hourly.precipitation_probability?.[i] ?? null,
      weather_code: raw.hourly.weather_code?.[i] ?? null,
    }));

    const daily = (raw.daily?.time ?? []).map((t: string, i: number) => ({
      time: t,
      temperature_2m_max: raw.daily.temperature_2m_max?.[i] ?? null,
      temperature_2m_min: raw.daily.temperature_2m_min?.[i] ?? null,
      weather_code: raw.daily.weather_code?.[i] ?? null,
      precipitation_sum: raw.daily.precipitation_sum?.[i] ?? null,
      precipitation_probability_max: raw.daily.precipitation_probability_max?.[i] ?? null,
      sunrise: raw.daily.sunrise?.[i] ?? null,
      sunset: raw.daily.sunset?.[i] ?? null,
    }));

    return NextResponse.json({
      current: {
        temperature_2m: raw.current?.temperature_2m ?? null,
        relative_humidity_2m: raw.current?.relative_humidity_2m ?? null,
        apparent_temperature: raw.current?.apparent_temperature ?? null,
        weather_code: raw.current?.weather_code ?? null,
        wind_speed_10m: raw.current?.wind_speed_10m ?? null,
        wind_direction_10m: raw.current?.wind_direction_10m ?? null,
        pressure_msl: raw.current?.pressure_msl ?? null,
        surface_pressure: raw.current?.surface_pressure ?? null,
        uv_index: raw.current?.uv_index ?? null,
        visibility: raw.current?.visibility ?? null,
        dew_point_2m: raw.current?.dew_point_2m ?? null,
        time: raw.current?.time ?? null,
      },
      hourly,
      daily,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message });
  }
}
