import type { ClockThemeProps } from "../clockTheme";
import { LofiRow, ThemeModeRow } from "../ClockShared";

function Flap({ ch, w, h, fs }: { ch: string; w: number; h: number; fs: string }) {
  return (
    <div className="cth-flp" style={{ fontSize: fs, height: h, width: w }}>{ch}</div>
  );
}

function Colon() {
  return <div className="cth-flp-colon"><i /><i /></div>;
}

function Digits({ hh, mm, ss, w, h, fs }: { hh: string; mm: string; ss: string; w: number; h: number; fs: string }) {
  return (
    <div className="cth-flp-row">
      <Flap ch={hh[0]} fs={fs} h={h} w={w} />
      <Flap ch={hh[1]} fs={fs} h={h} w={w} />
      <Colon />
      <Flap ch={mm[0]} fs={fs} h={h} w={w} />
      <Flap ch={mm[1]} fs={fs} h={h} w={w} />
      {ss && (
        <>
          <Colon />
          <Flap ch={ss[0]} fs={fs} h={h} w={w} />
          <Flap ch={ss[1]} fs={fs} h={h} w={w} />
        </>
      )}
    </div>
  );
}

export function FlapTheme({ size, d, chrome }: ClockThemeProps) {
  if (size === "S") {
    return (
      <div className="cth-flp-s">
        <Digits fs="1.05rem" h={32} hh={d.hh} mm={d.mm} ss="" w={24} />
        <div className="cth-flp-date">{d.dateShort.toLowerCase()}</div>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div className="cth-flp-m">
        <Digits fs="1.6rem" h={46} hh={d.hh} mm={d.mm} ss={d.ss} w={34} />
        <div className="cth-flp-date" style={{ marginTop: 0 }}>{d.dateMed}</div>
        <div className="cth-flp-pass">
          <div className="cth-flp-stub">DEP<b>{d.sunriseLabel}</b></div>
          <div className="cth-flp-line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </div>
          <div className="cth-flp-stub">ARR<b>{d.sunsetLabel}</b></div>
        </div>
      </div>
    );
  }

  return (
    <div className="cth-flp-l">
      <Digits fs="2rem" h={58} hh={d.hh} mm={d.mm} ss={d.ss} w={42} />
      <div className="cth-flp-date" style={{ marginTop: 0 }}>{d.dateLong}</div>
      <div className="cth-flp-pass">
        <div className="cth-flp-stub">DEP<b>{d.sunriseLabel}</b></div>
        <div className="cth-flp-line">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </div>
        <div className="cth-flp-stub">ARR<b>{d.sunsetLabel}</b></div>
      </div>
      <div className="cth-flp-perf">
        <span className="line" />
        {Array.from({ length: 14 }, (_, i) => <i key={i} />)}
        <span className="line" />
      </div>
      <div style={{ alignItems: "center", display: "flex", gap: 18 }}>
        {chrome.showLofi && <LofiRow playing={chrome.lofiPlaying} label={`cabin audio — ${chrome.lofiLabel}`} onToggle={chrome.toggleLofi} />}
        <div style={{ flex: 1 }} />
        <ThemeModeRow mode={chrome.themeMode} setMode={chrome.setThemeMode} />
      </div>
    </div>
  );
}
