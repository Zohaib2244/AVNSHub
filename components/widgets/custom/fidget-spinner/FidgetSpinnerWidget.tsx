"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};

const buttonBaseStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 16,
  boxShadow: "3px 3px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  display: "grid",
  justifyItems: "center",
  padding: 0,
  touchAction: "manipulation",
};

const panelStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 14,
  boxShadow: "2px 2px 0 var(--shadow)",
  minWidth: 0,
  padding: "8px 10px",
};

const arms = [0, 120, 240];

type WidgetSize = "S" | "M" | "L";

type SpinnerButtonProps = {
  angle: number;
  onSpin: () => void;
  size: WidgetSize;
  speed: number;
};

type StatTileProps = {
  accent?: "accent" | "teal";
  label: string;
  sub?: string;
  value: string;
};

function getButtonSize(size: WidgetSize) {
  if (size === "S") return 76;
  if (size === "M") return 104;
  return 132;
}

function getSpeedLabel(speed: number) {
  if (speed > 1700) return "overdrive";
  if (speed > 900) return "fast";
  if (speed > 120) return "spinning";
  return "idle";
}

function SpinnerButton({ angle, onSpin, size, speed }: SpinnerButtonProps) {
  const buttonSize = getButtonSize(size);
  const rotorSize = Math.round(buttonSize * 0.74);
  const lobeSize = Math.round(rotorSize * 0.34);
  const radius = Math.round(rotorSize * 0.33);
  const armWidth = Math.max(7, Math.round(rotorSize * 0.1));
  const centerSize = Math.round(rotorSize * 0.34);
  const fast = speed > 900;

  return (
    <button
      aria-label="spin fidget spinner"
      onClick={onSpin}
      style={{ ...buttonBaseStyle, height: buttonSize, width: buttonSize }}
      type="button"
    >
      <div
        style={{
          height: rotorSize,
          position: "relative",
          transform: `rotate(${angle}deg)`,
          transition: speed > 20 ? "none" : "transform 120ms ease-out",
          width: rotorSize,
        }}
      >
        {arms.map((arm, index) => (
          <div
            key={`arm-${arm}`}
            style={{
              background: index === 1 ? "var(--accent-cyan)" : "var(--accent-orange)",
              borderRadius: 12,
              height: radius,
              left: "50%",
              marginLeft: -armWidth / 2,
              marginTop: -radius,
              opacity: fast ? 0.72 : 0.88,
              position: "absolute",
              top: "50%",
              transform: `rotate(${arm}deg)`,
              transformOrigin: "50% 100%",
              width: armWidth,
            }}
          />
        ))}

        {arms.map((arm, index) => (
          <div
            key={`lobe-${arm}`}
            style={{
              background: index === 1 ? "var(--accent-cyan)" : "var(--accent-orange)",
              border: "1.5px solid var(--border)",
              borderRadius: "50%",
              boxShadow: "2px 2px 0 var(--shadow)",
              height: lobeSize,
              left: "50%",
              marginLeft: -lobeSize / 2,
              marginTop: -lobeSize / 2,
              opacity: fast ? 0.86 : 1,
              position: "absolute",
              top: "50%",
              transform: `rotate(${arm}deg) translateY(-${radius}px)`,
              width: lobeSize,
            }}
          >
            <span
              style={{
                background: "var(--bg-card)",
                border: "1.5px solid var(--border)",
                borderRadius: "50%",
                bottom: Math.max(5, Math.round(lobeSize * 0.22)),
                left: Math.max(5, Math.round(lobeSize * 0.22)),
                position: "absolute",
                right: Math.max(5, Math.round(lobeSize * 0.22)),
                top: Math.max(5, Math.round(lobeSize * 0.22)),
              }}
            />
          </div>
        ))}

        <div
          style={{
            background: "var(--bg-card)",
            border: "1.5px solid var(--border)",
            borderRadius: "50%",
            boxShadow: "2px 2px 0 var(--shadow)",
            height: centerSize,
            left: "50%",
            marginLeft: -centerSize / 2,
            marginTop: -centerSize / 2,
            position: "absolute",
            top: "50%",
            width: centerSize,
          }}
        />
      </div>
    </button>
  );
}

function StatTile({ accent, label, sub, value }: StatTileProps) {
  const valueClassName = accent ? `block-value ${accent}` : "block-value";

  return (
    <div style={panelStyle}>
      <div className="block-label" style={labelStyle}>
        {label}
      </div>
      <div className={valueClassName} style={{ ...monoStyle, fontSize: "1.2rem", lineHeight: 1.05 }}>
        {value}
      </div>
      {sub && (
        <div className="block-sub" style={{ ...monoStyle, fontSize: "0.66rem" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function MomentumBar({ value }: { value: number }) {
  const width = `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;

  return (
    <div
      aria-hidden="true"
      style={{
        background: "var(--bg-card)",
        border: "1.5px solid var(--border)",
        borderRadius: 12,
        boxShadow: "2px 2px 0 var(--shadow)",
        height: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "var(--accent-cyan)",
          height: "100%",
          transition: "width 80ms linear",
          width,
        }}
      />
    </div>
  );
}

export function FidgetSpinnerWidget() {
  const { size } = useWidget();
  const [angle, setAngle] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [peakSpeed, setPeakSpeed] = useState(0);
  const angleRef = useRef(0);
  const speedRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let frame = 0;

    const tick = (time: number) => {
      const lastTime = lastTimeRef.current ?? time;
      const delta = Math.min((time - lastTime) / 1000, 0.04);
      const wasMoving = speedRef.current > 0;
      const drag = speedRef.current > 900 ? 170 : 115;
      const nextSpeed = Math.max(0, speedRef.current - drag * delta);

      lastTimeRef.current = time;
      speedRef.current = nextSpeed < 1 ? 0 : nextSpeed;

      if (speedRef.current > 0) {
        angleRef.current = (angleRef.current + speedRef.current * delta) % 360;
        setAngle(angleRef.current);
        setSpeed(Math.round(speedRef.current));
      } else if (wasMoving) {
        setSpeed(0);
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const maxSpeed = size === "L" ? 2600 : size === "M" ? 2200 : 1800;
  const boost = size === "L" ? 780 : size === "M" ? 680 : 560;
  const rpm = Math.round(speed / 6);
  const peakRpm = Math.round(peakSpeed / 6);
  const status = getSpeedLabel(speed);
  const momentum = speed / maxSpeed;

  const handleSpin = () => {
    const nextSpeed = Math.min(maxSpeed, speedRef.current + boost);

    speedRef.current = nextSpeed;
    setClicks((count) => count + 1);
    setPeakSpeed((peak) => Math.max(peak, Math.round(nextSpeed)));
    setSpeed(Math.round(nextSpeed));
  };

  if (size === "S") {
    return (
      <div
        style={{
          alignItems: "center",
          color: "var(--text-primary)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          height: "100%",
          justifyContent: "center",
          minHeight: 0,
          width: "100%",
        }}
      >
        <SpinnerButton angle={angle} onSpin={handleSpin} size="S" speed={speed} />
        <div className="block-label" style={labelStyle}>
          {status}
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div
        style={{
          alignItems: "center",
          color: "var(--text-primary)",
          display: "flex",
          gap: 12,
          height: "100%",
          minHeight: 0,
          minWidth: 0,
          width: "100%",
        }}
      >
        <SpinnerButton angle={angle} onSpin={handleSpin} size="M" speed={speed} />
        <div style={{ display: "grid", flex: 1, gap: 8, minWidth: 0 }}>
          <StatTile accent="accent" label="speed" sub="rpm" value={String(rpm)} />
          <StatTile accent="teal" label="state" sub={`${clicks} clicks`} value={status} />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        color: "var(--text-primary)",
        display: "grid",
        gap: 12,
        gridTemplateColumns: "auto minmax(0, 1fr)",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", justifyContent: "center" }}>
        <SpinnerButton angle={angle} onSpin={handleSpin} size="L" speed={speed} />
      </div>

      <div style={{ display: "grid", gap: 10, minHeight: 0, minWidth: 0 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <StatTile accent="accent" label="speed" sub="rpm" value={String(rpm)} />
          <StatTile accent="teal" label="peak" sub="rpm" value={String(peakRpm)} />
          <StatTile label="clicks" sub={status} value={String(clicks)} />
        </div>

        <div style={panelStyle}>
          <div className="more-head" style={labelStyle}>
            momentum
          </div>
          <MomentumBar value={momentum} />
          <div
            className="more-row"
            style={{
              alignItems: "center",
              display: "flex",
              gap: 8,
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <span className="more-meta" style={labelStyle}>
              drag
            </span>
            <span style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.72rem" }}>
              {speed > 900 ? "high" : "steady"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
