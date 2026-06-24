// Ambient Sound widget's engine + persistence. Three halves:
//
// 1. Synthesis presets (rain/wind/drone/room-tone) — pure Web Audio graphs
//    built on demand, no audio assets shipped or stored. Same idea as
//    DissGladeWidget's oscillator-based song: synthesize instead of needing
//    binary asset files.
// 2. Stream presets (lofi) — a live internet radio stream played through a
//    plain <audio> element, same mechanism as custom tracks below (just a
//    static URL instead of an IndexedDB-backed object URL). Reuses the exact
//    stream ClockWidget's lofi button already plays, since it's a
//    known-working free stream rather than an unverified new one.
// 3. Custom track storage — user-uploaded audio files, stored as raw Blobs in
//    IndexedDB (lib/idb.ts's generic blob store, keyed "ambient:<id>"), with
//    a small {id, name} registry in localStorage. Global, not per-canvas —
//    ambient sound is a personal-mood setting, not tied to a canvas's layout
//    or theme. Mirrors lib/wallpaper.ts's external-store pattern (module
//    cache, listener set) for the registry/selection/volume.

import { idbDelete, idbGet, idbSet } from "@/lib/idb";

export type AmbientPresetId = "rain" | "wind" | "drone" | "room-tone";
export type AmbientStreamId = "lofi";

export const AMBIENT_PRESETS: { id: AmbientPresetId; label: string }[] = [
  { id: "rain", label: "rain" },
  { id: "wind", label: "wind" },
  { id: "drone", label: "drone" },
  { id: "room-tone", label: "room tone" },
];

export const AMBIENT_STREAMS: { id: AmbientStreamId; label: string; url: string }[] = [
  { id: "lofi", label: "lofi radio", url: "https://streams.ilovemusic.de/iloveradio17.mp3" },
];

function isPresetId(id: string): id is AmbientPresetId {
  return AMBIENT_PRESETS.some((p) => p.id === id);
}

function isStreamId(id: string): id is AmbientStreamId {
  return AMBIENT_STREAMS.some((s) => s.id === id);
}

function getStreamUrl(id: AmbientStreamId): string {
  return AMBIENT_STREAMS.find((s) => s.id === id)!.url;
}

export { isPresetId, isStreamId, getStreamUrl };

type PresetNode = { output: AudioNode; stop: () => void };

function createNoiseBuffer(context: AudioContext, kind: "white" | "brown", seconds = 3): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  if (kind === "white") {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  } else {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

function noiseSource(context: AudioContext, kind: "white" | "brown"): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, kind);
  source.loop = true;
  source.start();
  return source;
}

function buildRain(context: AudioContext): PresetNode {
  const source = noiseSource(context, "white");
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 600;
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 3200;
  const gain = context.createGain();
  gain.gain.value = 0.5;

  const lfo = context.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoGain = context.createGain();
  lfoGain.gain.value = 0.15;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  lfo.start();

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(gain);

  return {
    output: gain,
    stop: () => {
      source.stop();
      lfo.stop();
      [source, highpass, lowpass, lfo, lfoGain, gain].forEach((n) => n.disconnect());
    },
  };
}

function buildWind(context: AudioContext): PresetNode {
  const source = noiseSource(context, "white");
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 900;
  const gain = context.createGain();
  gain.gain.value = 0.5;

  const lfo = context.createOscillator();
  lfo.frequency.value = 0.15;
  const lfoGain = context.createGain();
  lfoGain.gain.value = 500;
  lfo.connect(lfoGain);
  lfoGain.connect(lowpass.frequency);
  lfo.start();

  source.connect(lowpass);
  lowpass.connect(gain);

  return {
    output: gain,
    stop: () => {
      source.stop();
      lfo.stop();
      [source, lowpass, lfo, lfoGain, gain].forEach((n) => n.disconnect());
    },
  };
}

function buildDrone(context: AudioContext): PresetNode {
  const gain = context.createGain();
  gain.gain.value = 0.18;
  const freqs: [number, OscillatorType][] = [
    [55, "sine"],
    [110.5, "triangle"],
    [82.4, "triangle"],
  ];

  const nodes = freqs.map(([freq, type], i) => {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const oscGain = context.createGain();
    oscGain.gain.value = i === 0 ? 1 : 0.5;

    const lfo = context.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.02;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(oscGain.gain);

    osc.connect(oscGain);
    oscGain.connect(gain);
    osc.start();
    lfo.start();
    return { osc, oscGain, lfo, lfoGain };
  });

  return {
    output: gain,
    stop: () => {
      nodes.forEach(({ osc, oscGain, lfo, lfoGain }) => {
        osc.stop();
        lfo.stop();
        [osc, oscGain, lfo, lfoGain].forEach((n) => n.disconnect());
      });
      gain.disconnect();
    },
  };
}

function buildRoomTone(context: AudioContext): PresetNode {
  const source = noiseSource(context, "brown");
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 600;
  const gain = context.createGain();
  gain.gain.value = 0.4;

  source.connect(lowpass);
  lowpass.connect(gain);

  return {
    output: gain,
    stop: () => {
      source.stop();
      [source, lowpass, gain].forEach((n) => n.disconnect());
    },
  };
}

const PRESET_BUILDERS: Record<AmbientPresetId, (context: AudioContext) => PresetNode> = {
  rain: buildRain,
  wind: buildWind,
  drone: buildDrone,
  "room-tone": buildRoomTone,
};

export function buildPresetNode(context: AudioContext, id: AmbientPresetId): PresetNode {
  return PRESET_BUILDERS[id](context);
}

// ─── custom track storage + selection/volume ──────────────────────────────

export type CustomTrack = { id: string; name: string };

const TRACKS_KEY = "nutmag-ambient-tracks";
const SELECTED_KEY = "nutmag-ambient-selected";
const VOLUME_KEY = "nutmag-ambient-volume";
const listeners = new Set<() => void>();
const urlCache = new Map<string, string>();

// cached reference — useSyncExternalStore requires getSnapshot to return the
// *same* reference until something actually changes, or React loops forever
// re-rendering on a "new" array every call (same pattern as lib/canvases.ts)
let tracksCache: CustomTrack[] | null = null;

function readTracks(): CustomTrack[] {
  if (tracksCache) return tracksCache;
  try {
    const raw = localStorage.getItem(TRACKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    tracksCache = Array.isArray(parsed)
      ? parsed.filter((t): t is CustomTrack => !!t && typeof t.id === "string" && typeof t.name === "string")
      : [];
  } catch {
    tracksCache = [];
  }
  return tracksCache;
}

function writeTracks(tracks: CustomTrack[]) {
  tracksCache = tracks;
  localStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));
}

function trackKey(id: string): string {
  return `ambient:${id}`;
}

function generateTrackId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function getCustomTracks(): CustomTrack[] {
  return readTracks();
}

const EMPTY_TRACKS: CustomTrack[] = [];

export function getServerCustomTracks(): CustomTrack[] {
  return EMPTY_TRACKS;
}

export async function addCustomTrack(file: File): Promise<string> {
  const id = generateTrackId();
  await idbSet(trackKey(id), file);
  const name = file.name.replace(/\.[^./]+$/, "") || "untitled track";
  writeTracks([...readTracks(), { id, name }]);
  listeners.forEach((listener) => listener());
  return id;
}

export async function removeCustomTrack(id: string): Promise<void> {
  await idbDelete(trackKey(id));
  writeTracks(readTracks().filter((t) => t.id !== id));
  const cached = urlCache.get(id);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(id);
  }
  listeners.forEach((listener) => listener());
}

export async function getCustomTrackUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await idbGet(trackKey(id));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function subscribeAmbientTracks(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSelectedTrack(): string {
  return localStorage.getItem(SELECTED_KEY) || "rain";
}

export function getServerSelectedTrack(): string {
  return "rain";
}

export function setSelectedTrack(id: string) {
  localStorage.setItem(SELECTED_KEY, id);
  listeners.forEach((listener) => listener());
}

export function getVolume(): number {
  const stored = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.5;
}

export function getServerVolume(): number {
  return 0.5;
}

export function setVolume(volume: number) {
  localStorage.setItem(VOLUME_KEY, String(volume));
  listeners.forEach((listener) => listener());
}
