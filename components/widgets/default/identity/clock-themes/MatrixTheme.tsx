import { useMemo } from "react";
import type { ClockThemeProps } from "../clockTheme";

type Dot = { lit: boolean; cyan: boolean; delay: number };

/** radial cluster of lit dots around (cx, cy) with radius r, in grid-cell
    units; a few cells near the cluster's edge alternate cyan for texture,
    and the pulse animation staggers by distance from center */
function useDotGrid(cols: number, rows: number, cx: number, cy: number, r: number): Dot[] {
  return useMemo(() => {
    const dots: Dot[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dist = Math.hypot(col - cx, row - cy);
        const lit = dist <= r;
        dots.push({ lit, cyan: lit && dist > r * 0.6 && (col + row) % 3 === 0, delay: dist * 0.12 });
      }
    }
    return dots;
  }, [cols, rows, cx, cy, r]);
}

function Grid({ cols, rows, cell, dots, style }: { cols: number; rows: number; cell: number; dots: Dot[]; style?: React.CSSProperties }) {
  return (
    <div className="cth-mx-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridTemplateRows: `repeat(${rows}, ${cell}px)`, ...style }}>
      {dots.map((dot, i) => (
        <i
          className={dot.lit ? `lit${dot.cyan ? " cyan" : ""}` : ""}
          key={i}
          style={dot.lit ? { animationDelay: `${dot.delay}s` } : undefined}
        />
      ))}
    </div>
  );
}

/** single-day-lit "calendar" reading of the same dot language, instead of a
    plain grid - the day-of-month cell is lit, everything else stays dim */
function CalendarGrid({ firstDow, daysInMonth, today, cell }: { firstDow: number; daysInMonth: number; today: number; cell: number }) {
  const rows = Math.ceil((firstDow + daysInMonth) / 7);
  const dots = useMemo<Dot[]>(() => {
    const out: Dot[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 7; col++) {
        const dayNum = row * 7 + col - firstDow + 1;
        out.push({ lit: dayNum === today, cyan: false, delay: 0 });
      }
    }
    return out;
  }, [rows, firstDow, today]);
  return <Grid cell={cell} cols={7} dots={dots} rows={rows} />;
}

export function MatrixTheme({ size, d, chrome }: ClockThemeProps) {
  const dotsS = useDotGrid(7, 7, 3.6, 2.4, 2.1);
  const dotsM = useDotGrid(11, 11, 6, 3.4, 3.2);
  const dotsL = useDotGrid(13, 13, 7, 4, 3.8);

  if (size === "S") {
    return (
      <div className="cth-mx-wrap" style={{ flexDirection: "column", gap: 8, justifyContent: "center" }}>
        <Grid cell={7} cols={7} dots={dotsS} rows={7} />
        <div className="cth-mx-side" style={{ alignItems: "center", textAlign: "center" }}>
          <div className="cth-mx-time" style={{ fontSize: "1.3rem" }}>{d.hh}:{d.mm}</div>
          <div className="cth-mx-phase">{d.phase}</div>
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="cth-mx-wrap">
        <Grid cell={8} cols={11} dots={dotsM} rows={11} />
        <div className="cth-mx-side">
          <div className="cth-mx-time" style={{ fontSize: "1.9rem" }}>{d.hh}:{d.mm}:{d.ss}</div>
          <div className="cth-mx-date">{d.dateShort}</div>
          <div className="cth-mx-suns"><span>sunrise<b>{d.sunriseLabel}</b></span><span>sunset<b>{d.sunsetLabel}</b></span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="cth-mx-wrap" style={{ alignItems: "flex-start" }}>
      <Grid cell={9} cols={13} dots={dotsL} rows={13} style={{ marginTop: 4 }} />
      <div className="cth-mx-side" style={{ flex: 1 }}>
        <div className="cth-mx-time" style={{ fontSize: "2.4rem" }}>{d.hh}:{d.mm}:{d.ss}</div>
        <div className="cth-mx-date">{d.dateLong}</div>
        <div className="cth-mx-phase">{d.phase}</div>
        <div className="cth-mx-suns" style={{ marginTop: 4 }}><span>sunrise<b>{d.sunriseLabel}</b></span><span>sunset<b>{d.sunsetLabel}</b></span></div>
        {chrome.showCalendar && d.calendar && (
          <div className="cth-mx-l-bottom">
            <div className="cth-mx-cal-label">{d.calendar.title.toLowerCase()}</div>
            <CalendarGrid cell={8} daysInMonth={d.calendar.daysInMonth} firstDow={d.calendar.firstDow} today={d.calendar.today} />
          </div>
        )}
      </div>
    </div>
  );
}
