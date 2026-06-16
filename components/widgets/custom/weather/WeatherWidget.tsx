"use client";

import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Zap,
  Wind,
  Droplets,
  Thermometer,
  LocateFixed,
} from "lucide-react";

interface WeatherData {
  city: string;
  country: string;
  temperature?: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  weatherCode?: number;
  condition?: string;
  cloudCover?: number;
  units: string;
  updatedAt?: string;
  error?: string;
  autoDetected?: boolean;
  locationSource?: "browser" | "city" | "ip";
}

type GeoState =
  | { status: "idle" | "locating" | "blocked" | "unsupported" | "error" }
  | { status: "ready"; lat: number; lon: number };

function ConditionIcon({ code, size = 28 }: { code: number; size?: number }) {
  const base = { size, strokeWidth: 1.75 as const };
  if (code === 0 || code === 1)
    return <Sun {...base} style={{ color: "var(--accent-orange)" }} />;
  if (code <= 3)
    return <Cloud {...base} style={{ color: "var(--text-muted)" }} />;
  if (code <= 48)
    return (
      <Cloud {...base} style={{ color: "var(--text-muted)", opacity: 0.7 }} />
    );
  if (code <= 67)
    return <CloudRain {...base} style={{ color: "var(--accent-cyan)" }} />;
  if (code <= 77)
    return <CloudSnow {...base} style={{ color: "var(--accent-cyan)" }} />;
  if (code <= 86)
    return <CloudRain {...base} style={{ color: "var(--accent-cyan)" }} />;
  return <Zap {...base} style={{ color: "var(--accent-orange)" }} />;
}

function unitSuffix(units: string) {
  return units === "f" ? "°F" : "°C";
}

function windLabel(units: string) {
  return units === "f" ? "mph" : "km/h";
}

function weatherUrl(city: string, units: "f" | "c", geo: GeoState) {
  const params = new URLSearchParams({ units });
  if (city) {
    params.set("city", city);
  } else if (geo.status === "ready") {
    params.set("lat", geo.lat.toFixed(4));
    params.set("lon", geo.lon.toFixed(4));
  }
  return `/api/weather?${params.toString()}`;
}

function LocationBadge({ source }: { source?: WeatherData["locationSource"] }) {
  const label = source === "browser" ? "local" : source === "ip" ? "ip" : "auto";
  return (
    <span
      className="block-label"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: "0.6rem",
        marginBottom: 0,
        color: "var(--accent-cyan)",
        opacity: 0.8,
      }}
    >
      <LocateFixed size={9} strokeWidth={1.75} />
      {label}
    </span>
  );
}

export function WeatherWidget() {
  const { size, settings } = useWidget();
  const city = String(settings.city ?? "").trim();
  const units = settings.units === "c" ? "c" : "f";
  const [geo, setGeo] = useState<GeoState>(() =>
    city ? { status: "idle" } : { status: "locating" },
  );

  useEffect(() => {
    if (city || !("geolocation" in navigator)) return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled) return;
        setGeo({
          status: "ready",
          lat: coords.latitude,
          lon: coords.longitude,
        });
      },
      (error) => {
        if (cancelled) return;
        setGeo({
          status: error.code === error.PERMISSION_DENIED ? "blocked" : "error",
        });
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 600_000 },
    );

    return () => {
      cancelled = true;
    };
  }, [city]);

  const url = useMemo(() => weatherUrl(city, units, geo), [city, units, geo]);
  const { data } = usePolling<WeatherData>(url, 300_000);

  if (!data) {
    return (
      <div className="block-sub" style={{ opacity: 0.5 }}>
        {city ? "loading weather..." : "locating current area..."}
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="block-sub" style={{ color: "var(--accent-orange)" }}>
        {data.error}
      </div>
    );
  }

  if (
    typeof data.temperature !== "number" ||
    typeof data.feelsLike !== "number" ||
    typeof data.humidity !== "number" ||
    typeof data.windSpeed !== "number" ||
    typeof data.weatherCode !== "number" ||
    typeof data.condition !== "string" ||
    typeof data.cloudCover !== "number"
  ) {
    return (
      <div className="block-sub" style={{ color: "var(--accent-orange)" }}>
        weather data unavailable
      </div>
    );
  }

  const tempStr = `${data.temperature}${unitSuffix(units)}`;

  if (size === "S") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          className="block-value accent"
          style={{ lineHeight: 1, fontSize: "2rem" }}
        >
          {tempStr}
        </div>
        <div
          className="block-sub"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {data.condition}
        </div>
        {data.autoDetected && (
          <div>
            <LocationBadge source={data.locationSource} />
          </div>
        )}
      </div>
    );
  }

  if (size === "M") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ConditionIcon code={data.weatherCode} size={36} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="block-value accent" style={{ lineHeight: 1 }}>
              {tempStr}
            </div>
            <div className="block-sub">{data.condition}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span
            className="block-sub"
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <Droplets
              size={12}
              strokeWidth={1.75}
              style={{ color: "var(--accent-cyan)", flexShrink: 0 }}
            />
            {data.humidity}%
          </span>
          <span
            className="block-sub"
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <Wind
              size={12}
              strokeWidth={1.75}
              style={{ color: "var(--text-muted)", flexShrink: 0 }}
            />
            {data.windSpeed} {windLabel(units)}
          </span>
          <span
            className="block-sub"
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <Thermometer
              size={12}
              strokeWidth={1.75}
              style={{ color: "var(--text-muted)", flexShrink: 0 }}
            />
            feels {data.feelsLike}
            {unitSuffix(units)}
          </span>
        </div>
        <div
          className="block-sub"
          style={{
            opacity: 0.55,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {data.city}, {data.country}
          {data.autoDetected && <LocationBadge source={data.locationSource} />}
        </div>
      </div>
    );
  }

  // L size: full panel.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <ConditionIcon code={data.weatherCode} size={52} />
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div
            className="block-value accent"
            style={{ fontSize: "2.2rem", lineHeight: 1 }}
          >
            {tempStr}
          </div>
          <div className="block-sub">{data.condition}</div>
          <div
            className="block-sub"
            style={{
              opacity: 0.55,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {data.city}, {data.country}
            {data.autoDetected && <LocationBadge source={data.locationSource} />}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))",
          gap: 8,
          borderTop: "1.5px solid var(--border)",
          paddingTop: 12,
        }}
      >
        <StatCell
          icon={<Thermometer size={11} strokeWidth={1.75} />}
          label="feels like"
          value={`${data.feelsLike}${unitSuffix(units)}`}
        />
        <StatCell
          icon={
            <Droplets
              size={11}
              strokeWidth={1.75}
              style={{ color: "var(--accent-cyan)" }}
            />
          }
          label="humidity"
          value={`${data.humidity}%`}
        />
        <StatCell
          icon={<Wind size={11} strokeWidth={1.75} />}
          label="wind"
          value={`${data.windSpeed} ${windLabel(units)}`}
        />
        <StatCell
          icon={<Cloud size={11} strokeWidth={1.75} />}
          label="clouds"
          value={`${data.cloudCover}%`}
        />
      </div>
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        className="block-label"
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        {icon}
        {label}
      </span>
      <span className="block-value" style={{ fontSize: "0.95rem" }}>
        {value}
      </span>
    </div>
  );
}
