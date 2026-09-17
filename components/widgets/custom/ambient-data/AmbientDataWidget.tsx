"use client";

import { type CSSProperties } from "react";
import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";
import { formatRate, type HostTelemetry } from "@/lib/homelab";

type CellTone = "idle" | "hot" | "dim" | "core";
type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

interface LoomData {
  label: string;
  value: number;
  hot?: boolean;
  duration: string;
  delay: string;
}

// Each cell owns a fixed threshold on the 0-100 load scale. `i * 37 % 100`
// scatters them so lighting up in threshold order reads as a spreading
// mosaic rather than a bar filling left-to-right, and being derived from the
// index (not Math.random) keeps a cell's identity stable across re-renders.
const CELL_COUNT = 64;
const CELL_THRESHOLDS: number[] = Array.from({ length: CELL_COUNT }, (_, i) => ((i * 37) % 100) + 0.5);
// Stable per-cell animation offset, so neighbouring cells never pulse in step.
const CELL_DELAYS: string[] = Array.from({ length: CELL_COUNT }, (_, i) => `-${(((i * 17) % 50) / 10).toFixed(1)}s`);

/** tone for one cell at the current load — above its threshold it is hot,
    just below it is "warming" (core), well below it idles */
function toneForCell(index: number, load: number): CellTone {
  const threshold = CELL_THRESHOLDS[index];
  if (load >= threshold) return "hot";
  if (load >= threshold - 12) return "core";
  return threshold > 82 ? "dim" : "idle";
}

/** The caption has always promised "hot cells speed up as server pressure
    rises" — this is what makes that literally true: 5.6s idle → 1.7s flat out. */
function tempoSeconds(load: number): number {
  const clamped = Math.min(100, Math.max(0, load));
  return 5.6 - (clamped / 100) * 3.9;
}

const POLL_URL = "/api/system-stats";
const POLL_MS = 60_000;

type Load = {
  cpu: number;
  memory: number;
  disk: number;
  net: string;
  ready: boolean;
};

function useLoad(): Load {
  const { data } = usePolling<HostTelemetry>(POLL_URL, POLL_MS);
  if (!data) return { cpu: 0, memory: 0, disk: 0, net: "—", ready: false };
  // the fullest real drive is the honest "disk pressure" figure; an average
  // across mounts would hide a single volume about to run out
  const disk = data.drives.reduce((max, d) => Math.max(max, d.used_pct), 0);
  return {
    cpu: data.cpu.used_pct,
    memory: data.memory.used_pct,
    disk,
    net: formatRate(data.network.rx_rate_bps + data.network.tx_rate_bps),
    ready: true,
  };
}

const pct = (n: number) => `${Math.round(n)}%`;

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

  /* An S cell is short (~236x96 on the default grid): stacking a square
     mosaic above the stat pushed the stat out of the card, so S runs side by
     side instead, with the mosaic taking the leftover width and its cells
     flexing to the height available. */
  .ambient-data-root--s {
    align-items: center;
    flex-direction: row;
    gap: 8px;
    justify-content: center;
    overflow: hidden;
  }

  .ambient-data-root--s .ambient-data-mosaic-shell {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
  }

  .ambient-data-root--s .ambient-data-mosaic {
    flex: 1;
    grid-auto-rows: minmax(0, 1fr);
    min-height: 0;
  }

  .ambient-data-root--s .ambient-data-cell {
    aspect-ratio: auto;
    min-height: 0;
  }

  .ambient-data-root--s .ambient-data-s-stat {
    flex: none;
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

  /* the mosaic gives way first; readouts, loom and caption keep their size */
  .ambient-data-root--l .ambient-data-mosaic-shell {
    display: flex;
    flex: 1 1 auto;
    min-height: 120px;
  }

  .ambient-data-root--l .ambient-data-mosaic {
    flex: 1;
    grid-auto-rows: minmax(0, 1fr);
    min-height: 0;
  }

  .ambient-data-root--l .ambient-data-cell {
    aspect-ratio: auto;
    min-height: 0;
  }

  .ambient-data-topline {
    align-items: center;
    display: flex;
    flex: none;
    gap: 10px;
    justify-content: flex-end;
    min-width: 0;
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
    display: flex;
    /* The cells are square by default, which made the mosaic taller than an
       M card and pushed the readouts out of the card entirely (the root
       clips, so they weren't even scrollable). Here the mosaic takes the
       space left over instead, and the cells flex to fill it. */
    flex: 1 1 auto;
    min-height: 0;
    padding: 10px;
  }

  .ambient-data-root--m .ambient-data-mosaic {
    flex: 1;
    grid-auto-rows: minmax(0, 1fr);
    min-height: 0;
  }

  .ambient-data-root--m .ambient-data-cell {
    aspect-ratio: auto;
    min-height: 0;
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
    animation: ambientDataCellIdle var(--ambient-tempo, 5.6s) steps(4) infinite;
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
    animation-duration: calc(var(--ambient-tempo, 5.6s) * 0.5);
    animation-name: ambientDataCellHot;
    background: var(--accent-orange);
  }

  .ambient-data-cell--dim {
    animation-duration: calc(var(--ambient-tempo, 5.6s) * 1.3);
    background: var(--text-muted-dim, var(--text-muted));
  }

  .ambient-data-cell--core {
    animation-duration: calc(var(--ambient-tempo, 5.6s) * 0.75);
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
    /* JetBrains Mono, per the type rules: DotGothic16 is for labels and the
       headline stat, mono for data values — and DotGothic's glyphs collided
       at this size here */
    font-family: var(--font-jetbrains-mono), monospace;
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

function HeaderRow({ load }: { load: Load }) {
  return (
    // the widget's name lives in the card chrome (and, in Slot Layout, the
    // hover tag) — repeating it here only ate a row of a small card
    <div className="ambient-data-topline">
      <div className="ambient-data-badge">{load.ready ? `cpu ${pct(load.cpu)}` : "reading…"}</div>
    </div>
  );
}

function Mosaic({ count, columns, load, scan = false }: { count: number; columns: number; load: number; scan?: boolean }) {
  const shellClassName = scan
    ? "ambient-data-mosaic-shell ambient-data-mosaic-shell--scan"
    : "ambient-data-mosaic-shell";

  return (
    <section aria-label={`load cells, ${Math.round(load)} percent`} className={shellClassName}>
      <div className="ambient-data-mosaic" style={{ "--ambient-columns": columns } as CSSVars}>
        {Array.from({ length: count }, (_, index) => (
          <span
            aria-hidden="true"
            className={cellClassName(toneForCell(index, load))}
            key={index}
            style={{ "--ambient-delay": CELL_DELAYS[index] } as CSSVars}
          />
        ))}
      </div>
    </section>
  );
}

function Readouts({ load }: { load: Load }) {
  const readouts = [
    { label: "CPU", value: load.ready ? pct(load.cpu) : "—" },
    { label: "Memory", value: load.ready ? pct(load.memory) : "—" },
    { label: "Network", value: load.net },
  ];

  return (
    <section aria-label="load readouts" className="ambient-data-side-read">
      {readouts.map((readout) => (
        <div className="ambient-data-read-card" key={readout.label}>
          <div className="ambient-data-read-key">{readout.label}</div>
          <div className="block-value ambient-data-read-value">{readout.value}</div>
        </div>
      ))}
    </section>
  );
}

function Loom({ load }: { load: Load }) {
  // "hot" is a real pressure threshold now, not a hand-picked flag
  const rows: LoomData[] = [
    { label: "CPU", value: load.cpu },
    { label: "Mem", value: load.memory },
    { label: "Disk", value: load.disk },
  ].map((row, i) => ({
    ...row,
    hot: row.value >= 80,
    duration: `${(tempoSeconds(row.value) * 0.75).toFixed(1)}s`,
    delay: `-${(i * 0.7).toFixed(1)}s`,
  }));

  return (
    <section aria-label="signal source bars" className="ambient-data-loom">
      {rows.map((row) => (
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
                  "--ambient-width": `${Math.min(100, Math.max(0, row.value))}%`,
                } as CSSVars
              }
            />
          </span>
          <span className="ambient-data-loom-value">{load.ready ? pct(row.value) : "—"}</span>
        </div>
      ))}
    </section>
  );
}

export function AmbientDataWidget() {
  const { size } = useWidget();
  const load = useLoad();
  // one variable drives every cell's pulse rate, so the whole mosaic speeds
  // up together as the box gets busier
  const tempo = { "--ambient-tempo": `${tempoSeconds(load.cpu).toFixed(2)}s` } as CSSVars;

  if (size === "S") {
    return (
      <div className="ambient-data-root ambient-data-root--s" style={tempo}>
        <StyleBlock />
        <Mosaic columns={4} count={16} load={load.cpu} />
        <div className="ambient-data-s-stat">
          <div className="block-value accent ambient-data-s-value">{load.ready ? pct(load.cpu) : "—"}</div>
          <div className="block-sub ambient-data-s-sub">cpu load / 16 cells</div>
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="ambient-data-root ambient-data-root--m" style={tempo}>
        <StyleBlock />
        <HeaderRow load={load} />
        <Mosaic columns={8} count={24} load={load.cpu} scan />
        <Readouts load={load} />
      </div>
    );
  }

  return (
    <div className="ambient-data-root ambient-data-root--l" style={tempo}>
      <StyleBlock />
      <HeaderRow load={load} />
      <Mosaic columns={8} count={CELL_COUNT} load={load.cpu} scan />
      <Readouts load={load} />
      <Loom load={load} />
      <p className="block-sub ambient-data-caption">
        Live from this host. Each cell holds a fixed point on the 0-100 scale and lights up once CPU
        load passes it, so the mosaic fills as pressure rises — and every cell pulses faster with it.
      </p>
    </div>
  );
}
