import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Coords = {
  lat: number;
  lon: number;
  name: string;
  country: string;
  autoDetected: boolean;
  locationSource: "browser" | "city" | "ip";
};

type GeoSearchResponse = {
  results?: Array<{
    latitude?: unknown;
    longitude?: unknown;
    name?: unknown;
    country_code?: unknown;
  }>;
};

type IpGeoResponse = {
  status?: unknown;
  lat?: unknown;
  lon?: unknown;
  city?: unknown;
  countryCode?: unknown;
};

type CurrentWeather = {
  temperature_2m?: unknown;
  apparent_temperature?: unknown;
  relative_humidity_2m?: unknown;
  wind_speed_10m?: unknown;
  weather_code?: unknown;
  cloud_cover?: unknown;
  time?: unknown;
};

type WeatherResponse = {
  current?: CurrentWeather;
};

const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Icy fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  61: "Light rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Moderate showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm + hail",
  99: "Thunderstorm + heavy hail",
};

function numberField(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Weather ${label} missing`);
  }
  return value;
}

function stringField(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function parseCoord(value: string | null, min: number, max: number) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

async function resolveCoords(
  city: string,
  lat: number | null,
  lon: number | null,
  clientIp: string,
): Promise<Coords> {
  if (city) {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", city);
    geoUrl.searchParams.set("count", "1");
    geoUrl.searchParams.set("language", "en");
    geoUrl.searchParams.set("format", "json");

    const geoRes = await fetch(
      geoUrl,
      { next: { revalidate: 3600 } },
    );
    if (!geoRes.ok) throw new Error("Geocoding request failed");
    const geoData = (await geoRes.json()) as GeoSearchResponse;
    const result = geoData.results?.[0];
    if (!result) throw new Error(`City "${city}" not found`);

    return {
      lat: numberField(result.latitude, "latitude"),
      lon: numberField(result.longitude, "longitude"),
      name: stringField(result.name, city),
      country: stringField(result.country_code).toUpperCase(),
      autoDetected: false,
      locationSource: "city",
    };
  }

  if (lat !== null && lon !== null) {
    return {
      lat,
      lon,
      name: "current area",
      country: "",
      autoDetected: true,
      locationSource: "browser",
    };
  }

  // Last fallback: auto-detect via IP geolocation.
  const targetIp =
    clientIp && clientIp !== "127.0.0.1" && clientIp !== "::1"
      ? clientIp
      : "";
  const ipRes = await fetch(
    `http://ip-api.com/json/${encodeURIComponent(targetIp)}?fields=status,lat,lon,city,countryCode`,
    { next: { revalidate: 3600 } },
  );
  if (!ipRes.ok) throw new Error("IP geolocation request failed");
  const ipData = (await ipRes.json()) as IpGeoResponse;
  if (ipData.status !== "success")
    throw new Error("Could not detect location from IP");
  return {
    lat: numberField(ipData.lat, "latitude"),
    lon: numberField(ipData.lon, "longitude"),
    name: stringField(ipData.city, "local"),
    country: stringField(ipData.countryCode).toUpperCase(),
    autoDetected: true,
    locationSource: "ip",
  };
}

export async function GET(req: NextRequest) {
  const city = (req.nextUrl.searchParams.get("city") ?? "").trim();
  const units = req.nextUrl.searchParams.get("units") === "c" ? "c" : "f";
  const lat = parseCoord(req.nextUrl.searchParams.get("lat"), -90, 90);
  const lon = parseCoord(req.nextUrl.searchParams.get("lon"), -180, 180);

  // Extract real client IP from common reverse-proxy headers.
  const forwarded = req.headers.get("x-forwarded-for");
  const clientIp = (
    forwarded
      ? forwarded.split(",")[0]
      : (req.headers.get("x-real-ip") ?? "")
  ).trim();

  try {
    const {
      lat: resolvedLat,
      lon: resolvedLon,
      name,
      country,
      autoDetected,
      locationSource,
    } = await resolveCoords(city, lat, lon, clientIp);
    const tempUnit = units === "f" ? "fahrenheit" : "celsius";
    const windUnit = units === "f" ? "mph" : "kmh";
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(resolvedLat));
    weatherUrl.searchParams.set("longitude", String(resolvedLon));
    weatherUrl.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,cloud_cover",
    );
    weatherUrl.searchParams.set("temperature_unit", tempUnit);
    weatherUrl.searchParams.set("wind_speed_unit", windUnit);
    weatherUrl.searchParams.set("timezone", "auto");

    const weatherRes = await fetch(
      weatherUrl,
      { next: { revalidate: 300 } },
    );
    if (!weatherRes.ok) throw new Error("Weather request failed");

    const weatherData = (await weatherRes.json()) as WeatherResponse;
    const current = weatherData.current;
    if (!current) throw new Error("Weather data unavailable");
    const weatherCode = Math.round(numberField(current.weather_code, "code"));

    return NextResponse.json({
      city: name,
      country,
      temperature: Math.round(numberField(current.temperature_2m, "temperature")),
      feelsLike: Math.round(numberField(current.apparent_temperature, "feels like")),
      humidity: Math.round(numberField(current.relative_humidity_2m, "humidity")),
      windSpeed: Math.round(numberField(current.wind_speed_10m, "wind speed")),
      weatherCode,
      condition: WMO_CODES[weatherCode] ?? "Unknown",
      cloudCover: Math.round(numberField(current.cloud_cover, "cloud cover")),
      units,
      updatedAt: stringField(current.time),
      autoDetected,
      locationSource,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch weather";
    console.error("weather route error:", err);
    return NextResponse.json({
      city: city || "unknown",
      country: "",
      units,
      error: message,
    });
  }
}
