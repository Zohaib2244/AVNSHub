// "auto" palette — a theme pack derived from the active canvas's wallpaper.
//
// The static packs (config/themes.ts) are hand-tuned CSS blocks; this one is
// generated: sample the wallpaper (an image, or one frame of a video) on a
// small canvas, read it in OKLCH, and pick
//   - the ambient hue/chroma (mean of every pixel) → tints the surfaces
//   - the two strongest distinct hue families → the primary / secondary
//     accent slots (--accent-orange / --accent-cyan are slot names, not hues)
// then build the full 14-token set for both dark and light the same way the
// hand-made packs are built: text roles are *solved* against --bg-card to
// the house contrast targets (primary ≥ 12:1, --text-muted 8.0:1,
// --text-muted-dim 4.7:1) and the accents to ≥ 4.5:1, so any wallpaper — a
// neon cityscape or a grey photo — yields a palette that passes the same
// rules as ember.
//
// The result is injected as a <style id="nutmag-wallpaper-palette"> scoped to
// :root[data-palette="wallpaper"], and cached per canvas in localStorage
// (keyed by the wallpaper's version stamp) so app/layout.tsx's pre-paint
// script can inject it before first paint — no flash of ember on reload.
// Tokens are derived locally on every device (deterministic from the file),
// so only the "wallpaper" palette choice itself syncs through the server.

import { canvasScopedKey, getActiveCanvasId } from "@/lib/canvases";
import { getWallpaperKind, getWallpaperUrl, getWallpaperVersion } from "@/lib/wallpaper";

const CACHE_KEY = "nutmag-wallpaper-palette";
const STYLE_ID = "nutmag-wallpaper-palette";
const SAMPLE_PX = 48;

export type WallpaperPaletteSwatch = [string, string, string];
type Cached = { version: number; css: string; swatch: WallpaperPaletteSwatch };

const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<Cached | null>>();

// ─── colour math (OKLab / OKLCH ↔ sRGB, WCAG contrast) ──────────────────────

type Lab = { L: number; a: number; b: number };

function toLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function linearToOklab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinear({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut(rgb: [number, number, number]) {
  return rgb.every((c) => c >= -0.0005 && c <= 1.0005);
}

/** OKLCH → linear sRGB, pulling chroma in (hue and lightness kept) until it
    fits the sRGB gamut */
function lchToLinear(L: number, C: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const at = (c: number) => oklabToLinear({ L, a: c * Math.cos(rad), b: c * Math.sin(rad) });
  let rgb = at(C);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(at(mid))) lo = mid;
      else hi = mid;
    }
    rgb = at(lo);
  }
  return rgb.map((c) => Math.min(1, Math.max(0, c))) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(x: [number, number, number], y: [number, number, number]) {
  const a = luminance(x);
  const b = luminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function hex(rgb: [number, number, number]) {
  return `#${rgb
    .map((c) => Math.round(fromLinear(c) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** lightness for hue/chroma that lands on `target` contrast against `bg`,
    on the side away from the background (lighter on dark, darker on light).
    Contrast is monotonic in L on that side, so a bisection finds the L
    closest to the background that still meets the target. */
function solveL(C: number, h: number, bg: [number, number, number], target: number, lighter: boolean) {
  // search only the far side of the background's own lightness
  let near = linearToOklab(...bg).L;
  let far = lighter ? 1 : 0;
  if (contrast(lchToLinear(far, C, h), bg) < target) return far;
  for (let i = 0; i < 24; i++) {
    const mid = (near + far) / 2;
    if (contrast(lchToLinear(mid, C, h), bg) >= target) far = mid;
    else near = mid;
  }
  return far;
}

// ─── sampling ────────────────────────────────────────────────────────────────

async function loadPixels(url: string, kind: "image" | "video"): Promise<Uint8ClampedArray | null> {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_PX;
  canvas.height = SAMPLE_PX;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  if (kind === "image") {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    ctx.drawImage(img, 0, 0, SAMPLE_PX, SAMPLE_PX);
  } else {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("video load failed")), { once: true });
    });
    // a frame a little way in — the very first one is often a fade from black
    const at = Number.isFinite(video.duration) ? Math.min(1, video.duration / 3) : 0;
    if (at > 0) {
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.currentTime = at;
      });
    }
    ctx.drawImage(video, 0, 0, SAMPLE_PX, SAMPLE_PX);
    video.removeAttribute("src");
    video.load();
  }
  return ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data;
}

type Analysis = { ambientC: number; ambientH: number; primary: { h: number; c: number }; secondary: { h: number; c: number } };

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function analyse(data: Uint8ClampedArray): Analysis {
  const BINS = 24;
  const bins = Array.from({ length: BINS }, () => ({ score: 0, a: 0, b: 0, c: 0, n: 0 }));
  let sumA = 0;
  let sumB = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const lab = linearToOklab(toLinear(data[i] / 255), toLinear(data[i + 1] / 255), toLinear(data[i + 2] / 255));
    sumA += lab.a;
    sumB += lab.b;
    count++;
    const C = Math.hypot(lab.a, lab.b);
    if (C < 0.04) continue;
    // mid-tones carry an image's colour; near-black and blown highlights
    // are mostly noise
    const tone = lab.L > 0.25 && lab.L < 0.92 ? 1 : 0.3;
    const h = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
    const bin = bins[Math.floor(h / (360 / BINS)) % BINS];
    const w = C * C * tone;
    bin.score += w;
    bin.a += lab.a * w;
    bin.b += lab.b * w;
    bin.c += C;
    bin.n++;
  }

  const meanA = count ? sumA / count : 0;
  const meanB = count ? sumB / count : 0;
  const ambientC = Math.hypot(meanA, meanB);
  const ambientH = ((Math.atan2(meanB, meanA) * 180) / Math.PI + 360) % 360;

  // merge each bin with its neighbours so one hue family split across a bin
  // edge isn't beaten by a smaller family sitting squarely in one bin
  const families = bins.map((_, i) => {
    const group = [bins[(i + BINS - 1) % BINS], bins[i], bins[(i + 1) % BINS]];
    const score = group.reduce((s, g) => s + g.score, 0);
    const a = group.reduce((s, g) => s + g.a, 0);
    const b = group.reduce((s, g) => s + g.b, 0);
    const n = group.reduce((s, g) => s + g.n, 0);
    const c = n ? group.reduce((s, g) => s + g.c, 0) / n : 0;
    return { score, h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, c, n };
  });
  const ranked = [...families].filter((f) => f.n > 0).sort((x, y) => y.score - x.score);

  // essentially greyscale wallpaper: warm ember-ish accent on the ambient
  // tint, with a complementary secondary
  const EMBER_H = 45;
  const colourful = ranked.length > 0 && ranked[0].n >= count * 0.02;
  const primary = colourful
    ? { h: ranked[0].h, c: ranked[0].c }
    : { h: ambientC > 0.01 ? ambientH : EMBER_H, c: 0.14 };
  const second = colourful
    ? ranked.find((f) => hueDistance(f.h, primary.h) >= 60 && f.score >= ranked[0].score * 0.12)
    : undefined;
  const secondary = second ? { h: second.h, c: second.c } : { h: (primary.h + 150) % 360, c: primary.c };

  return { ambientC, ambientH, primary, secondary };
}

// ─── token generation ────────────────────────────────────────────────────────

type Tokens = Record<string, string>;

function buildTokens(an: Analysis, mode: "dark" | "light"): Tokens {
  const dark = mode === "dark";
  const h = an.ambientH;
  // surfaces are tinted, never saturated — the sticker look needs quiet cards
  const sc = Math.min(0.035, Math.max(0.006, an.ambientC * 0.8));
  const surface = (L: number, c = sc) => lchToLinear(L, c, h);

  const page = surface(dark ? 0.16 : 0.85);
  const card = surface(dark ? 0.205 : 0.955);
  const nested = surface(dark ? 0.185 : 0.975);
  const border = surface(dark ? 0.34 : 0.52, sc * 1.4);
  const shadow = surface(dark ? 0.08 : 0.72, sc * 1.2);
  const tc = Math.min(sc, 0.02);
  const primaryText = lchToLinear(solveL(tc, h, card, 12, dark), tc, h);
  const muted = lchToLinear(solveL(tc, h, card, 8.0, dark), tc, h);
  const dim = lchToLinear(solveL(tc, h, card, 4.7, dark), tc, h);

  const accent = ({ h: ah, c }: { h: number; c: number }) => {
    const C = Math.min(0.2, Math.max(0.1, c * 1.3));
    // at least 4.5:1 on cards, but no darker/lighter than a typical accent
    const solved = solveL(C, ah, card, 4.5, dark);
    const L = dark ? Math.max(0.7, solved) : Math.min(0.56, solved);
    return lchToLinear(L, C, ah);
  };

  return {
    "--bg-page": hex(page),
    "--bg-card": hex(card),
    "--bg-nested": hex(nested),
    "--border": hex(border),
    "--shadow": hex(shadow),
    "--text-primary": hex(primaryText),
    "--text-muted": hex(muted),
    "--text-muted-dim": hex(dim),
    "--accent-orange": hex(accent(an.primary)),
    "--accent-cyan": hex(accent(an.secondary)),
    "--accent-warm": hex(primaryText),
    "--badge-text": hex(dark ? page : card),
    // status colours are semantic, not decorative — kept from ember
    "--status-up": dark ? "#1c6b30" : "#1a5e28",
    "--status-down": "#c84a12",
  };
}

function toCss(dark: Tokens, light: Tokens) {
  const block = (t: Tokens) =>
    Object.entries(t)
      .map(([k, v]) => `${k}:${v};`)
      .join("");
  return (
    `:root[data-palette="wallpaper"]{${block(dark)}}` +
    `:root[data-palette="wallpaper"][data-theme="light"]{${block(light)}}`
  );
}

// ─── cache + DOM ─────────────────────────────────────────────────────────────

function cacheKey(canvasId: string) {
  return canvasScopedKey(CACHE_KEY, canvasId);
}

function readCache(canvasId: string): Cached | null {
  try {
    const raw = localStorage.getItem(cacheKey(canvasId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    return typeof parsed?.version === "number" && typeof parsed.css === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(canvasId: string, value: Cached | null) {
  try {
    if (value) localStorage.setItem(cacheKey(canvasId), JSON.stringify(value));
    else localStorage.removeItem(cacheKey(canvasId));
  } catch {
    // storage full/blocked — the style still applies this session
  }
}

function injectCss(css: string | null) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

async function extract(canvasId: string, version: number): Promise<Cached | null> {
  const url = getWallpaperUrl(canvasId);
  const kind = getWallpaperKind(canvasId);
  if (!url || !kind) return null;
  const data = await loadPixels(url, kind);
  if (!data) return null;
  const an = analyse(data);
  const dark = buildTokens(an, "dark");
  const light = buildTokens(an, "light");
  return {
    version,
    css: toCss(dark, light),
    swatch: [dark["--bg-card"], dark["--accent-orange"], dark["--accent-cyan"]],
  };
}

/** make the injected auto-palette match `canvasId`'s current wallpaper
    (default: the active canvas): reuse the cached tokens when the wallpaper
    version matches, otherwise sample it again. The `<style>` tag this writes
    is global — it only ever styles `:root`, i.e. whichever canvas is active —
    so a call for a *different*, inactive canvas (CanvasSwitcher warming a
    pill's hover swatch, see lib/canvasAccent.ts) only samples and caches,
    it never touches the DOM. With no wallpaper on the active canvas the
    style is removed, and [data-palette="wallpaper"] then matches no rules —
    the page falls back to the ember tokens rather than showing anything
    broken. */
export function ensureWallpaperPalette(canvasId: string = getActiveCanvasId()) {
  const version = getWallpaperVersion(canvasId);
  if (version === null) {
    if (canvasId === getActiveCanvasId()) injectCss(null);
    return;
  }

  const cached = readCache(canvasId);
  if (cached && cached.version === version) {
    if (canvasId === getActiveCanvasId()) injectCss(cached.css);
    return;
  }

  const key = `${canvasId}:${version}`;
  if (inFlight.has(key)) return;
  const job = extract(canvasId, version)
    .catch((error) => {
      console.warn("[wallpaper palette] could not sample the wallpaper:", error);
      return null;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  void job.then((result) => {
    if (!result) return;
    writeCache(canvasId, result);
    // the user may have switched canvas or replaced the wallpaper meanwhile
    if (getActiveCanvasId() === canvasId && getWallpaperVersion(canvasId) === version) injectCss(result.css);
    listeners.forEach((listener) => listener());
  });
}

/** the derived [card, primary, secondary] for `canvasId` (default: active),
    or null until that canvas's wallpaper has been sampled */
export function getWallpaperPaletteSwatch(canvasId: string = getActiveCanvasId()): WallpaperPaletteSwatch | null {
  const cached = readCache(canvasId);
  return cached && cached.version === getWallpaperVersion(canvasId) ? cached.swatch : null;
}

let swatchSnapshot: WallpaperPaletteSwatch | null = null;
/** stable-identity wrapper for useSyncExternalStore */
export function getWallpaperPaletteSwatchSnapshot(): WallpaperPaletteSwatch | null {
  const next = getWallpaperPaletteSwatch();
  if (next?.join() !== swatchSnapshot?.join()) swatchSnapshot = next;
  return swatchSnapshot;
}

export function getServerWallpaperPaletteSwatch(): null {
  return null;
}

export function subscribeWallpaperPalette(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
