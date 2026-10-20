import type { ClockThemeProps } from "../clockTheme";

function asciiBar(pct: number, width = 11): string {
  const filled = Math.round((pct / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}]`;
}

export function TerminalTheme({ size, d, chrome }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-trm">
        <div className="cth-trm-prompt">$ date</div>
        <div className="cth-trm-time" style={{ fontSize: "1.05rem" }}>{d.hh}:{d.mm}<span className="cth-trm-cursor" /></div>
        <div className="cth-trm-log">
          <div className="cth-trm-line"><span className="tag">[ok]</span><span>{d.phase}</span></div>
        </div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="cth-trm">
        <div className="cth-trm-prompt"><b>root@avns2</b>:~$ date --now</div>
        <div className="cth-trm-time" style={{ fontSize: "1.85rem" }}>{d.hh}:{d.mm}:{d.ss}<span className="cth-trm-cursor" /></div>
        <div className="cth-trm-log">
          <div className="cth-trm-line"><span className="tag">[ok]</span><span>sunrise</span><span className="dots">..........</span><span className="val">{d.sunriseLabel}</span></div>
          <div className="cth-trm-line"><span className="tag warn">[..]</span><span>phase</span><span className="dots">............</span><span className="val">{d.phase}</span></div>
          <div className="cth-trm-line"><span className="tag">[--]</span><span>sunset eta</span><span className="dots">......</span><span className="val">{d.sunsetLabel}</span><span className="cth-trm-bar">{asciiBar(d.dayPct)}</span></div>
        </div>
      </div>
    );
  }

  const rows = Math.min(5, d.calendar ? Math.ceil((d.calendar.firstDow + d.calendar.daysInMonth) / 7) : 0);

  return (
    <div className="cth-trm">
      <div className="cth-trm-prompt"><b>root@avns2</b>:~$ date --now &amp;&amp; status --day</div>
      <div className="cth-trm-time" style={{ fontSize: "2.3rem" }}>{d.hh}:{d.mm}:{d.ss}<span className="cth-trm-cursor" /></div>
      <div className="cth-dim" style={{ fontSize: "var(--fs-micro)", marginTop: -2 }}>{d.dateLong}</div>
      <div className="cth-trm-log">
        <div className="cth-trm-line"><span className="tag">[ok]</span><span>sunrise</span><span className="dots">..........................</span><span className="val">{d.sunriseLabel}</span></div>
        <div className="cth-trm-line"><span className="tag warn">[..]</span><span>phase</span><span className="dots">............................</span><span className="val">{d.phase}</span></div>
        <div className="cth-trm-line"><span className="tag">[--]</span><span>sunset eta</span><span className="dots">......................</span><span className="val">{d.sunsetLabel}</span><span className="cth-trm-bar">{asciiBar(d.dayPct)}</span></div>
        {chrome.showLofi && (
          <div className="cth-trm-line">
            <span className="tag">[ok]</span><span>lofi.radio</span><span className="dots">..................</span>
            <span className="val">{chrome.lofiPlaying ? "streaming" : "idle — click to stream"}</span>
          </div>
        )}
        <div className="cth-trm-line"><span className="tag">[ok]</span><span>theme</span><span className="dots">.........................</span><span className="val">dark / auto / light</span></div>
      </div>
      {chrome.showCalendar && d.calendar && (
        <div className="cth-trm-cal">
          <div className="cth-trm-prompt" style={{ marginBottom: 4 }}>$ cal {d.calendar.title.toLowerCase()}</div>
          <div className="cth-trm-cal-row">{["S", "M", "T", "W", "T", "F", "S"].map((x, i) => <span key={i}>{x}</span>)}</div>
          {Array.from({ length: rows }, (_, row) => (
            <div className="cth-trm-cal-row" key={row}>
              {Array.from({ length: 7 }, (_, col) => {
                const dayNum = row * 7 + col - d.calendar!.firstDow + 1;
                const valid = dayNum >= 1 && dayNum <= d.calendar!.daysInMonth;
                return <span className={valid && dayNum === d.calendar!.today ? "cur" : ""} key={col}>{valid ? dayNum : ""}</span>;
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
