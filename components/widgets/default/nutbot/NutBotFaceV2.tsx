"use client";
import "./NutBotFaceV2.css";

// NutBot v2.6 — the animated SVG robot face.
//
// What changed from v2.4:
//   • Palette-aware. The eye/mouth colours used to be hardcoded reef-cyan and
//     ember-orange, so NutBot stayed the same colour in all eight theme packs.
//     They are now read from --accent-cyan / --accent-orange (with --nb-error
//     and --nb-love as optional overrides) and re-read when the palette or
//     theme attribute changes.
//   • Expressions morph instead of popping. switchTo() snapshots the eye
//     geometry and setBar() interpolates out of it for MORPH_MS, while the
//     overlay layer (brows/mouth/fx) fades back in — a soft channel-change
//     rather than an instant innerHTML swap.
//   • Half the expression set is reachable for the first time. sleepy, bored,
//     nervous, annoyed, surprised and love were all fully animated and dead
//     code; lib/nutbotMood.ts now drives them from idle time, time of day and
//     machine load, and pokes escalate into them too.
//   • A real speaking expression, driven by the streaming token rate through
//     lib/nutbotSense.ts, instead of mapping "speaking" onto a static smile.
//   • Gaze follows the pointer and one-shot glance targets, not just a
//     hover-expanded widget.
//   • Idle micro-life: double blinks, ear twitches, occasional flourishes,
//     breathing that speeds up with machine load.
//   • The RAF loop stops when the face is off-screen or the tab is hidden, and
//     honours prefers-reduced-motion.

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import {
  getSignal, getServerSignal, subscribeSignal,
  type Signal,
} from "@/lib/nutbotSignal";
import { getHoeActive } from "@/lib/hoeSignal";
import {
  getGlance, getLoad, getPointer, getSpeechEnergy, glanceAtElement, startPointerTracking,
} from "@/lib/nutbotSense";
import { reportInteraction, startMoodDriver } from "@/lib/nutbotMood";

/** a scripted reaction: expression key + how long to hold it */
type Step = { key: string; ms: number };

function signalToExpression(s: Signal): string {
  switch (s?.type) {
    case "widget_created": return "excited";
    case "thinking":       return "thinking";
    case "error":          return "error";
    case "working":        return "focused";
    case "speaking":       return "speaking";
    case "browsing":       return "focused";
    case "boot_complete":  return "excited";
    case "surprise":       return "surprised";
    case "delight":        return "love";
    case "irritated":      return "annoyed";
    case "sleepy":         return "sleepy";
    case "bored":          return "bored";
    case "strained":       return "nervous";
    default:               return "idle";
  }
}

/** Signals worth reacting to over time rather than holding one frozen face.
    The last step hands back to whatever the signal maps to (or idle). */
function signalToSequence(s: Signal): Step[] | null {
  switch (s?.type) {
    case "widget_created": return [{ key: "surprised", ms: 420 }, { key: "excited", ms: 1500 }, { key: "happy", ms: 1200 }];
    case "boot_complete":  return [{ key: "surprised", ms: 520 }, { key: "excited", ms: 1600 }];
    case "delight":        return [{ key: "surprised", ms: 260 }, { key: "love", ms: 2100 }];
    default:               return null;
  }
}

interface Props {
  /** Omit neck + base — used at S size to save vertical space */
  compact?: boolean;
  /** poll /api/system-stats for load-driven moods. Off in the wallpaper
      mascot build, which has no server behind it. */
  telemetry?: boolean;
}

export function NutBotFaceV2({ compact = false, telemetry = true }: Props) {
  // SVG element refs — mutated imperatively by the animation loop
  const elRef    = useRef<SVGRectElement>(null);
  const erRef    = useRef<SVGRectElement>(null);
  const seRef    = useRef<SVGGElement>(null);
  const bwRef    = useRef<SVGGElement>(null);
  const moRef    = useRef<SVGGElement>(null);
  const fxRef    = useRef<SVGGElement>(null);
  const ovRef    = useRef<SVGGElement>(null);
  // Host DOM refs for expression side-effects
  const screenRef = useRef<HTMLDivElement>(null);
  const bodyRef   = useRef<HTMLDivElement>(null);
  const mledRef   = useRef<HTMLDivElement>(null);
  const bled3Ref  = useRef<HTMLDivElement>(null);
  const earLRef   = useRef<HTMLDivElement>(null);
  const earRRef   = useRef<HTMLDivElement>(null);

  // Shared with the signal-mapping effect and click handler
  const switchToRef     = useRef<((key: string) => void) | null>(null);
  const playSequenceRef = useRef<((steps: Step[]) => void) | null>(null);
  const stopSequenceRef = useRef<(() => void) | null>(null);
  const twitchRef       = useRef<(() => void) | null>(null);
  const isBlinkingRef   = useRef(false);
  const clickTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  // poke escalation state — poke him repeatedly and he gets annoyed; be gentle
  // and every so often he's delighted instead
  const pokeCountRef    = useRef(0);
  const pokeStreakRef   = useRef(0);
  const lastPokeRef     = useRef(0);

  // Unique SVG filter/pattern IDs per instance (prevents conflicts if widget is duplicated)
  const uid  = useId().replace(/[^a-zA-Z0-9]/g, "");
  const GC   = `${uid}gc`;
  const GW   = `${uid}gw`;
  const GR   = `${uid}gr`;
  const SL   = `${uid}sl`;

  const signal    = useSyncExternalStore(subscribeSignal, getSignal, getServerSignal);
  const signalRef = useRef(signal);
  useEffect(() => {
    signalRef.current = signal;
  }, [signal]);

  // Ambient mood + pointer tracking live as long as a face is on screen. Both
  // are refcounted, so a second NutBot doesn't double up the timers.
  useEffect(() => {
    const stopPointer = startPointerTracking();
    const stopMood = startMoodDriver({ telemetry });
    return () => { stopPointer(); stopMood(); };
  }, [telemetry]);

  // Map incoming signal → expression (or scripted reaction); cancel any active
  // click override first
  useEffect(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      bodyRef.current?.classList.remove("boop");
    }
    // look at the widget that just appeared, then react to it
    if (signal?.type === "widget_created") glanceAtElement(signal.id, 2600);

    const steps = signalToSequence(signal);
    if (steps) playSequenceRef.current?.(steps);
    else {
      stopSequenceRef.current?.();
      switchToRef.current?.(signalToExpression(signal));
    }
  }, [signal]);

  // Click: close eyes, :3 face, quick boop squish, snap back after 280ms.
  // Three pokes inside the streak window and he gets annoyed instead; every
  // sixth poke overall earns a heart-eyed thank-you.
  function handleClick() {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    reportInteraction();

    const now = performance.now();
    pokeStreakRef.current = now - lastPokeRef.current < 1600 ? pokeStreakRef.current + 1 : 1;
    lastPokeRef.current = now;
    pokeCountRef.current += 1;
    twitchRef.current?.();

    const streak = pokeStreakRef.current;
    const key = streak >= 3 ? "annoyed" : pokeCountRef.current % 6 === 0 ? "love" : "poked";
    const hold = key === "poked" ? 280 : 1200;

    stopSequenceRef.current?.();
    switchToRef.current?.(key);
    // add boop class AFTER switchTo so it isn't overwritten by the anim field
    bodyRef.current?.classList.add("boop");
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      bodyRef.current?.classList.remove("boop");
      switchToRef.current?.(signalToExpression(signalRef.current));
    }, hold);
  }

  // Animation engine — runs once on mount, all logic lives inside the closure
  useEffect(() => {
    const EL = elRef.current!;
    const ER = erRef.current!;
    const SE = seRef.current!;
    const BW = bwRef.current!;
    const MO = moRef.current!;
    const FX = fxRef.current!;
    const OV = ovRef.current!;
    const BODY = bodyRef.current!;
    const SCREEN = screenRef.current!;

    // ── palette ───────────────────────────────────────────────────────────
    // read from CSS custom properties so NutBot wears the active theme pack,
    // and re-read whenever <html data-theme|data-palette> changes
    let C = "#00b4c8", O = "#ff6b2b", R = "#ff4040", P = "#ff6b8a";

    function readPalette() {
      const cs = getComputedStyle(document.documentElement);
      const pick = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
      C = pick("--accent-cyan", "#00b4c8");
      O = pick("--accent-orange", "#ff6b2b");
      R = pick("--nb-error", "#ff4040");
      P = pick("--nb-love", "#ff6b8a");
    }
    readPalette();

    const paletteObserver = new MutationObserver(() => {
      readPalette();
      // colours baked into an expression's onEnter markup only refresh on
      // re-entry, so re-enter the current one
      EXPRS[currentKeyRef.current]?.onEnter?.();
    });
    paletteObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette"],
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reducedMotion.matches;
    const onReducedChange = () => {
      reduced = reducedMotion.matches;
      BODY.classList.toggle("reduced", reduced);
    };
    onReducedChange();
    reducedMotion.addEventListener("change", onReducedChange);

    const LX = 52, RX = 108, EY = 52, EW = 14, EH = 28;

    // ── expression morphing ───────────────────────────────────────────────
    // switchTo() snapshots where the eyes are, and setBar() eases out of that
    // snapshot into whatever the new expression asks for, so the face never
    // jump-cuts between states.
    const MORPH_MS = 200;
    type Geom = { cx: number; cy: number; w: number; h: number };
    const shown = new Map<SVGRectElement, Geom>();
    let morphFrom: Map<SVGRectElement, Geom> | null = null;
    let morphStart = 0;

    // ── primitives ──────────────────────────────────────────────────────
    function setBar(
      el: SVGRectElement, cx: number, cy: number,
      w: number, h: number, color = C, rx = 4.5,
    ) {
      let g: Geom = { cx, cy, w, h };
      if (morphFrom) {
        const k = (performance.now() - morphStart) / MORPH_MS;
        const from = morphFrom.get(el);
        if (k >= 1) morphFrom = null;
        else if (from) {
          const e = easeOut(Math.max(0, k));
          g = {
            cx: lerp(from.cx, cx, e), cy: lerp(from.cy, cy, e),
            w:  lerp(from.w,  w,  e), h:  lerp(from.h,  h,  e),
          };
        }
      }
      shown.set(el, g);
      el.setAttribute("x",      (g.cx - g.w / 2).toFixed(2));
      el.setAttribute("y",      (g.cy - g.h / 2).toFixed(2));
      el.setAttribute("width",  Math.max(0, g.w).toFixed(2));
      el.setAttribute("height", Math.max(0.5, g.h).toFixed(2));
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
    /** jitter amplitude — zeroed under prefers-reduced-motion */
    const jit = (v: number) => (reduced ? 0 : v);

    // ── SVG fragment builders ────────────────────────────────────────────
    function arcEye(cx: number, cy: number, fill = C) {
      const w = 17, outer = 15, inner = 4;
      return `<path d="M${cx-w} ${cy} Q${cx} ${cy-outer} ${cx+w} ${cy} Q${cx} ${cy-inner} ${cx-w} ${cy}Z"
        fill="${fill}" filter="url(#${GC})"/>`;
    }

    function heartEye(cx: number, cy: number, s = 0.85, fill = P, glow = true) {
      const p = (dx: number, dy: number) => `${cx + dx * s} ${cy + dy * s}`;
      return `<path d="M${p(0,-8)} C${p(0,-8)} ${p(-5,-15)} ${p(-10,-10)}
        C${p(-15,-5)} ${p(-15,0)} ${p(-9,6)} L${p(0,14)} L${p(9,6)}
        C${p(15,0)} ${p(15,-5)} ${p(10,-10)} C${p(5,-15)} ${p(0,-8)} ${p(0,-8)}Z"
        fill="${fill}"${glow ? ` filter="url(#${GW})"` : ""}/>`;
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

    /** a determinate progress rail for the working signal (0..1) */
    function progressRail(p: number, fill = C) {
      const w = 140 * clamp(p, 0, 1);
      return `
        <rect x="10" y="114" width="140" height="4" rx="2" fill="${fill}" opacity=".14"/>
        <rect x="10" y="114" width="${w.toFixed(1)}" height="4" rx="2" fill="${fill}" opacity=".85"
          filter="url(#${GC})"/>`;
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

    /** Where NutBot should be looking, in viewport coords: a one-shot glance
        wins, then a hover-expanded widget, then the pointer if it moved
        recently. Null = nothing to look at, fall back to the idle sweep. */
    function gazeTarget(): { x: number; y: number } | null {
      const glance = getGlance();
      if (glance) return glance;
      const hoe = getHoeActive();
      if (hoe) return { x: hoe.centerX, y: hoe.centerY };
      const pointer = getPointer();
      if (pointer.inside && performance.now() - pointer.movedAt < 2500) {
        return { x: pointer.x, y: pointer.y };
      }
      return null;
    }

    // ── expressions ─────────────────────────────────────────────────────
    interface Expr {
      led?: string; screen?: string; anim?: string; ledB3?: string; blink?: boolean;
      onEnter(): void;
      tick(t: number): void;
    }

    // smooth gaze state for idle tracking — persists across frames
    let gazeX = 0;
    let gazeY = 0;

    const EXPRS: Record<string, Expr> = {

      idle: {
        led: "", screen: "", anim: "", blink: true,
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const target = gazeTarget();
          let targetX = lookCycle(t);
          let targetY = 0;

          if (target) {
            const nb = BODY.getBoundingClientRect();
            const dx = target.x - (nb.left + nb.width / 2);
            const dy = target.y - (nb.top + nb.height / 2);
            const dist = Math.hypot(dx, dy) || 1;
            targetX = clamp((dx / dist) * 20, -20, 20);
            targetY = clamp((dy / dist) * 10, -10, 10);
          }

          // smooth lerp so the eyes glide rather than snap
          gazeX += (targetX - gazeX) * 0.15;
          gazeY += (targetY - gazeY) * 0.15;

          // breathing widens a hair with machine load, matching the body float
          const breath = 34 + Math.sin(t * (1.1 + getLoad() * 0.9)) * 0.7;
          setBar(EL, LX + gazeX, EY + gazeY, 18, breath);
          setBar(ER, RX + gazeX, EY + gazeY, 18, breath);
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

      // NutBot talking: the mouth is driven by how fast tokens are actually
      // arriving (lib/nutbotSense.ts), so a long reply reads as speech instead
      // of one frozen smile, and a pause between chunks closes his mouth.
      speaking: {
        led: "", screen: "gc", anim: "talk", blink: true,
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const energy = getSpeechEnergy();
          const h = 26 - energy * 6 + Math.sin(t * 2.1) * 0.8;
          const sway = Math.sin(t * 1.3) * 2;
          setBar(EL, LX + sway, EY - 2, EW, h);
          setBar(ER, RX + sway, EY - 2, EW, h);

          const open = 2.5 + energy * 15;
          const w = 27 - energy * 5;
          MO.innerHTML = `
            <rect x="${80 - w / 2}" y="${93 - open / 2}" width="${w}" height="${open}"
              rx="${Math.min(6, open / 2).toFixed(2)}" fill="${C}" opacity=".92" filter="url(#${GC})"/>`;

          // a small level meter under the mouth — quiet when he pauses
          let bars = "";
          for (let i = 0; i < 5; i++) {
            const bh = 1.5 + Math.abs(Math.sin(t * 7 + i)) * energy * 7;
            bars += `<rect x="${64 + i * 8}" y="${108 - bh}" width="4" height="${bh.toFixed(2)}"
              rx="1.5" fill="${C}" opacity="${(0.22 + energy * 0.5).toFixed(2)}"/>`;
          }
          FX.innerHTML = bars;
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
          const h = 18 + jit(Math.sin(t * 6) * 0.8);
          setBar(EL, LX + dx, EY, EW, h);
          setBar(ER, RX + dx, EY, EW, h);
          const bx = dx * 0.25;
          BW.innerHTML = `
            <line x1="${34+bx}" y1="32" x2="${58+bx}" y2="39"
              stroke="${C}" stroke-width="2.8" stroke-linecap="round" opacity=".72"/>
            <line x1="${102+bx}" y1="39" x2="${126+bx}" y2="32"
              stroke="${C}" stroke-width="2.8" stroke-linecap="round" opacity=".72"/>`;
          MO.innerHTML = smile(95, 16, false);
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
          // sparks shooting off the corners of the screen
          let sparks = "";
          for (let i = 0; i < 4; i++) {
            const k = ((t * 1.6 + i * 0.25) % 1);
            const x = i % 2 === 0 ? 20 - k * 12 : 140 + k * 12;
            const y = 32 - k * 20;
            sparks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.4 * (1 - k)).toFixed(2)}"
              fill="${O}" opacity="${(0.6 * (1 - k)).toFixed(2)}"/>`;
          }
          BW.innerHTML = sparks;
        },
      },

      sleepy: {
        led: "off", screen: "", anim: "doze",
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
          // a quick shock ring on entry
          if (entry < 1) {
            const r = 18 + entry * 34;
            FX.innerHTML = `<circle cx="80" cy="56" r="${r.toFixed(1)}" fill="none"
              stroke="${C}" stroke-width="${(2.4 * (1 - entry)).toFixed(2)}" opacity="${(0.5 * (1 - entry)).toFixed(2)}"/>`;
          } else if (FX.innerHTML) FX.innerHTML = "";
        },
      },

      thinking: {
        led: "", screen: "", anim: "tilt", blink: true,
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
        led: "", screen: "gc", anim: "", blink: true,
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

          // determinate jobs get a real rail instead of an open-ended loop
          const sig = signalRef.current;
          FX.innerHTML = sig?.type === "working" && sig.progress !== undefined
            ? progressRail(sig.progress)
            : "";
        },
      },

      error: {
        led: "red", screen: "gr", anim: "shake", ledB3: "r",
        onEnter() { clearAll(); hideBars(); },
        tick() {
          const flicker = Math.random() > 0.12 ? 1 : 0;
          const jx = jit((Math.random() - 0.5) * 7);
          const jy = jit((Math.random() - 0.5) * 4);
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
          // little hearts drifting up off the screen
          let drift = "";
          for (let i = 0; i < 3; i++) {
            const k = ((t * 0.55 + i * 0.33) % 1);
            drift += heartEye(24 + i * 56, 118 - k * 26, 0.22 * (1 - k * 0.5), P, false);
          }
          BW.innerHTML = drift;
        },
      },

      nervous: {
        led: "amber", screen: "", anim: "",
        onEnter() { clearAll(); showBars(); },
        tick(t) {
          const dx = jit(Math.sin(t * 13.7) * 7 + Math.sin(t * 8.3) * 4);
          const dy = jit(Math.sin(t * 11.1) * 3 + Math.sin(t * 6.7) * 2);
          setBar(EL, LX + dx, EY + dy, EW, EH);
          setBar(ER, RX + dx, EY + dy, EW, EH);
          const drip = (t % 2.5) / 2.5;
          FX.innerHTML = `
            <ellipse cx="143" cy="${27+drip*10}" rx="4" ry="${5+drip*2}"
              fill="${C}" opacity="${clamp(.7-drip*.4,0,1)}" filter="url(#${GC})"/>
            <path d="M139 ${27+drip*10} Q143 ${17+drip*8} 147 ${27+drip*10}"
              fill="${C}" opacity="${clamp(.7-drip*.4,0,1)}" filter="url(#${GC})"/>`;
          // a load meter — this is the machine-under-strain face, so say so
          const load = getLoad();
          MO.innerHTML = smile(96, 15, false)
            + `<text x="8" y="118" font-size="6.5" font-family="monospace" fill="${O}" opacity=".75">
                 load ${(load * 100).toFixed(0)}%</text>`
            + progressRail(load, O);
        },
      },

      bored: {
        led: "off", screen: "", anim: "", blink: true,
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
        tick(t) {
          setBar(EL, LX, EY, EW + 2, 3);
          setBar(ER, RX, EY, EW + 2, 3);
          MO.innerHTML = `
            <path d="M61 91 Q70 100 80 91 Q90 100 99 91"
              fill="none" stroke="${C}" stroke-width="3.2" stroke-linecap="round"
              stroke-linejoin="round" filter="url(#${GC})"/>`;
          // impact burst — rings out from the middle over the first ~300ms
          const k = Math.min(t / 0.3, 1);
          if (k < 1) {
            let burst = "";
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2;
              const d = 14 + k * 30;
              burst += `<circle cx="${(80 + Math.cos(a) * d).toFixed(1)}" cy="${(56 + Math.sin(a) * d * 0.7).toFixed(1)}"
                r="${(2.6 * (1 - k)).toFixed(2)}" fill="${C}" opacity="${(0.7 * (1 - k)).toFixed(2)}"/>`;
            }
            FX.innerHTML = burst;
          } else if (FX.innerHTML) FX.innerHTML = "";
        },
      },
    };

    // ── blink system ─────────────────────────────────────────────────────
    // Blinks now run in every bar-based expression (not just idle) and are
    // sometimes doubles, which is most of what stops a loop reading as a loop.
    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    let blinkHold: ReturnType<typeof setTimeout> | null = null;
    const currentKeyRef = { current: "idle" };

    function doBlink(times: number) {
      if (!EXPRS[currentKeyRef.current]?.blink) return;
      isBlinkingRef.current = true;
      const geom = shown.get(EL);
      const cy = geom?.cy ?? EY;
      const cx = geom?.cx ?? LX;
      setBar(EL, cx, cy, 18, 5);
      setBar(ER, cx - LX + RX, cy, 18, 5);
      blinkHold = setTimeout(() => {
        isBlinkingRef.current = false;
        if (times > 1) blinkHold = setTimeout(() => doBlink(times - 1), 90);
        else scheduleBlink();
      }, 105);
    }

    function scheduleBlink() {
      if (blinkTimer) clearTimeout(blinkTimer);
      blinkTimer = setTimeout(() => {
        if (!EXPRS[currentKeyRef.current]?.blink) return;
        doBlink(Math.random() < 0.25 ? 2 : 1);
      }, 2000 + Math.random() * 3500);
    }

    // ── ear twitch ────────────────────────────────────────────────────────
    let twitchTimer: ReturnType<typeof setTimeout> | null = null;
    function twitch() {
      if (reduced) return;
      const ear = Math.random() < 0.5 ? earLRef.current : earRRef.current;
      if (!ear) return;
      ear.classList.remove("twitch");
      // restart the animation — reading offsetWidth forces the reflow
      void ear.offsetWidth;
      ear.classList.add("twitch");
    }
    twitchRef.current = twitch;

    function scheduleTwitch() {
      if (twitchTimer) clearTimeout(twitchTimer);
      twitchTimer = setTimeout(() => {
        twitch();
        scheduleTwitch();
      }, 9000 + Math.random() * 16000);
    }

    // ── scripted reactions ────────────────────────────────────────────────
    let sequence: Step[] | null = null;
    let seqIdx = 0;
    let seqNextAt = 0;

    function playSequence(steps: Step[]) {
      if (steps.length === 0) return;
      sequence = steps;
      seqIdx = 0;
      seqNextAt = performance.now() + steps[0].ms;
      switchTo(steps[0].key);
    }
    function stopSequence() { sequence = null; }

    function advanceSequence(now: number) {
      if (!sequence || now < seqNextAt) return;
      seqIdx += 1;
      if (seqIdx >= sequence.length) {
        sequence = null;
        switchTo(signalToExpression(signalRef.current));
        return;
      }
      const step = sequence[seqIdx];
      seqNextAt = now + step.ms;
      switchTo(step.key);
    }

    // ── idle micro-life ───────────────────────────────────────────────────
    // Every 25-50s of undisturbed idling NutBot does something small and
    // unprompted, so the ambient loop never feels like a loop.
    let nextFlourishAt = performance.now() + 25_000 + Math.random() * 25_000;

    function maybeFlourish(now: number) {
      if (now < nextFlourishAt) return;
      nextFlourishAt = now + 25_000 + Math.random() * 25_000;
      if (sequence || currentKeyRef.current !== "idle" || reduced) return;
      const roll = Math.random();
      if (roll < 0.5) doBlink(2);
      else if (roll < 0.8) playSequence([{ key: "happy", ms: 760 }]);
      else twitch();
    }

    // ── animation loop ────────────────────────────────────────────────────
    let startTime: number | null = null;
    let rafId = 0;
    let running = false;
    let lastLoadWrite = 0;

    function tick(ts: number) {
      const now = performance.now();
      advanceSequence(now);
      maybeFlourish(now);

      if (!startTime) startTime = ts;
      const ex = EXPRS[currentKeyRef.current];
      // while blinking, hold the blink frame rather than letting the
      // expression redraw the eyes over it
      if (!isBlinkingRef.current) ex?.tick((ts - startTime) / 1000);

      // overlay (brows/mouth/fx) fades back in after an expression swap
      if (morphStart) {
        const k = clamp((now - morphStart) / MORPH_MS, 0, 1);
        OV.setAttribute("opacity", (0.25 + 0.75 * easeOut(k)).toFixed(3));
        if (k >= 1) morphStart = 0;
      }

      // machine load drives the breathing rate (cheap, so only ~2x a second)
      if (now - lastLoadWrite > 500) {
        lastLoadWrite = now;
        const dur = (3.2 - getLoad() * 1.3).toFixed(2);
        BODY.style.setProperty("--nb-float-dur", `${dur}s`);
        BODY.style.setProperty("--nb-load", getLoad().toFixed(2));
      }

      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      startTime = null;
      scheduleBlink();
      scheduleTwitch();
      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      if (blinkTimer) clearTimeout(blinkTimer);
      if (blinkHold) clearTimeout(blinkHold);
      if (twitchTimer) clearTimeout(twitchTimer);
      blinkTimer = blinkHold = twitchTimer = null;
      isBlinkingRef.current = false;
    }

    // ── expression switcher ───────────────────────────────────────────────
    function switchTo(key: string) {
      if (!(key in EXPRS)) return;
      if (key === currentKeyRef.current && morphStart !== 0) return;

      // snapshot where the eyes are so setBar() can ease out of it
      morphFrom = new Map(shown);
      morphStart = performance.now();

      currentKeyRef.current = key;
      startTime = null;
      if (blinkTimer) clearTimeout(blinkTimer);
      if (blinkHold) clearTimeout(blinkHold);
      isBlinkingRef.current = false;

      const ex = EXPRS[key];
      if (mledRef.current)
        mledRef.current.className = "nutbot-v2-mled" + (ex.led ? ` ${ex.led}` : "");
      if (bled3Ref.current)
        bled3Ref.current.className = "nutbot-v2-bled" + (ex.ledB3 ? ` ${ex.ledB3}` : "");
      if (screenRef.current) {
        screenRef.current.className = "nutbot-v2-screen" + (ex.screen ? ` ${ex.screen}` : "");
        // brief brightness kick — reads as the screen changing channel
        SCREEN.classList.remove("swap");
        void SCREEN.offsetWidth;
        SCREEN.classList.add("swap");
      }
      if (bodyRef.current)
        bodyRef.current.className = "nutbot-v2-body" + (ex.anim ? ` ${ex.anim}` : "") + (reduced ? " reduced" : "");

      ex.onEnter?.();
      if (ex.blink) scheduleBlink();
    }

    switchToRef.current = switchTo;
    playSequenceRef.current = playSequence;
    stopSequenceRef.current = stopSequence;
    switchTo("idle");

    // ── run only while actually visible ───────────────────────────────────
    // A dashboard left open on another tab (or scrolled past this widget) used
    // to keep a 60fps RAF loop and a pile of innerHTML writes going forever.
    let onScreen = true;
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    }, { threshold: 0.01 });
    observer.observe(BODY);

    function sync() {
      if (onScreen && document.visibilityState === "visible") start();
      else stop();
    }
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      stop();
      observer.disconnect();
      paletteObserver.disconnect();
      reducedMotion.removeEventListener("change", onReducedChange);
      document.removeEventListener("visibilitychange", sync);
      switchToRef.current = null;
      playSequenceRef.current = null;
      stopSequenceRef.current = null;
      twitchRef.current = null;
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
        <div ref={earLRef} className="nutbot-v2-ear ear-l" />
        <div ref={earRRef} className="nutbot-v2-ear ear-r" />

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

            {/* the eye bars morph between expressions, so they sit outside the
                overlay group that cross-fades on a swap */}
            <rect ref={elRef} rx="4.5" ry="4.5" filter={`url(#${GC})`} />
            <rect ref={erRef} rx="4.5" ry="4.5" filter={`url(#${GC})`} />
            <g ref={ovRef}>
              <g ref={seRef} />
              <g ref={bwRef} />
              <g ref={moRef} />
              <g ref={fxRef} />
            </g>

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
