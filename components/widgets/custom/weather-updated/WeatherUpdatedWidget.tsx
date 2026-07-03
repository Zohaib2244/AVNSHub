"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlertTriangle, ArrowUp, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain,
  CloudSnow, CloudSun, Droplets, Eye, Gauge, MapPin, RefreshCw, Settings, Sun,
  Thermometer, Wind, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";

/* ─── types ─── */

interface WeatherSettings {
  lat: number;
  lon: number;
  locationName: string;
  tempUnit: "f" | "c";
  windUnit: "mph" | "kmh";
  pollingInterval: number;
}

interface CurrentWeather {
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  apparent_temperature: number | null;
  weather_code: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
  pressure_msl: number | null;
  surface_pressure: number | null;
  uv_index: number | null;
  visibility: number | null;
  dew_point_2m: number | null;
  time: string | null;
}

interface HourlySlot {
  time: string;
  temperature_2m: number | null;
  precipitation_probability: number | null;
  weather_code: number | null;
}

interface DailySlot {
  time: string;
  temperature_2m_max: number | null;
  temperature_2m_min: number | null;
  weather_code: number | null;
  precipitation_sum: number | null;
  precipitation_probability_max: number | null;
  sunrise: string | null;
  sunset: string | null;
}

interface WeatherData {
  current: CurrentWeather | null;
  hourly: HourlySlot[] | null;
  daily: DailySlot[] | null;
  lastUpdated: string | null;
  error?: string;
}

/* ─── constants ─── */

const SETTINGS_KEY = "nutmag-weather-updated-settings";

const DEFAULT_SETTINGS: WeatherSettings = {
  lat: 0,
  lon: 0,
  locationName: "Home",
  tempUnit: "f",
  windUnit: "mph",
  pollingInterval: 30,
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DIR_NAMES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const WMO_ICONS: Record<number, LucideIcon> = {
  0: Sun,
  1: CloudSun,
  2: CloudSun,
  3: CloudSun,
  45: CloudFog,
  48: CloudFog,
  51: CloudDrizzle,
  53: CloudDrizzle,
  55: CloudDrizzle,
  56: CloudDrizzle,
  57: CloudDrizzle,
  61: CloudRain,
  63: CloudRain,
  65: CloudRain,
  66: CloudRain,
  67: CloudRain,
  71: CloudSnow,
  73: CloudSnow,
  75: CloudSnow,
  77: CloudSnow,
  80: CloudRain,
  81: CloudRain,
  82: CloudRain,
  85: CloudSnow,
  86: CloudSnow,
  95: CloudLightning,
  96: CloudLightning,
  99: CloudLightning,
};

const WMO_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Partly Cloudy",
  2: "Partly Cloudy",
  3: "Partly Cloudy",
  45: "Fog",
  48: "Fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  56: "Freezing Drizzle",
  57: "Freezing Drizzle",
  61: "Rain",
  63: "Rain",
  65: "Rain",
  66: "Freezing Rain",
  67: "Freezing Rain",
  71: "Snow",
  73: "Snow",
  75: "Snow",
  77: "Snow",
  80: "Rain Showers",
  81: "Rain Showers",
  82: "Rain Showers",
  85: "Snow Showers",
  86: "Snow Showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

/* ─── helpers ─── */

function getWmoIcon(code: number | null): LucideIcon {
  if (code === null) return Cloud;
  return WMO_ICONS[code] ?? Cloud;
}

function getWmoLabel(code: number | null): string {
  if (code === null) return "Unknown";
  return WMO_LABELS[code] ?? "Unknown";
}

function formatHour(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}${ampm}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return DAY_NAMES[d.getDay()];
}

function degreesToDir(deg: number | null): string {
  if (deg === null) return "";
  return DIR_NAMES[Math.round(deg / 45) % 8];
}

function loadSettings(): WeatherSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/* ─── font/style tokens ─── */

const mono: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const dotGothic: CSSProperties = { fontFamily: "var(--font-dot-gothic), monospace" };
const uppercase: CSSProperties = { textTransform: "uppercase" };
const border: CSSProperties = { border: "1.5px solid var(--border)" };

/* ─── component ─── */

export function WeatherUpdatedWidget() {
  const { size } = useWidget();
  const [settings, setSettings] = useState<WeatherSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<WeatherSettings>(settings);
  const [mTab, setMTab] = useState<"hourly" | "details">("hourly");
  const [lTab, setLTab] = useState<"hourly" | "daily">("hourly");
  const [spin, setSpin] = useState(false);
  const [, tick] = useState(0);
  const lastFetchRef = useRef(Date.now());

  const isEmpty = settings.lat === 0 && settings.lon === 0;

  const apiUrl = useMemo(() => {
    if (isEmpty) return "";
    const p = new URLSearchParams({
      lat: String(settings.lat),
      lon: String(settings.lon),
      tempUnit: settings.tempUnit,
      windUnit: settings.windUnit,
    });
    return `/api/weather-updated?${p}`;
  }, [settings.lat, settings.lon, settings.tempUnit, settings.windUnit, isEmpty]);

  const { data, refresh } = usePolling<WeatherData>(
    apiUrl,
    settings.pollingInterval * 60 * 1000,
  );

  /* track last successful fetch time */
  useEffect(() => {
    if (data && !("error" in data)) {
      lastFetchRef.current = Date.now();
    }
  }, [data]);

  /* force re-render every 60s for stale indicator */
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  /* auto-refresh when data is stale */
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - lastFetchRef.current > settings.pollingInterval * 60_000 * 2) {
        refresh();
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [settings.pollingInterval, refresh]);

  const isStale = !isEmpty && !!data && !("error" in data) && settings.pollingInterval > 0 &&
    Date.now() - lastFetchRef.current > settings.pollingInterval * 60_000 * 2;

  const isLoading = !isEmpty && data === null;
  const isError = !!(data && "error" in data);
  const weatherData = data && !("error" in data) ? (data as WeatherData) : null;

  const handleRefresh = useCallback(() => {
    setSpin(true);
    refresh();
    setTimeout(() => setSpin(false), 600);
  }, [refresh]);

  const openSettings = useCallback(() => {
    setDraft(settings);
    setShowSettings(true);
  }, [settings]);

  const saveDraft = useCallback(() => {
    setSettings(draft);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(draft));
    setShowSettings(false);
  }, [draft]);

  const tempSymbol = settings.tempUnit === "f" ? "F" : "C";
  const windLabel = settings.windUnit === "mph" ? "mph" : "km/h";

  const formatTemp = (v: number | null) => (v !== null ? `${Math.round(v)}°` : "--°");
  const formatPct = (v: number | null) => (v !== null ? `${v}%` : "--%");

  /* ─── core weather values ─── */
  const c = weatherData?.current;
  const weatherCode = c?.weather_code ?? null;
  const WmoIcon = getWmoIcon(weatherCode);
  const conditionLabel = getWmoLabel(weatherCode);
  const temp = c?.temperature_2m ?? null;
  const feelsLike = c?.apparent_temperature ?? null;
  const humidity = c?.relative_humidity_2m ?? null;
  const windSpeed = c?.wind_speed_10m ?? null;
  const windDir = c?.wind_direction_10m ?? null;
  const pressure = c?.pressure_msl ?? c?.surface_pressure ?? null;
  const uvIndex = c?.uv_index ?? null;
  const visibility = c?.visibility ?? null;
  const dewPoint = c?.dew_point_2m ?? null;
  const obsTime = c?.time ?? null;
  const sunrise = weatherData?.daily?.[0]?.sunrise ?? null;
  const sunset = weatherData?.daily?.[0]?.sunset ?? null;
  const hourly = weatherData?.hourly ?? [];
  const daily = weatherData?.daily ?? [];

  const iconColor = weatherCode === 0 ? "var(--accent-orange)" : "var(--accent-warm)";

  /* ─── empty state ─── */
  if (isEmpty && !data) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", padding: 10 }}>
        <MapPin size={24} style={{ color: "var(--text-muted-dim)" }} />
        <div style={{ fontSize: "0.55rem", color: "var(--text-muted)", maxWidth: 260, lineHeight: 1.4 }}>
          Configure your location in settings to see weather data.
        </div>
        <button onClick={openSettings} style={{ background: "var(--accent-orange)", border: "none", color: "var(--badge-text)", cursor: "pointer", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "0.52rem", padding: "4px 12px", borderRadius: 6, fontWeight: 500 }} type="button">
          Open Settings
        </button>
        {showSettings && <SettingsOverlay />}
      </div>
    );
  }

  /* ─── loading state ─── */
  if (isLoading) {
    return <LoadingSkeleton size={size} />;
  }

  /* ─── error state ─── */
  if (isError) {
    const msg = (data as { error?: string }).error ?? "Unknown error";
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", padding: 10 }}>
        <AlertTriangle size={24} style={{ color: "var(--status-down)" }} />
        <div style={{ ...dotGothic, fontSize: "0.65rem", color: "var(--status-down)" }}>Weather data unavailable</div>
        <div style={{ fontSize: "0.52rem", color: "var(--text-muted)" }}>{msg}</div>
        <button onClick={handleRefresh} style={{ background: "var(--status-down)", border: "none", color: "var(--badge-text)", cursor: "pointer", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "0.52rem", padding: "4px 12px", borderRadius: 6, fontWeight: 500 }} type="button">
          Retry
        </button>
      </div>
    );
  }

  /* ─── no data (should not reach here, but guard) ─── */
  if (!weatherData) return null;

  /* ═══════════════════════════════════════════════════════════════
     DATA — S SIZE
     ═══════════════════════════════════════════════════════════════ */
  if (size === "S") {
    return (
      <Root>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
          <span style={{ ...dotGothic, ...uppercase, fontSize: "0.5rem", letterSpacing: "0.12em", color: "var(--text-muted-dim)" }}>
            {settings.locationName}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <WmoIcon size={44} style={{ color: iconColor, flex: "none" }} />
            <span style={{ ...mono, fontSize: "2.4rem", fontWeight: 500, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {formatTemp(temp)}
            </span>
          </div>
          <span style={{ ...dotGothic, ...uppercase, fontSize: "0.5rem", color: "var(--text-muted)", letterSpacing: "0.06em" }}>
            {conditionLabel}
          </span>
        </div>
        {isStale && <StaleIndicator />}
        {showSettings && <SettingsOverlay />}
      </Root>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     DATA — M SIZE
     ═══════════════════════════════════════════════════════════════ */
  if (size === "M") {
    return (
      <Root>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, padding: "2px 10px 8px" }}>
          {/* header */}
          <HeaderRow
            location={settings.locationName}
            onSettings={openSettings}
            onRefresh={handleRefresh}
            spin={spin}
          />

          {/* hero tile */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "var(--bg-nested)", borderRadius: 10, ...border }}>
            <span style={{ ...mono, fontSize: "2.8rem", fontWeight: 500, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {formatTemp(temp)}
            </span>
            <WmoIcon size={44} style={{ color: iconColor }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ ...dotGothic, ...uppercase, fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--accent-orange)" }}>
                {conditionLabel}
              </span>
              <span style={{ fontSize: "0.55rem", color: "var(--text-muted)" }}>
                Feels like {formatTemp(feelsLike)}
              </span>
            </div>
          </div>

          {/* pill row */}
          <PillRow>
            <Pill icon={<Droplets size={12} />} label="Humidity" value={formatPct(humidity)} />
            <Pill icon={<ArrowUp size={12} style={{ transform: `rotate(${windDir ?? 0}deg)`, flex: "none" }} />} label="Wind" value={`${windSpeed !== null ? Math.round(windSpeed) : "--"}${windLabel}`} />
            <Pill icon={<Gauge size={12} />} label="" value={pressure !== null ? `${Math.round(pressure)}hPa` : "--hPa"} />
          </PillRow>

          {/* tab bar */}
          <div style={{ display: "flex", gap: 2, background: "var(--bg-nested)", borderRadius: 8, padding: 2 }}>
            <TabButton active={mTab === "hourly"} onClick={() => setMTab("hourly")}>Hourly</TabButton>
            <TabButton active={mTab === "details"} onClick={() => setMTab("details")}>Details</TabButton>
          </div>

          {/* hourly tab */}
          {mTab === "hourly" && (
            <div style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1, padding: "4px 0", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
              {hourly.slice(0, 8).map((slot) => {
                const SI = getWmoIcon(slot.weather_code);
                return (
                  <div key={slot.time} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: "none", padding: "4px 5px", borderRadius: 6, background: "var(--bg-card)", minWidth: 42 }}>
                    <span style={{ fontSize: "0.48rem", color: "var(--text-muted-dim)", ...dotGothic }}>{formatHour(slot.time)}</span>
                    <SI size={16} style={{ color: slot.weather_code === 0 ? "var(--accent-orange)" : "var(--accent-warm)" }} />
                    <span style={{ ...mono, fontSize: "0.7rem", color: "var(--text-primary)", fontWeight: 500 }}>{formatTemp(slot.temperature_2m)}</span>
                    <span style={{ ...mono, fontSize: "0.45rem", color: "var(--accent-cyan)" }}>
                      {slot.precipitation_probability !== null ? `${slot.precipitation_probability}%` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* details tab */}
          {mTab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 6, padding: "6px 0", flex: 1 }}>
              <PillRow>
                <Pill icon={<Eye size={12} />} label="UV" value={uvIndex !== null ? String(Math.round(uvIndex)) : "--"} />
                <Pill icon={<Eye size={12} />} label="Visibility" value={visibility !== null ? `${(visibility / 1609.34).toFixed(0)}mi` : "--mi"} />
                <Pill icon={<Thermometer size={12} />} label="Dew Point" value={formatTemp(dewPoint)} />
                {sunrise && <Pill icon={<Sun size={12} />} label="Sunrise" value={formatTime(sunrise)} />}
                {sunset && <Pill icon={<Sun size={12} />} label="Sunset" value={formatTime(sunset)} />}
              </PillRow>
              <div style={{ fontSize: "0.5rem", color: "var(--text-muted-dim)" }}>
                Updated {obsTime ? formatTime(obsTime) : ""}
                {isStale && <> &middot; <StaleIndicator /></>}
              </div>
            </div>
          )}
        </div>
        {showSettings && <SettingsOverlay />}
      </Root>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     DATA — L SIZE
     ═══════════════════════════════════════════════════════════════ */
  return (
    <Root>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, padding: "2px 10px 6px", overflow: "hidden" }}>
        {/* header */}
        <HeaderRow
          location={settings.locationName}
          onSettings={openSettings}
          onRefresh={handleRefresh}
          spin={spin}
          large
        />

        {/* hero row: tile + compact pills */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 10px", background: "var(--bg-nested)", borderRadius: 10, ...border }}>
            <span style={{ ...mono, fontSize: "3rem", fontWeight: 500, lineHeight: 1 }}>{formatTemp(temp)}</span>
            <WmoIcon size={44} style={{ color: iconColor }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ ...dotGothic, ...uppercase, fontSize: "0.65rem", letterSpacing: "0.1em", color: "var(--accent-orange)" }}>
                {conditionLabel}
              </span>
              <span style={{ fontSize: "0.55rem", color: "var(--text-muted)" }}>
                Feels like {formatTemp(feelsLike)} &middot; Updated {obsTime ? formatTime(obsTime) : ""}
              </span>
            </div>
          </div>
          <LPillRow>
            <LPill icon={<Droplets size={12} />} value={formatPct(humidity)} />
            <LPill icon={<ArrowUp size={12} style={{ transform: `rotate(${windDir ?? 0}deg)`, flex: "none" }} />} value={`${windSpeed !== null ? Math.round(windSpeed) : ""} ${degreesToDir(windDir)}`} />
            <LPill icon={<Gauge size={12} />} value={pressure !== null ? String(Math.round(pressure)) : "--"} />
            <LPill icon={<Eye size={12} />} value={`UV ${uvIndex !== null ? Math.round(uvIndex) : "--"}`} />
            <LPill icon={<Thermometer size={12} />} value={`${formatTemp(feelsLike)}${tempSymbol}`} />
            {isStale && <StaleBadge />}
          </LPillRow>
        </div>

        {/* tab bar */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-nested)", borderRadius: 8, padding: 2, flex: "none" }}>
          <TabButton active={lTab === "hourly"} onClick={() => setLTab("hourly")}>Hourly (24)</TabButton>
          <TabButton active={lTab === "daily"} onClick={() => setLTab("daily")}>7-Day Forecast</TabButton>
        </div>

        {/* hourly tab */}
        {lTab === "hourly" && (
          <div style={{ display: "flex", gap: 3, overflowX: "auto", flex: 1, padding: "4px 0", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            {hourly.map((slot) => {
              const SI = getWmoIcon(slot.weather_code);
              const precipPct = slot.precipitation_probability ?? 0;
              return (
                <div key={slot.time} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, flex: "none", padding: "3px 4px", borderRadius: 5, background: "var(--bg-card)", minWidth: 38 }}>
                  <span style={{ fontSize: "0.45rem", color: "var(--text-muted-dim)", ...dotGothic }}>{formatHour(slot.time)}</span>
                  <SI size={16} style={{ color: slot.weather_code === 0 ? "var(--accent-orange)" : "var(--accent-warm)" }} />
                  <span style={{ ...mono, fontSize: "0.6rem", color: "var(--text-primary)", fontWeight: 500 }}>{formatTemp(slot.temperature_2m)}</span>
                  <div style={{ width: "100%", height: 2, background: "var(--bg-nested)", borderRadius: 1, overflow: "hidden", marginTop: 1 }}>
                    <div style={{ height: "100%", background: "var(--accent-cyan)", borderRadius: 1, width: `${Math.min(precipPct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* daily tab */}
        {lTab === "daily" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, fontSize: "0.52rem", padding: "2px 0", flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            {daily.map((slot) => {
              const DI = getWmoIcon(slot.weather_code);
              const hi = slot.temperature_2m_max;
              const lo = slot.temperature_2m_min;
              const precipSum = slot.precipitation_sum;
              const precipProb = slot.precipitation_probability_max ?? 0;
              return (
                <div key={slot.time} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", borderRadius: 4 }}>
                  <span style={{ ...dotGothic, ...uppercase, fontSize: "0.52rem", letterSpacing: "0.06em", color: "var(--text-muted)", width: 26, flex: "none" }}>
                    {formatDay(slot.time)}
                  </span>
                  <DI size={16} style={{ color: slot.weather_code === 0 ? "var(--accent-orange)" : "var(--accent-warm)", flex: "none" }} />
                  <span style={{ display: "flex", gap: 3, width: 52, flex: "none" }}>
                    <span style={{ color: "var(--text-primary)", ...mono }}>{hi !== null ? `${Math.round(hi)}°` : "--°"}</span>
                    <span style={{ color: "var(--text-muted-dim)", ...mono }}>{lo !== null ? `${Math.round(lo)}°` : "--°"}</span>
                  </span>
                  <span style={{ color: "var(--accent-cyan)", width: 28, textAlign: "right", flex: "none", fontSize: "0.48rem", ...mono }}>
                    {precipSum !== null && precipSum > 0 ? `${precipSum}mm` : ""}
                  </span>
                  <div style={{ flex: 1, height: 3, background: "var(--bg-nested)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "var(--accent-cyan)", borderRadius: 2, width: `${Math.min(precipProb, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 3, borderTop: "1px solid var(--bg-nested)", fontSize: "0.48rem", color: "var(--text-muted-dim)", flex: "none" }}>
          <span>
            {obsTime ? formatTime(obsTime) : ""}
            {isStale && <> &middot; <StaleBadge /></>}
          </span>
          <button onClick={handleRefresh} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, borderRadius: 4, display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "0.48rem" }} type="button">
            <RefreshCw size={12} style={{ transition: "transform 0.6s", transform: spin ? "rotate(360deg)" : "rotate(0deg)" }} />
            Refresh
          </button>
        </div>
      </div>
      {showSettings && <SettingsOverlay />}
    </Root>
  );

  /* ─── internal sub-components ─── */

  function SettingsOverlay() {
    return (
      <div
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}
        onKeyDown={(e) => { if (e.key === "Escape") closeSettings(); }}
      >
        <div
          style={{
            background: "var(--bg-card)", ...border, borderRadius: 14,
            boxShadow: "6px 6px 0 var(--shadow)", width: 320, padding: 16,
            display: "flex", flexDirection: "column", gap: 10,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ ...dotGothic, fontSize: "0.7rem", ...uppercase, letterSpacing: "0.14em", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Weather Settings</span>
            <button onClick={closeSettings} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, borderRadius: 4, display: "flex" }} type="button">
              <X size={14} />
            </button>
          </div>
          <SettingsField label="Display Name">
            <input type="text" value={draft.locationName} onChange={(e) => setDraft({ ...draft, locationName: e.target.value })} style={inputStyle} />
          </SettingsField>
          <SettingsField label="Latitude">
            <input type="number" step="0.0001" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: parseFloat(e.target.value) || 0 })} style={inputStyle} />
          </SettingsField>
          <SettingsField label="Longitude">
            <input type="number" step="0.0001" value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: parseFloat(e.target.value) || 0 })} style={inputStyle} />
          </SettingsField>
          <div style={{ display: "flex", gap: 12 }}>
            <SettingsField label="Temperature" style={{ flex: 1 }}>
              <select value={draft.tempUnit} onChange={(e) => setDraft({ ...draft, tempUnit: e.target.value as "f" | "c" })} style={inputStyle}>
                <option value="f">°F</option>
                <option value="c">°C</option>
              </select>
            </SettingsField>
            <SettingsField label="Wind Speed" style={{ flex: 1 }}>
              <select value={draft.windUnit} onChange={(e) => setDraft({ ...draft, windUnit: e.target.value as "mph" | "kmh" })} style={inputStyle}>
                <option value="mph">mph</option>
                <option value="kmh">km/h</option>
              </select>
            </SettingsField>
          </div>
          <SettingsField label="Polling Interval (min)">
            <input type="number" value={draft.pollingInterval} min={5} max={120} onChange={(e) => setDraft({ ...draft, pollingInterval: parseInt(e.target.value) || 30 })} style={inputStyle} />
          </SettingsField>
          <button onClick={saveDraft} style={{ background: "var(--accent-orange)", border: "none", color: "var(--badge-text)", cursor: "pointer", fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "0.6rem", padding: "6px 12px", borderRadius: 6, fontWeight: 500, marginTop: 4 }} type="button">
            Save Settings
          </button>
        </div>
      </div>
    );
  }

  function closeSettings() {
    setShowSettings(false);
  }
}

/* ─── shared leaf components ─── */

const rootStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  position: "relative",
};

function Root({ children }: { children: React.ReactNode }) {
  return <div style={rootStyle}>{children}</div>;
}

function HeaderRow({
  location,
  onSettings,
  onRefresh,
  spin,
  large,
}: {
  location: string;
  onSettings: () => void;
  onRefresh: () => void;
  spin: boolean;
  large?: boolean;
}) {
  const locStyle: CSSProperties = {
    ...dotGothic, ...uppercase,
    fontSize: large ? "0.58rem" : "0.55rem",
    letterSpacing: "0.12em",
    color: "var(--text-muted-dim)",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: "none" }}>
      <span style={locStyle}>
        <MapPin size={14} style={{ flex: "none" }} />
        {location}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        <IconButton onClick={onSettings} label="Settings"><Settings size={14} /></IconButton>
        <IconButton onClick={onRefresh} label="Refresh">
          <RefreshCw size={14} style={{ transition: "transform 0.6s", transform: spin ? "rotate(360deg)" : "rotate(0deg)" }} />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
      type="button"
    >
      {children}
    </button>
  );
}

function PillRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>;
}

function Pill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--bg-nested)", ...border, borderRadius: 20, padding: "2px 8px 2px 6px", fontSize: "0.55rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
      {icon}
      {label && <>{label}&nbsp;</>}
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
    </span>
  );
}

function LPillRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{children}</div>;
}

function LPill({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 3, background: "var(--bg-nested)", ...border, borderRadius: 16, padding: "2px 7px 2px 5px", fontSize: "0.5rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
      {icon}
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "4px 8px", textAlign: "center", cursor: "pointer", border: "none",
        background: active ? "var(--bg-card)" : "none",
        color: active ? "var(--accent-warm)" : "var(--text-muted-dim)",
        ...dotGothic, ...uppercase, fontSize: "0.52rem", letterSpacing: "0.1em", borderRadius: 6,
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function StaleIndicator() {
  return (
    <span style={{ ...dotGothic, fontSize: "0.45rem", color: "var(--text-muted-dim)", border: "1px solid var(--border)", borderRadius: 3, padding: "0 4px", letterSpacing: "0.04em", marginLeft: 2 }}>
      stale
    </span>
  );
}

function StaleBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "0.48rem", color: "var(--text-muted-dim)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px", letterSpacing: "0.04em" }}>
      stale
    </span>
  );
}

function SettingsField({ label, children, style: s }: { label: string; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, ...s }}>
      <label style={{ fontSize: "0.5rem", color: "var(--text-muted-dim)", ...uppercase, ...dotGothic, letterSpacing: "0.1em" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontFamily: "var(--font-jetbrains-mono), monospace",
  fontSize: "0.65rem",
  padding: "5px 8px",
  outline: "none",
  width: "100%",
};

/* ─── loading skeleton ─── */

const pulseKeyframes = `
@keyframes w-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
.w-shimmer { background: var(--bg-nested); border-radius: 4px; animation: w-pulse 1.5s ease-in-out infinite; }
.w-shimmer-circ { width: 36px; height: 36px; border-radius: 50%; background: var(--bg-nested); animation: w-pulse 1.5s ease-in-out infinite; }
`;

function LoadingSkeleton({ size: s }: { size: string }) {
  return (
    <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <style>{pulseKeyframes}</style>
      {s === "S" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div className="w-shimmer" style={{ width: 50, height: 12 }} />
          <div className="w-shimmer-circ" style={{ width: 40, height: 40 }} />
          <div className="w-shimmer" style={{ width: 80, height: 40 }} />
          <div className="w-shimmer" style={{ width: 60, height: 12 }} />
        </div>
      ) : (
        <>
          <div className="w-shimmer" style={{ width: 100, height: 12 }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 6, background: "var(--bg-nested)", borderRadius: 10 }}>
            <div className="w-shimmer-circ" />
            <div className="w-shimmer" style={{ width: 70, height: 32 }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div className="w-shimmer" style={{ width: 80, height: 20, borderRadius: 20 }} />
            <div className="w-shimmer" style={{ width: 80, height: 20, borderRadius: 20 }} />
            <div className="w-shimmer" style={{ width: 80, height: 20, borderRadius: 20 }} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <div className="w-shimmer" style={{ flex: 1, height: 22, borderRadius: 6 }} />
            <div className="w-shimmer" style={{ flex: 1, height: 22, borderRadius: 6 }} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-shimmer" style={{ width: 38, height: 52, borderRadius: 5 }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
