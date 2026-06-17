"use client";
import "./NutBotFaceV2.css";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import {
  getSignal, getServerSignal, subscribeSignal,
  type Signal,
} from "@/lib/nutbotSignal";
import { getHoeActive } from "@/lib/hoeSignal";

function signalToExpression(s: Signal): string {
  if (!s) return "idle";
  switch (s.type) {
    case "widget_created": return "excited";
    case "thinking":       return "thinking";
    case "error":          return "error";
    case "working":        return "focused";
    default:               return "idle";
  }
}

interface Props {
  /** Omit neck + base — used at S size to save vertical space */
  compact?: boolean;
}

export function NutBotFaceV2({ compact = false }: Props) {
  // SVG element refs — mutated imperatively by the animation loop
  const elRef    = useRef<SVGRectElement>(null);
  const erRef    = useRef<SVGRectElement>(null);
  const seRef    = useRef<SVGGElement>(null);
  const bwRef    = useRef<SVGGElement>(null);
  const moRef    = useRef<SVGGElement>(null);
  const fxRef    = useRef<SVGGElement>(null);
  // Host DOM refs for expression side-effects
  const screenRef = useRef<HTMLDivElement>(null);
  const bodyRef   = useRef<HTMLDivElement>(null);
  const mledRef   = useRef<HTMLDivElement>(null);
  const bled3Ref  = useRef<HTMLDivElement>(null);

  // Shared with the signal-mapping effect and click handler
  const switchToRef    = useRef<((key: string) => void) | null>(null);
  const isBlinkingRef  = useRef(false);
  const currentExprRef = useRef("idle");
  const clickTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unique SVG filter/pattern IDs per instance (prevents conflicts if widget is duplicated)
  const uid  = useId().replace(/[^a-zA-Z0-9]/g, "");
  const GC   = `${uid}gc`;
  const GW   = `${uid}gw`;
  const GR   = `${uid}gr`;
  const SL   = `${uid}sl`;

  const signal    = useSyncExternalStore(subscribeSignal, getSignal, getServerSignal);
  const signalRef = useRef(signal);
  signalRef.current = signal;

  // Map incoming signal → expression; cancel any active click override first
  useEffect(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      bodyRef.current?.classList.remove("boop");
    }
    switchToRef.current?.(signalToExpression(signal));
  }, [signal]);

  // Click: close eyes, :3 face, quick boop squish, snap back after 280ms
  function handleClick() {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    switchToRef.current?.("poked");
    // add boop class AFTER switchTo so it isn't overwritten by the anim field
    bodyRef.current?.classList.add("boop");
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      bodyRef.current?.classList.remove("boop");
      switchToRef.current?.(signalToExpression(signalRef.current));
    }, 280);
  }

  // Animation engine — runs once on mount, all logic lives inside the closure
  useEffect(() => {
    const EL = elRef.current!;
    const ER = erRef.current!;
    const SE = seRef.current!;
    const BW = bwRef.current!;
    const MO = moRef.current!;
    const FX = fxRef.current!;

    const C = "#00b4c8", O = "#ff6b2b", R = "#ff4040", P = "#ff6b8a";
    const LX = 52, RX = 108, EY = 52, EW = 14, EH = 28;

    // ── primitives ──────────────────────────────────────────────────────
    function setBar(
      el: SVGRectElement, cx: number, cy: number,
      w: number, h: number, color = C, rx = 4.5,
    ) {
      el.setAttribute("x",      (cx - w / 2).toFixed(2));
      el.setAttribute("y",      (cy - h / 2).toFixed(2));
      el.setAttribute("width",  Math.max(0, w).toFixed(2));
      el.setAttribute("height", Math.max(0.5, h).toFixed(2));
      el.setAttribute("fill",   color);
      el.setAttribute("rx", String(rx));
      el.setAttribute("ry", String(rx));
    }

    const showBars = () => { EL.style.display = ""; ER.style.display = ""; };
    const hideBars = () => { EL.style.display = "none"; ER.style.display = "none"; };
    const clearAll = () => { SE.innerHTML = ""; BW.innerHTML = ""; MO.innerHTML = ""; FX.innerHTML = ""; };

    const lerp   = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
    const clamp  = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.5);
    const easeIO  = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    // ── SVG fragment builders ────────────────────────────────────────────
    function arcEye(cx: number, cy: number, fill = C) {
      const w = 17, outer = 15, inner = 4;
      return `<path d="M${cx-w} ${cy} Q${cx} ${cy-outer} ${cx+w} ${cy} Q${cx} ${cy-inner} ${cx-w} ${cy}Z"
        fill="${fill}" filter="url(#${GC})"/>`;
    }

    function heartEye(cx: number, cy: number, s = 0.85, fill = P) {
      const p = (dx: number, dy: number) => `${cx + dx * s} ${cy + dy * s}`;
      return `<path d="M${p(0,-8)} C${p(0,-8)} ${p(-5,-15)} ${p(-10,-10)}
        C${p(-15,-5)} ${p(-15,0)} ${p(-9,6)} L${p(0,14)} L${p(9,6)}
        C${p(15,0)} ${p(15,-5)} ${p(10,-10)} C${p(5,-15)} ${p(0,-8)} ${p(0,-8)}Z"
        fill="${fill}" filter="url(#${GW})"/>`;
    }

    function xEye(cx: number, cy: number, fill = R, op = 1) {
      const s = 22, t = s * 0.19;
      return `
        <rect x="${cx-s/2}" y="${cy-t/2}" width="${s}" height="${t}" rx="${t/2}"
          fill="${fill}" opacity="${op}" transform="rotate(45,${cx},${cy})" filter="url(#${GR})"/>
        <rect x="${cx-s/2}" y="${cy-t/2}" width="${s}" height="${t}" rx="${t/2}"
          fill="${fill}" opacity="${op}" transform="rotate(-45,${cx},${cy})" filter="url(#${GR})"/>`;
    }

    function smile(y = 91, w = 26, up = true, fill = C) {
      const cy = up ? y + 11 : y - 11;
      return `<path d="M${80-w} ${y} Q80 ${cy} ${80+w} ${y}"
        fill="none" stroke="${fill}" stroke-width="3.5" stroke-linecap="round"
        filter="url(#${GC})"/>`;
    }

    function blush(fill = O) {
      return `<ellipse cx="26" cy="80" rx="13" ry="7" fill="${fill}" opacity=".22"/>
              <ellipse cx="134" cy="80" rx="13" ry="7" fill="${fill}" opacity=".22"/>`;
    }

    function lookCycle(t: number, period = 9, max = 8) {
      const c = (t % period) / period;
      if (c < 0.11) return 0;
      if (c < 0.19) return lerp(0, -max, easeIO((c - 0.11) / 0.08));
      if (c < 0.37) return -max;
      if (c < 0.45) return lerp(-max, 0, easeIO((c - 0.37) / 0.08));
      if (c < 0.57) return 0;
      if (c < 0.65) return lerp(0, max, easeIO((c - 0.57) / 0.08));
      if (c < 0.83) return max;
      if (c < 0.91) return lerp(max, 0, easeIO((c - 0.83) / 0.08));
      return 0;
    }

    // ── expressions ─────────────────────────────────────────────────────
    interface Expr {
      led?: string; screen?: string; anim?: string; ledB3?: string; blink?: boolean;
      onEnter(): void;
      tick(t: number): void;
    }

    // smooth gaze state for idle HOE tracking — persists across frames
    let gazeX = 0;
    let gazeY = 0;

    const EXPRS: Record<string, Expr> = {

      idle: {
        led: "", screen: "", anim: "", blink: true,
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          if (isBlinkingRef.current) return;

          const hoe = getHoeActive();
          let targetX = lookCycle(t);
          let targetY = 0;

          if (hoe) {
            const nb = bodyRef.current?.getBoundingClientRect();
            if (nb) {
              const dx = hoe.centerX - (nb.left + nb.width / 2);
              const dy = hoe.centerY - (nb.top + nb.height / 2);
              const dist = Math.hypot(dx, dy) || 1;
              targetX = clamp((dx / dist) * 20, -20, 20);
              targetY = clamp((dy / dist) * 10, -10, 10);
            }
          }

          // smooth lerp so the eyes glide rather than snap
          gazeX += (targetX - gazeX) * 0.15;
          gazeY += (targetY - gazeY) * 0.15;

          setBar(EL, LX + gazeX, EY + gazeY, 18, 34);
          setBar(ER, RX + gazeX, EY + gazeY, 18, 34);
        },
      },

      happy: {
        led: "", screen: "gc", anim: "",
        onEnter() { clearAll(); hideBars(); FX.innerHTML = blush(O); },
        tick(t) {
          const pulse = Math.sin(t * 2.8) * 1.4;
          const h = 13 + pulse, w = 15, angle = 16, cy = EY - 2;
          SE.innerHTML = `
            <rect x="${LX-w/2}" y="${cy-h/2}" width="${w}" height="${h}" rx="4.5"
              fill="${C}" filter="url(#${GC})" transform="rotate(-${angle} ${LX} ${cy})"/>
            <rect x="${RX-w/2}" y="${cy-h/2}" width="${w}" height="${h}" rx="4.5"
              fill="${C}" filter="url(#${GC})" transform="rotate(${angle} ${RX} ${cy})"/>`;
          MO.innerHTML = smile(91 + pulse * 0.25, 27, true);
        },
      },

      annoyed: {
        led: "", screen: "", anim: "",
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const c = t % 1.8;
          let dx: number;
          if      (c < 0.14)  dx = -10;
          else if (c < 0.44)  dx = -10;
          else if (c < 0.58)  dx = lerp(-10, 10, (c - 0.44) / 0.14);
          else if (c < 0.90)  dx = 10;
          else if (c < 1.04)  dx = lerp(10, 0, (c - 0.9) / 0.14);
          else                dx = 0;
          const h = 18 + Math.sin(t * 6) * 0.8;
          setBar(EL, LX + dx, EY, EW, h);
          setBar(ER, RX + dx, EY, EW, h);
          const bx = dx * 0.25;
          BW.innerHTML = `
            <line x1="${34+bx}" y1="32" x2="${58+bx}" y2="39"
              stroke="${C}" stroke-width="2.8" stroke-linecap="round" opacity=".72"/>
            <line x1="${102+bx}" y1="39" x2="${126+bx}" y2="32"
              stroke="${C}" stroke-width="2.8" stroke-linecap="round" opacity=".72"/>`;
        },
      },

      excited: {
        led: "amber", screen: "go", anim: "bounce",
        onEnter() {
          clearAll(); showBars();
          FX.innerHTML = blush(O)
            + `<circle cx="20" cy="32" r="3" fill="${O}" opacity=".5" filter="url(#${GW})"/>`
            + `<circle cx="140" cy="32" r="3" fill="${O}" opacity=".5" filter="url(#${GW})"/>`;
        },
        tick(t) {
          const pulse = 1 + Math.sin(t * 9) * 0.18;
          setBar(EL, LX, EY, EW * pulse, EH * pulse, O, 4.5);
          setBar(ER, RX, EY, EW * pulse, EH * pulse, O, 4.5);
          MO.innerHTML = smile(92, 27, true, O);
        },
      },

      sleepy: {
        led: "off", screen: "", anim: "",
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const phase = (t % 5) / 5;
          let h: number;
          if      (phase < 0.35) h = lerp(EH, 4, easeIO(phase / 0.35));
          else if (phase < 0.55) h = 4;
          else if (phase < 0.75) h = lerp(4, 12, easeIO((phase - 0.55) / 0.2));
          else                   h = 12;
          const dy = lerp(0, 5, (EH - Math.max(h, 0)) / EH);
          setBar(EL, LX, EY + dy, EW, h);
          setBar(ER, RX, EY + dy, EW, h);
          const zt = (t % 3.2) / 3.2;
          FX.innerHTML = `
            <text x="116" y="${40 - zt*14}" font-size="11" font-family="monospace"
              fill="${C}" opacity="${clamp(1-zt*.7,0,1)}" filter="url(#${GC})">z</text>
            <text x="126" y="${27 - zt*9}" font-size="9" font-family="monospace"
              fill="${C}" opacity="${clamp(.7-zt*.6,0,1)}">z</text>
            <text x="134" y="${17 - zt*5}" font-size="7" font-family="monospace"
              fill="${C}" opacity="${clamp(.4-zt*.35,0,1)}">z</text>`;
        },
      },

      surprised: {
        led: "", screen: "gc", anim: "",
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const entry = Math.min(t / 0.25, 1);
          const breath = Math.sin(t * 1.6) * 0.5;
          const w = lerp(EW, EW * 1.9, easeOut(entry)) + breath;
          const h = lerp(EH, EH * 1.75, easeOut(entry)) + breath;
          setBar(EL, LX, EY, w, h);
          setBar(ER, RX, EY, w, h);
          MO.innerHTML = `<ellipse cx="80" cy="95" rx="9" ry="${11+breath}"
            fill="${C}" opacity=".44" filter="url(#${GC})"/>`;
        },
      },

      thinking: {
        led: "", screen: "", anim: "tilt",
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const sq    = Math.min(t / 0.7, 1);
          const lh    = lerp(EH, 9, easeOut(sq));
          const drift = Math.sin(t * 0.45) * 2.5;
          setBar(EL, LX + drift, EY - 3, EW, lh);
          setBar(ER, RX + drift, EY - 3, EW, EH);
          const d1 = 0.5 + Math.sin(t * 4.2) * 0.4;
          const d2 = 0.5 + Math.sin(t * 4.2 - 1.3) * 0.4;
          const d3 = 0.5 + Math.sin(t * 4.2 - 2.6) * 0.4;
          BW.innerHTML = `
            <circle cx="109" cy="22" r="5"   fill="${C}" opacity="${d1}" filter="url(#${GC})"/>
            <circle cx="121" cy="14" r="3.8" fill="${C}" opacity="${d2}"/>
            <circle cx="131" cy="7"  r="2.6" fill="${C}" opacity="${d3}"/>`;
        },
      },

      focused: {
        led: "", screen: "gc", anim: "",
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          // ── narrow eyes + periodic left scan ─────────────────────────
          const scanT = t % 6;
          let dx = 0;
          if      (scanT > 4 && scanT < 4.15)   dx = lerp(0, -6, (scanT - 4) / 0.15);
          else if (scanT >= 4.15 && scanT < 5)   dx = -6;
          else if (scanT >= 5 && scanT < 5.15)   dx = lerp(-6, 0, (scanT - 5) / 0.15);
          const h = EH + Math.sin(t * 1.2) * 0.5;
          setBar(EL, LX + dx, EY, 11, h);
          setBar(ER, RX + dx, EY, 11, h);
          BW.innerHTML = `
            <line x1="${37+dx*.3}" y1="33" x2="${57+dx*.3}" y2="39"
              stroke="${C}" stroke-width="2.5" stroke-linecap="round" opacity=".65"/>
            <line x1="${103+dx*.3}" y1="39" x2="${123+dx*.3}" y2="33"
              stroke="${C}" stroke-width="2.5" stroke-linecap="round" opacity=".65"/>`;

          // ── scrolling terminal output ─────────────────────────────────
          const TLINES = [
            "01001011  loop(t)",
            "0xDEAD    fn_exec",
            "10110010  proc_ok",
            "> spawn   0xBEEF",
            "FF3A00C8  init..",
            "01110010  async()",
            "0x4200    run_seq",
            "11001001  > done",
          ];
          const LH = 9, T0 = 71, T1 = 110;
          const scroll = (t * 13) % (TLINES.length * LH);
          const nvis   = Math.ceil((T1 - T0) / LH) + 1;

          let out = `<rect x="4" y="${T0-2}" width="152" height="${T1-T0+4}" rx="2"
              fill="${C}" opacity=".05"/>
            <line x1="4" y1="${T0-3}" x2="156" y2="${T0-3}"
              stroke="${C}" stroke-width=".5" opacity=".18"/>`;

          for (let i = -1; i < nvis; i++) {
            const y   = T0 + i * LH - (scroll % LH);
            const idx = ((Math.floor(scroll / LH) + i) % TLINES.length + TLINES.length) % TLINES.length;
            const op  = Math.min(
              clamp((y - T0) / (LH * 1.2), 0, 1),
              clamp((T1 - y) / (LH * 1.2), 0, 1),
            ) * 0.72;
            if (op < 0.02) continue;
            out += `<text x="8" y="${y}" font-size="6.5" font-family="monospace"
              fill="${C}" opacity="${op.toFixed(2)}">${TLINES[idx]}</text>`;
          }

          // blinking block cursor at the bottom
          if (Math.floor(t * 2.4) % 2 === 0) {
            out += `<rect x="8" y="${T1-7}" width="5" height="7" rx="1"
              fill="${C}" opacity=".8"/>`;
          }

          MO.innerHTML = out;
        },
      },

      error: {
        led: "red", screen: "gr", anim: "shake", ledB3: "r",
        onEnter() { clearAll(); hideBars(); },
        tick() {
          const flicker = Math.random() > 0.12 ? 1 : 0;
          const jx = (Math.random() - 0.5) * 7;
          const jy = (Math.random() - 0.5) * 4;
          SE.innerHTML = xEye(LX + jx, EY + jy, R, flicker) + xEye(RX - jx, EY - jy, R, flicker);
          MO.innerHTML = `
            <text x="40" y="96" font-size="8.5" font-family="monospace"
              fill="${R}" opacity="${0.7 + Math.random() * 0.3}" filter="url(#${GR})">ERR_0xNULL</text>
            <rect x="${Math.random()*50}" y="66" width="${25 + Math.random()*55}" height="2.5"
              fill="${R}" opacity="${Math.random() * 0.14}"/>`;
        },
      },

      love: {
        led: "pink", screen: "gp", anim: "pulse", ledB3: "p",
        onEnter() { clearAll(); hideBars(); FX.innerHTML = blush(P); },
        tick(t) {
          const s = 0.78 + Math.sin(t * 2.4) * 0.11;
          SE.innerHTML = heartEye(LX, EY + 1, s) + heartEye(RX, EY + 1, s);
          MO.innerHTML = smile(93, 25, true, P);
        },
      },

      nervous: {
        led: "", screen: "", anim: "",
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const dx = Math.sin(t * 13.7) * 7 + Math.sin(t * 8.3) * 4;
          const dy = Math.sin(t * 11.1) * 3 + Math.sin(t * 6.7) * 2;
          setBar(EL, LX + dx, EY + dy, EW, EH);
          setBar(ER, RX + dx, EY + dy, EW, EH);
          const drip = (t % 2.5) / 2.5;
          FX.innerHTML = `
            <ellipse cx="143" cy="${27+drip*10}" rx="4" ry="${5+drip*2}"
              fill="${C}" opacity="${clamp(.7-drip*.4,0,1)}" filter="url(#${GC})"/>
            <path d="M139 ${27+drip*10} Q143 ${17+drip*8} 147 ${27+drip*10}"
              fill="${C}" opacity="${clamp(.7-drip*.4,0,1)}" filter="url(#${GC})"/>`;
        },
      },

      bored: {
        led: "off", screen: "", anim: "",
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const dx = lookCycle(t, 14, 9);
          const dy = 4 + Math.sin(t * 0.6) * 1;
          const h  = 14 + Math.sin(t * 0.4) * 1.2;
          setBar(EL, LX + dx, EY + dy, EW, h);
          setBar(ER, RX + dx, EY + dy, EW, h);
          MO.innerHTML = smile(93, 20, false);
        },
      },

      // triggered by click — closed eyes + :3 cat mouth, 280ms then returns
      poked: {
        led: "", screen: "", anim: "",
        onEnter() {
          clearAll();
          showBars();
          setBar(EL, LX, EY, EW + 2, 3);
          setBar(ER, RX, EY, EW + 2, 3);
        },
        tick() {
          // static — just hold the closed-eye + :3 state
          setBar(EL, LX, EY, EW + 2, 3);
          setBar(ER, RX, EY, EW + 2, 3);
          MO.innerHTML = `
            <path d="M61 91 Q70 100 80 91 Q90 100 99 91"
              fill="none" stroke="${C}" stroke-width="3.2" stroke-linecap="round"
              stroke-linejoin="round" filter="url(#${GC})"/>`;
        },
      },
    };

    // ── blink system ─────────────────────────────────────────────────────
    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    const currentKeyRef = { current: "idle" };

    function scheduleBlink() {
      if (blinkTimer) clearTimeout(blinkTimer);
      blinkTimer = setTimeout(() => {
        if (currentKeyRef.current !== "idle") return;
        isBlinkingRef.current = true;
        setBar(EL, LX, EY, 18, 5);
        setBar(ER, RX, EY, 18, 5);
        setTimeout(() => {
          isBlinkingRef.current = false;
          scheduleBlink();
        }, 105);
      }, 2000 + Math.random() * 3500);
    }

    // ── animation loop ────────────────────────────────────────────────────
    let startTime: number | null = null;
    let rafId: number;

    function tick(ts: number) {
      if (!startTime) startTime = ts;
      EXPRS[currentKeyRef.current]?.tick((ts - startTime) / 1000);
      rafId = requestAnimationFrame(tick);
    }

    // ── expression switcher ───────────────────────────────────────────────
    function switchTo(key: string) {
      if (!(key in EXPRS)) return;
      currentKeyRef.current = key;
      currentExprRef.current = key; // expose to click handler outside the effect
      startTime = null;
      if (blinkTimer) clearTimeout(blinkTimer);
      isBlinkingRef.current = false;

      const ex = EXPRS[key];
      if (mledRef.current)
        mledRef.current.className = "nutbot-v2-mled" + (ex.led ? ` ${ex.led}` : "");
      if (bled3Ref.current)
        bled3Ref.current.className = "nutbot-v2-bled" + (ex.ledB3 ? ` ${ex.ledB3}` : "");
      if (screenRef.current)
        screenRef.current.className = "nutbot-v2-screen" + (ex.screen ? ` ${ex.screen}` : "");
      if (bodyRef.current)
        bodyRef.current.className = "nutbot-v2-body" + (ex.anim ? ` ${ex.anim}` : "");

      ex.onEnter?.();
      if (ex.blink) scheduleBlink();
    }

    switchToRef.current = switchTo;
    switchTo("idle");
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      if (blinkTimer) clearTimeout(blinkTimer);
    };
  }, []); // intentionally empty — everything lives in refs

  return (
    <div
      ref={bodyRef}
      className="nutbot-v2-body"
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      role="button"
      tabIndex={0}
      aria-label="NutBot"
      style={{ cursor: "pointer" }}
    >
      <div className="nutbot-v2-monitor">
        <div className="nutbot-v2-ear ear-l" />
        <div className="nutbot-v2-ear ear-r" />

        <div ref={screenRef} className="nutbot-v2-screen">
          <svg viewBox="0 0 160 122" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
            <defs>
              <filter id={GC} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.6" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id={GW} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.8" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id={GR} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <pattern id={SL} x="0" y="0" width="160" height="3" patternUnits="userSpaceOnUse">
                <rect width="160" height="1" fill="white" opacity=".024"/>
              </pattern>
            </defs>

            <rect ref={elRef} rx="4.5" ry="4.5" filter={`url(#${GC})`} />
            <rect ref={erRef} rx="4.5" ry="4.5" filter={`url(#${GC})`} />
            <g ref={seRef} />
            <g ref={bwRef} />
            <g ref={moRef} />
            <g ref={fxRef} />

            <rect width="160" height="122" fill={`url(#${SL})`} pointerEvents="none" />
            <ellipse cx="133" cy="18" rx="20" ry="9" fill="white" opacity=".03"
              transform="rotate(-22 133 18)" pointerEvents="none" />
          </svg>
        </div>

        <div className="nutbot-v2-mfoot">
          <div className="nutbot-v2-vents">
            <div className="nutbot-v2-vent" /><div className="nutbot-v2-vent" />
            <div className="nutbot-v2-vent" /><div className="nutbot-v2-vent" />
          </div>
          <div className="nutbot-v2-model-tag">NUT-B0T</div>
          <div ref={mledRef} className="nutbot-v2-mled" />
        </div>
      </div>

      {!compact && (
        <>
          <div className="nutbot-v2-neck" />
          <div className="nutbot-v2-base">
            <div className="nutbot-v2-drive">
              <div className="nutbot-v2-drive-slot" />
              <div className="nutbot-v2-drive-label" />
            </div>
            <div className="nutbot-v2-bleds">
              <div className="nutbot-v2-bled c" />
              <div className="nutbot-v2-bled o" />
              <div ref={bled3Ref} className="nutbot-v2-bled" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
