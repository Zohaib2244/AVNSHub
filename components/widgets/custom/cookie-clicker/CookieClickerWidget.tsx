"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };
const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: 0,
  textTransform: "uppercase",
};

type UpgradeDef = {
  id: string;
  name: string;
  baseCost: number;
  cps: number;
};

const UPGRADES: UpgradeDef[] = [
  { id: "cursor", name: "cursor", baseCost: 15, cps: 0.1 },
  { id: "grandma", name: "grandma", baseCost: 100, cps: 1 },
  { id: "farm", name: "farm", baseCost: 1100, cps: 8 },
  { id: "factory", name: "factory", baseCost: 12000, cps: 47 },
];

function upgradeCost(def: UpgradeDef, owned: number): number {
  return Math.round(def.baseCost * Math.pow(1.15, owned));
}

function formatNumber(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  const units = ["K", "M", "B", "T", "Q"];
  let value = n;
  let unitIndex = -1;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)}${units[unitIndex]}`;
}

type FloatText = { id: number; x: number; amount: number };

const buttonBaseStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
};

export function CookieClickerWidget() {
  const { size, settings } = useWidget();
  const clickPower = typeof settings.clickPower === "number" ? settings.clickPower : 1;
  const showUpgrades = settings.showUpgrades !== false;

  const [cookies, setCookies] = useState(0);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [floats, setFloats] = useState<FloatText[]>([]);
  const [pressed, setPressed] = useState(false);
  const floatIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const cps = UPGRADES.reduce((sum, def) => sum + (owned[def.id] ?? 0) * def.cps, 0);

  useEffect(() => {
    if (cps <= 0) return;
    let cancelled = false;
    let timer: number | undefined;
    const tickMs = 250;

    function tick() {
      if (cancelled) return;
      setCookies((c) => c + (cps * tickMs) / 1000);
      timer = window.setTimeout(tick, tickMs);
    }

    timer = window.setTimeout(tick, tickMs);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [cps]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, []);

  function queueTimeout(callback: () => void, delayMs: number) {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((entry) => entry !== timer);
      callback();
    }, delayMs);
    timersRef.current = [...timersRef.current, timer];
  }

  function handleClick() {
    setCookies((c) => c + clickPower);
    setPressed(true);
    queueTimeout(() => setPressed(false), 90);
    const id = floatIdRef.current;
    floatIdRef.current += 1;
    setFloats((f) => [...f, { id, x: Math.random() * 30 - 15, amount: clickPower }]);
    queueTimeout(() => {
      setFloats((f) => f.filter((entry) => entry.id !== id));
    }, 700);
  }

  function buyUpgrade(def: UpgradeDef) {
    const count = owned[def.id] ?? 0;
    const cost = upgradeCost(def, count);
    if (cookies < cost) return;
    setCookies((c) => c - cost);
    setOwned((o) => ({ ...o, [def.id]: count + 1 }));
  }

  const cookieEmojiSize = size === "S" ? "2.2rem" : size === "M" ? "2.6rem" : "3.2rem";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={labelStyle}>cookies</div>
        {cps > 0 && (
          <div style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.65rem" }}>
            {formatNumber(cps)}/s
          </div>
        )}
      </div>

      <div
        className="block-value accent"
        style={{ ...monoStyle, fontSize: size === "S" ? "1.4rem" : "1.8rem", lineHeight: 1 }}
      >
        {formatNumber(cookies)}
      </div>

      <div style={{ display: "flex", flex: 1, gap: 12, minHeight: 0 }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <button
            aria-label="click the cookie"
            onClick={handleClick}
            type="button"
            style={{
              ...buttonBaseStyle,
              alignItems: "center",
              borderRadius: 16,
              display: "flex",
              fontSize: cookieEmojiSize,
              height: size === "S" ? 56 : size === "M" ? 68 : 84,
              justifyContent: "center",
              lineHeight: 1,
              transform: pressed ? "scale(0.92)" : "scale(1)",
              transition: "transform 90ms ease-out",
              userSelect: "none",
              width: size === "S" ? 56 : size === "M" ? 68 : 84,
            }}
          >
            {"\u{1F36A}"}
          </button>
          {floats.map((entry) => (
            <span
              key={entry.id}
              style={{
                ...monoStyle,
                color: "var(--accent-orange)",
                fontSize: "0.75rem",
                fontWeight: 500,
                left: `calc(50% + ${entry.x}px)`,
                pointerEvents: "none",
                position: "absolute",
                top: "10%",
                animation: "cookie-clicker-float 700ms ease-out forwards",
              }}
            >
              +{formatNumber(entry.amount)}
            </span>
          ))}
        </div>

        {showUpgrades && size !== "S" && (
          <div
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              gap: 6,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            {(size === "M" ? UPGRADES.slice(0, 2) : UPGRADES).map((def) => {
              const count = owned[def.id] ?? 0;
              const cost = upgradeCost(def, count);
              const affordable = cookies >= cost;
              return (
                <button
                  key={def.id}
                  disabled={!affordable}
                  onClick={() => buyUpgrade(def)}
                  type="button"
                  style={{
                    ...buttonBaseStyle,
                    display: "flex",
                    alignItems: "center",
                    cursor: affordable ? "pointer" : "not-allowed",
                    justifyContent: "space-between",
                    gap: 8,
                    opacity: affordable ? 1 : 0.5,
                    padding: "5px 8px",
                  }}
                >
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <span style={{ ...monoStyle, fontSize: "0.7rem" }}>
                      {def.name}
                      {count > 0 ? ` x${count}` : ""}
                    </span>
                    <span style={{ ...monoStyle, color: "var(--text-muted)", fontSize: "0.6rem" }}>
                      +{def.cps}/s
                    </span>
                  </span>
                  <span style={{ ...monoStyle, color: "var(--accent-cyan)", fontSize: "0.68rem" }}>
                    {formatNumber(cost)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes cookie-clicker-float {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-24px); }
        }
      `}</style>
    </div>
  );
}
