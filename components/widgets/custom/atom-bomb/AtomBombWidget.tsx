"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

type Phase = "ready" | "armed" | "detonated";

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const buttonStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  padding: "5px 9px",
  textTransform: "uppercase",
};

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  boxShadow: "none",
  cursor: "not-allowed",
  opacity: 0.45,
  transform: "translate(2px, 2px)",
};

function buildSkyline(seed: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = (seed * 17 + index * 29 + 11) % 61;
    return {
      height: 28 + value,
      width: 8 + ((seed + index * 7) % 10),
    };
  });
}

export function AtomBombWidget() {
  const { size, settings } = useWidget();
  const configuredCity =
    typeof settings.cityName === "string" && settings.cityName.trim()
      ? settings.cityName.trim()
      : "Nova City";
  const yieldName =
    typeof settings.yield === "string" ? settings.yield : "medium";
  const showTelemetry = settings.showTelemetry !== false;
  const [phase, setPhase] = useState<Phase>("ready");
  const [cityNumber, setCityNumber] = useState(1);
  const skyline = useMemo(
    () => buildSkyline(cityNumber, size === "S" ? 8 : size === "M" ? 14 : 20),
    [cityNumber, size],
  );

  const createCity = () => {
    setCityNumber((value) => value + 1);
    setPhase("ready");
  };

  const status =
    phase === "detonated" ? "impact complete" : phase === "armed" ? "warhead armed" : "city online";
  const cityLabel = cityNumber === 1 ? configuredCity : `${configuredCity} ${cityNumber}`;

  if (size === "S") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 7,
          height: "100%",
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        <div style={labelStyle}>{phase === "detonated" ? "ground zero" : cityLabel}</div>
        <div className="block-value" style={{ ...monoStyle, fontSize: "1rem" }}>
          {phase === "detonated" ? "BOOM" : phase === "armed" ? "ARMED" : "READY"}
        </div>
        <button
          onClick={() => {
            if (phase === "ready") setPhase("armed");
            else if (phase === "armed") setPhase("detonated");
            else createCity();
          }}
          style={{
            ...buttonStyle,
            background:
              phase === "armed"
                ? "color-mix(in srgb, var(--accent-orange) 24%, var(--bg-nested))"
                : "var(--bg-nested)",
            width: "100%",
          }}
          type="button"
        >
          {phase === "ready" ? "arm" : phase === "armed" ? "detonate" : "new city"}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: size === "L" ? 10 : 8,
        height: "100%",
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          justifyContent: "space-between",
        }}
      >
        <div style={labelStyle}>{cityLabel}</div>
        <div
          style={{
            ...labelStyle,
            color: phase === "ready" ? "var(--accent-cyan)" : "var(--accent-orange)",
          }}
        >
          {status}
        </div>
      </div>

      <div
        aria-label={`${cityLabel}: ${status}`}
        style={{
          alignItems: "flex-end",
          background:
            phase === "detonated"
              ? "linear-gradient(180deg, color-mix(in srgb, var(--accent-orange) 28%, var(--bg-card)), var(--bg-nested))"
              : "linear-gradient(180deg, color-mix(in srgb, var(--accent-cyan) 12%, var(--bg-card)), var(--bg-nested))",
          border: "1.5px solid var(--border)",
          borderRadius: 14,
          boxShadow: "3px 3px 0 var(--shadow)",
          display: "flex",
          flex: "1 1 auto",
          gap: 2,
          justifyContent: "center",
          minHeight: size === "L" ? 96 : 58,
          overflow: "hidden",
          padding: "8px 8px 0",
          position: "relative",
        }}
      >
        {phase === "detonated" && (
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "column",
              left: "50%",
              position: "absolute",
              top: "46%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
            }}
          >
            <div
              style={{
                background: "var(--accent-orange)",
                border: "1.5px solid var(--border)",
                borderRadius: "50%",
                boxShadow: "0 0 0 6px color-mix(in srgb, var(--accent-orange) 24%, transparent)",
                height: size === "L" ? 42 : 30,
                width: size === "L" ? 64 : 46,
              }}
            />
            <div
              style={{
                background: "var(--accent-orange)",
                borderLeft: "1.5px solid var(--border)",
                borderRight: "1.5px solid var(--border)",
                height: size === "L" ? 38 : 24,
                width: size === "L" ? 16 : 12,
              }}
            />
          </div>
        )}

        {skyline.map((building, index) => (
          <div
            key={`${cityNumber}-${index}`}
            style={{
              background:
                phase === "detonated"
                  ? "color-mix(in srgb, var(--text-muted) 35%, var(--bg-nested))"
                  : index % 3 === 0
                    ? "var(--accent-cyan)"
                    : "var(--text-primary)",
              border: "1.5px solid var(--border)",
              borderBottom: 0,
              borderRadius: "3px 3px 0 0",
              height: phase === "detonated" ? Math.max(6, building.height / 5) : building.height,
              opacity: phase === "detonated" ? 0.6 : 0.9,
              transition: "height 180ms ease",
              width: building.width,
            }}
          />
        ))}
      </div>

      {size === "L" && showTelemetry && (
        <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="more-row" style={{ display: "block", minWidth: 0 }}>
            <div style={labelStyle}>yield</div>
            <div style={{ ...monoStyle, overflow: "hidden", textOverflow: "ellipsis" }}>
              {yieldName}
            </div>
          </div>
          <div className="more-row" style={{ display: "block", minWidth: 0 }}>
            <div style={labelStyle}>population</div>
            <div style={monoStyle}>{phase === "detonated" ? "0" : "8.4m sim"}</div>
          </div>
          <div className="more-row" style={{ display: "block", minWidth: 0 }}>
            <div style={labelStyle}>radiation</div>
            <div style={monoStyle}>{phase === "detonated" ? "critical" : "none"}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        <button onClick={createCity} style={{ ...buttonStyle, flex: "1 1 80px" }} type="button">
          create city
        </button>
        <button
          disabled={phase !== "ready"}
          onClick={() => setPhase("armed")}
          style={{ ...(phase !== "ready" ? disabledButtonStyle : buttonStyle), flex: "1 1 70px" }}
          type="button"
        >
          arm
        </button>
        <button
          disabled={phase !== "armed"}
          onClick={() => setPhase("detonated")}
          style={{
            ...(phase !== "armed" ? disabledButtonStyle : buttonStyle),
            background:
              phase === "armed"
                ? "color-mix(in srgb, var(--accent-orange) 24%, var(--bg-nested))"
                : "var(--bg-nested)",
            flex: "1 1 82px",
          }}
          type="button"
        >
          detonate
        </button>
      </div>
      <div className="block-sub" style={{ ...monoStyle, fontSize: "0.58rem", textAlign: "center" }}>
        fictional simulation - no real-world targeting
      </div>
    </div>
  );
}
