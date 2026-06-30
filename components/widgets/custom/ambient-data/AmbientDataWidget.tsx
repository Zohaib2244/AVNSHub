"use client";

import { type CSSProperties } from "react";
import { useWidget } from "@/components/framework/WidgetContext";

type CellTone = "idle" | "hot" | "dim" | "core";
type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

interface CellData {
  tone: CellTone;
  delay: string;
}

interface LoomData {
  label: string;
  value: number;
  hot?: boolean;
  duration: string;
  delay: string;
}

const MOSAIC_CELLS: CellData[] = [
  { tone: "dim", delay: "-0.2s" },
  { tone: "idle", delay: "-1.4s" },
  { tone: "hot", delay: "-2.6s" },
  { tone: "idle", delay: "-3.1s" },
  { tone: "core", delay: "-0.9s" },
  { tone: "idle", delay: "-2.2s" },
  { tone: "dim", delay: "-4.4s" },
  { tone: "hot", delay: "-1.1s" },
  { tone: "idle", delay: "-3.8s" },
  { tone: "hot", delay: "-0.6s" },
  { tone: "idle", delay: "-1.8s" },
  { tone: "dim", delay: "-4.7s" },
  { tone: "idle", delay: "-2.5s" },
  { tone: "core", delay: "-3.3s" },
  { tone: "hot", delay: "-0.4s" },
  { tone: "idle", delay: "-2.9s" },
  { tone: "hot", delay: "-1.9s" },
  { tone: "idle", delay: "-4.2s" },
  { tone: "core", delay: "-0.8s" },
  { tone: "hot", delay: "-3.6s" },
  { tone: "idle", delay: "-2.1s" },
  { tone: "dim", delay: "-1.3s" },
  { tone: "idle", delay: "-4.9s" },
  { tone: "hot", delay: "-0.7s" },
  { tone: "idle", delay: "-2.4s" },
  { tone: "dim", delay: "-3.7s" },
  { tone: "hot", delay: "-1.2s" },
  { tone: "core", delay: "-4.6s" },
  { tone: "hot", delay: "-0.3s" },
  { tone: "idle", delay: "-2.8s" },
  { tone: "idle", delay: "-3.5s" },
  { tone: "dim", delay: "-1.6s" },
  { tone: "dim", delay: "-4.1s" },
  { tone: "idle", delay: "-0.5s" },
  { tone: "hot", delay: "-2.7s" },
  { tone: "idle", delay: "-3.9s" },
  { tone: "core", delay: "-1.5s" },
  { tone: "hot", delay: "-4.8s" },
  { tone: "idle", delay: "-2.3s" },
  { tone: "idle", delay: "-0.1s" },
  { tone: "hot", delay: "-3.2s" },
  { tone: "core", delay: "-1.7s" },
  { tone: "idle", delay: "-4.5s" },
  { tone: "dim", delay: "-0.8s" },
  { tone: "idle", delay: "-2.0s" },
  { tone: "hot", delay: "-3.4s" },
  { tone: "dim", delay: "-1.0s" },
  { tone: "idle", delay: "-4.3s" },
  { tone: "idle", delay: "-2.6s" },
  { tone: "hot", delay: "-0.9s" },
  { tone: "dim", delay: "-3.0s" },
  { tone: "idle", delay: "-4.0s" },
  { tone: "hot", delay: "-1.4s" },
  { tone: "core", delay: "-2.9s" },
  { tone: "idle", delay: "-0.6s" },
  { tone: "hot", delay: "-3.8s" },
  { tone: "core", delay: "-1.1s" },
  { tone: "idle", delay: "-2.2s" },
  { tone: "hot", delay: "-4.4s" },
  { tone: "idle", delay: "-0.7s" },
  { tone: "dim", delay: "-3.6s" },
  { tone: "idle", delay: "-1.8s" },
  { tone: "hot", delay: "-2.5s" },
  { tone: "dim", delay: "-4.9s" },
];

const READOUTS = [
  { label: "Avg CPU", value: "64%" },
  { label: "Cells", value: "64" },
  { label: "Tempo", value: "2.8s" },
];

const LOOM_ROWS: LoomData[] = [
  { label: "API", value: 72, hot: true, duration: "3.2s", delay: "-0.8s" },
  { label: "DB", value: 48, duration: "5.4s", delay: "-2s" },
  { label: "Edge", value: 61, hot: true, duration: "4s", delay: "-1.4s" },
];

const AMBIENT_DATA_STYLES = `
  .ambient-data-root {
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    font-family: var(--font-jetbrains-mono), monospace;
    height: 100%;
    min-height: 0;
  }

  .ambient-data-root * {
    box-sizing: border-box;
  }

  .ambient-data-root--s {
    gap: 8px;
    justify-content: center;
    overflow: hidden;
  }

  .ambient-data-root--m {
    --ambient-hot-rise: -4px;
    --ambient-scan-distance: 112px;
    gap: 10px;
    overflow: hidden;
  }

  .ambient-data-root--l {
    --ambient-hot-rise: -5px;
    --ambient-scan-distance: 292px;
    gap: 12px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .ambient-data-topline {
    align-items: center;
    display: flex;
    flex: none;
    gap: 10px;
    justify-content: space-between;
    min-width: 0;
  }

  .ambient-data-title {
    color: var(--text-muted);
    flex: 1 1 auto;
    font-family: var(--font-dot-gothic), monospace;
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ambient-data-badge {
    background: var(--bg-nested);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    box-shadow: 3px 3px 0 var(--shadow);
    color: var(--text-muted);
    flex: none;
    font-family: var(--font-dot-gothic), monospace;
    font-size: 0.56rem;
    letter-spacing: 0.12em;
    padding: 5px 8px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ambient-data-mosaic-shell {
    background: var(--bg-nested);
    border: 1.5px solid var(--border);
    border-radius: 16px;
    box-shadow: inset 3px 3px 0 var(--shadow);
    flex: none;
    overflow: hidden;
    padding: 12px;
    position: relative;
  }

  .ambient-data-root--m .ambient-data-mosaic-shell {
    border-radius: 14px;
    box-shadow: inset 3px 3px 0 var(--shadow);
    padding: 10px;
  }

  .ambient-data-root--s .ambient-data-mosaic-shell {
    border-radius: 12px;
    box-shadow: inset 2px 2px 0 var(--shadow);
    padding: 7px;
  }

  .ambient-data-mosaic-shell--scan::before {
    animation: ambientDataScanBand 7s steps(8) infinite;
    border: 1.5px solid var(--accent-cyan);
    border-radius: 14px;
    content: "";
    height: 46px;
    left: 12px;
    opacity: 0.35;
    pointer-events: none;
    position: absolute;
    right: 12px;
    top: 12px;
  }

  .ambient-data-root--m .ambient-data-mosaic-shell--scan::before {
    border-radius: 12px;
    height: 30px;
    left: 10px;
    right: 10px;
    top: 10px;
  }

  @keyframes ambientDataScanBand {
    0% {
      opacity: 0.22;
      transform: translateY(0);
    }

    45% {
      opacity: 0.5;
    }

    100% {
      opacity: 0.22;
      transform: translateY(var(--ambient-scan-distance, 292px));
    }
  }

  .ambient-data-mosaic {
    display: grid;
    gap: 7px;
    grid-template-columns: repeat(var(--ambient-columns), minmax(0, 1fr));
    position: relative;
    z-index: 1;
  }

  .ambient-data-root--m .ambient-data-mosaic {
    gap: 6px;
  }

  .ambient-data-root--s .ambient-data-mosaic {
    gap: 4px;
  }

  .ambient-data-cell {
    animation: ambientDataCellIdle 5.6s steps(4) infinite;
    animation-delay: var(--ambient-delay);
    aspect-ratio: 1;
    background: var(--accent-cyan);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    box-shadow: 3px 3px 0 var(--shadow);
    opacity: 0.26;
  }

  .ambient-data-root--m .ambient-data-cell {
    border-radius: 10px;
    box-shadow: 2px 2px 0 var(--shadow);
  }

  .ambient-data-root--s .ambient-data-cell {
    border-radius: 7px;
    box-shadow: 2px 2px 0 var(--shadow);
  }

  .ambient-data-cell--hot {
    animation-duration: 2.8s;
    animation-name: ambientDataCellHot;
    background: var(--accent-orange);
  }

  .ambient-data-cell--dim {
    animation-duration: 7.2s;
    background: var(--text-muted-dim, var(--text-muted));
  }

  .ambient-data-cell--core {
    animation-duration: 4.2s;
    animation-name: ambientDataCellCore;
    background: var(--text-primary);
  }

  @keyframes ambientDataCellIdle {
    0%,
    100% {
      opacity: 0.18;
      transform: scale(0.88);
    }

    50% {
      opacity: 0.72;
      transform: scale(1);
    }
  }

  @keyframes ambientDataCellHot {
    0%,
    100% {
      opacity: 0.36;
      transform: translateY(0) scale(0.9);
    }

    50% {
      opacity: 1;
      transform: translateY(var(--ambient-hot-rise, -5px)) scale(1);
    }
  }

  @keyframes ambientDataCellCore {
    0%,
    100% {
      opacity: 0.42;
      transform: rotate(0deg) scale(0.92);
    }

    50% {
      opacity: 0.9;
      transform: rotate(8deg) scale(1);
    }
  }

  .ambient-data-side-read {
    display: grid;
    flex: none;
    gap: 10px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ambient-data-root--m .ambient-data-side-read {
    gap: 7px;
  }

  .ambient-data-read-card {
    background: var(--bg-nested);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    box-shadow: 3px 3px 0 var(--shadow);
    min-width: 0;
    padding: 9px;
  }

  .ambient-data-root--m .ambient-data-read-card {
    box-shadow: 2px 2px 0 var(--shadow);
    padding: 7px;
  }

  .ambient-data-read-key {
    color: var(--text-muted);
    font-family: var(--font-dot-gothic), monospace;
    font-size: 0.54rem;
    letter-spacing: 0.12em;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ambient-data-read-value {
    color: var(--text-primary);
    font-family: var(--font-dot-gothic), monospace;
    font-size: 1.2rem;
    line-height: 1;
    margin-top: 6px;
    padding: 0;
    white-space: nowrap;
  }

  .ambient-data-root--m .ambient-data-read-value {
    font-size: 1rem;
    margin-top: 5px;
  }

  .ambient-data-loom {
    background:
      repeating-linear-gradient(90deg, var(--border) 0 1.5px, var(--bg-nested) 1.5px 31px),
      var(--bg-nested);
    border: 1.5px solid var(--border);
    border-radius: 16px;
    box-shadow: inset 3px 3px 0 var(--shadow);
    flex: none;
    padding: 12px;
  }

  .ambient-data-loom-row {
    align-items: center;
    display: grid;
    gap: 10px;
    grid-template-columns: 54px 1fr 44px;
    margin-bottom: 9px;
  }

  .ambient-data-loom-row:last-child {
    margin-bottom: 0;
  }

  .ambient-data-loom-label {
    color: var(--text-muted);
    font-family: var(--font-dot-gothic), monospace;
    font-size: 0.56rem;
    letter-spacing: 0.12em;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ambient-data-loom-track {
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    border-radius: 12px;
    height: 18px;
    overflow: hidden;
  }

  .ambient-data-loom-fill {
    animation: ambientDataFillBeat var(--ambient-duration) ease-in-out infinite;
    animation-delay: var(--ambient-delay);
    background: var(--accent-cyan);
    border-radius: 12px;
    display: block;
    height: 100%;
    width: var(--ambient-width);
  }

  .ambient-data-loom-row--hot .ambient-data-loom-fill {
    background: var(--accent-orange);
  }

  .ambient-data-loom-value {
    color: var(--text-primary);
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 0.66rem;
    text-align: right;
    white-space: nowrap;
  }

  @keyframes ambientDataFillBeat {
    0%,
    100% {
      opacity: 0.58;
      transform: translateX(-10%);
    }

    50% {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .ambient-data-caption {
    color: var(--text-muted-dim, var(--text-muted));
    flex: none;
    font-size: 0.68rem;
    line-height: 1.55;
    margin: 0;
    padding: 0;
  }

  .ambient-data-s-stat {
    align-items: center;
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 2px;
    text-align: center;
  }

  .ambient-data-s-value {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 1.55rem;
    line-height: 1;
    padding: 0;
  }

  .ambient-data-s-sub {
    font-size: 0.62rem;
    line-height: 1.2;
    padding: 0;
  }

  @container widget (max-width: 230px) {
    .ambient-data-title {
      font-size: 0.56rem;
      letter-spacing: 0.1em;
    }

    .ambient-data-badge {
      box-shadow: 2px 2px 0 var(--shadow);
      font-size: 0.5rem;
      padding: 4px 6px;
    }

    .ambient-data-root--m .ambient-data-side-read {
      gap: 5px;
    }

    .ambient-data-root--m .ambient-data-read-card {
      padding: 6px;
    }

    .ambient-data-root--m .ambient-data-read-key {
      font-size: 0.48rem;
      letter-spacing: 0.08em;
    }

    .ambient-data-root--m .ambient-data-read-value {
      font-size: 0.84rem;
    }

    .ambient-data-loom-row {
      grid-template-columns: 42px 1fr 38px;
    }
  }
`;

function StyleBlock() {
  return <style>{AMBIENT_DATA_STYLES}</style>;
}

function cellClassName(tone: CellTone): string {
  return tone === "idle" ? "ambient-data-cell" : `ambient-data-cell ambient-data-cell--${tone}`;
}

function HeaderRow() {
  return (
    <div className="ambient-data-topline">
      <div className="block-label ambient-data-title">ambient load mosaic</div>
      <div className="ambient-data-badge">css signal</div>
    </div>
  );
}

function Mosaic({ count, columns, scan = false }: { count: number; columns: number; scan?: boolean }) {
  const shellClassName = scan
    ? "ambient-data-mosaic-shell ambient-data-mosaic-shell--scan"
    : "ambient-data-mosaic-shell";

  return (
    <section aria-label="animated load cells" className={shellClassName}>
      <div className="ambient-data-mosaic" style={{ "--ambient-columns": columns } as CSSVars}>
        {MOSAIC_CELLS.slice(0, count).map((cell, index) => (
          <span
            aria-hidden="true"
            className={cellClassName(cell.tone)}
            key={`${cell.tone}-${cell.delay}-${index}`}
            style={{ "--ambient-delay": cell.delay } as CSSVars}
          />
        ))}
      </div>
    </section>
  );
}

function Readouts() {
  return (
    <section aria-label="load readouts" className="ambient-data-side-read">
      {READOUTS.map((readout) => (
        <div className="ambient-data-read-card" key={readout.label}>
          <div className="ambient-data-read-key">{readout.label}</div>
          <div className="block-value ambient-data-read-value">{readout.value}</div>
        </div>
      ))}
    </section>
  );
}

function Loom() {
  return (
    <section aria-label="signal source bars" className="ambient-data-loom">
      {LOOM_ROWS.map((row) => (
        <div
          className={row.hot ? "ambient-data-loom-row ambient-data-loom-row--hot" : "ambient-data-loom-row"}
          key={row.label}
        >
          <span className="ambient-data-loom-label">{row.label}</span>
          <span className="ambient-data-loom-track">
            <span
              className="ambient-data-loom-fill"
              style={
                {
                  "--ambient-delay": row.delay,
                  "--ambient-duration": row.duration,
                  "--ambient-width": `${row.value}%`,
                } as CSSVars
              }
            />
          </span>
          <span className="ambient-data-loom-value">{row.value}%</span>
        </div>
      ))}
    </section>
  );
}

export function AmbientDataWidget() {
  const { size } = useWidget();

  if (size === "S") {
    return (
      <div className="ambient-data-root ambient-data-root--s">
        <StyleBlock />
        <Mosaic columns={4} count={16} />
        <div className="ambient-data-s-stat">
          <div className="block-value accent ambient-data-s-value">64%</div>
          <div className="block-sub ambient-data-s-sub">avg load / 64 cells</div>
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="ambient-data-root ambient-data-root--m">
        <StyleBlock />
        <HeaderRow />
        <Mosaic columns={8} count={32} scan />
        <Readouts />
      </div>
    );
  }

  return (
    <div className="ambient-data-root ambient-data-root--l">
      <StyleBlock />
      <HeaderRow />
      <Mosaic columns={8} count={64} scan />
      <Readouts />
      <Loom />
      <p className="block-sub ambient-data-caption">
        Hot cells speed up as server pressure rises; cooler cells idle in longer stepped loops so
        the tile feels alive without becoming noisy.
      </p>
    </div>
  );
}
