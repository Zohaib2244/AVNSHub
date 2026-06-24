"use client";

import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AudioWaveform, CloudFog, CloudRain, Pause, Play, Radio, Trash2, Upload, Wind } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import {
  AMBIENT_PRESETS,
  AMBIENT_STREAMS,
  addCustomTrack,
  buildPresetNode,
  getCustomTrackUrl,
  getCustomTracks,
  getSelectedTrack,
  getServerCustomTracks,
  getServerSelectedTrack,
  getServerVolume,
  getStreamUrl,
  getVolume,
  isPresetId,
  isStreamId,
  removeCustomTrack,
  setSelectedTrack,
  setVolume,
  subscribeAmbientTracks,
  type AmbientPresetId,
} from "@/lib/ambient";

const PRESET_ICONS: Record<AmbientPresetId, typeof CloudRain> = {
  rain: CloudRain,
  wind: Wind,
  drone: AudioWaveform,
  "room-tone": CloudFog,
};

const monoStyle: CSSProperties = { fontFamily: "var(--font-jetbrains-mono), monospace" };

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const buttonStyle: CSSProperties = {
  alignItems: "center",
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  cursor: "pointer",
  display: "inline-flex",
  flexShrink: 0,
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.65rem",
  gap: 6,
  justifyContent: "center",
  padding: "6px 10px",
  textTransform: "uppercase",
};

const VISUALIZER_BASELINE = 8;

function VisualizerBars({ count, barRefs }: { count: number; barRefs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  return (
    <div style={{ alignItems: "flex-end", display: "flex", gap: 3, height: 28, minWidth: 0 }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          ref={(node) => { barRefs.current[i] = node; }}
          style={{
            background: "var(--accent-orange)",
            borderRadius: 2,
            flex: 1,
            height: `${VISUALIZER_BASELINE}%`,
            minWidth: 3,
            transition: "height 0.1s ease-out",
          }}
        />
      ))}
    </div>
  );
}

export function AmbientSoundWidget() {
  const { size } = useWidget();
  const selected = useSyncExternalStore(subscribeAmbientTracks, getSelectedTrack, getServerSelectedTrack);
  const volume = useSyncExternalStore(subscribeAmbientTracks, getVolume, getServerVolume);
  const customTracks = useSyncExternalStore(subscribeAmbientTracks, getCustomTracks, getServerCustomTracks);

  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState("ready");
  const [dragging, setDragging] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const activeStopRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function ensureGraph() {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const context = audioContextRef.current;
    if (!analyserRef.current) {
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.connect(context.destination);
      analyserRef.current = analyser;
    }
    if (!masterGainRef.current) {
      const gain = context.createGain();
      gain.gain.value = volume;
      gain.connect(analyserRef.current);
      masterGainRef.current = gain;
    }
    return { context, analyser: analyserRef.current, masterGain: masterGainRef.current };
  }

  function stopVisualizer() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    barRefs.current.forEach((bar) => bar?.style.setProperty("height", `${VISUALIZER_BASELINE}%`));
  }

  function startVisualizer() {
    function tick() {
      const analyser = analyserRef.current;
      const barCount = barRefs.current.length;
      if (analyser && barCount > 0) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const binsPerBar = Math.max(1, Math.floor(data.length / barCount));
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < binsPerBar; j++) sum += data[i * binsPerBar + j] ?? 0;
          const pct = Math.max(VISUALIZER_BASELINE, (sum / binsPerBar / 255) * 100);
          barRefs.current[i]?.style.setProperty("height", `${pct}%`);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopPlayback() {
    activeStopRef.current?.();
    activeStopRef.current = null;
    setIsPlaying(false);
    stopVisualizer();
    setStatus("paused");
  }

  // shared by stream presets (static URL) and custom tracks (IndexedDB
  // object URL) — both play through the same hidden <audio> element since
  // createMediaElementSource can only ever be called once per element
  async function playViaAudioElement(context: AudioContext, masterGain: GainNode, url: string, label: string): Promise<boolean> {
    const audioEl = audioElRef.current;
    if (!audioEl) {
      setStatus("track unavailable");
      return false;
    }
    audioEl.src = url;
    audioEl.loop = true;
    if (!mediaSourceRef.current) {
      mediaSourceRef.current = context.createMediaElementSource(audioEl);
    }
    mediaSourceRef.current.connect(masterGain);
    try {
      await audioEl.play();
    } catch {
      setStatus("playback blocked — try again");
      return false;
    }
    activeStopRef.current = () => audioEl.pause();
    setStatus(`playing ${label}`);
    return true;
  }

  async function playTrack(id: string) {
    stopPlayback();
    const { context, masterGain } = ensureGraph();
    await context.resume();

    if (isPresetId(id)) {
      const node = buildPresetNode(context, id);
      node.output.connect(masterGain);
      activeStopRef.current = node.stop;
      setStatus(`playing ${AMBIENT_PRESETS.find((p) => p.id === id)?.label ?? id}`);
    } else if (isStreamId(id)) {
      const label = AMBIENT_STREAMS.find((s) => s.id === id)?.label ?? id;
      const ok = await playViaAudioElement(context, masterGain, getStreamUrl(id), label);
      if (!ok) return;
    } else {
      const url = await getCustomTrackUrl(id);
      if (!url) {
        setStatus("track unavailable");
        return;
      }
      const label = customTracks.find((t) => t.id === id)?.name ?? "custom track";
      const ok = await playViaAudioElement(context, masterGain, url, label);
      if (!ok) return;
    }

    setIsPlaying(true);
    startVisualizer();
  }

  function selectTrack(id: string) {
    setSelectedTrack(id);
    if (isPlaying) void playTrack(id);
  }

  function togglePlay() {
    if (isPlaying) stopPlayback();
    else void playTrack(selected);
  }

  function handleVolumeChange(next: number) {
    setVolume(next);
    if (masterGainRef.current) masterGainRef.current.gain.value = next;
  }

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("audio/")) return;
    const id = await addCustomTrack(file);
    selectTrack(id);
  }

  async function handleDeleteTrack(id: string) {
    if (id === selected && isPlaying) stopPlayback();
    await removeCustomTrack(id);
    if (id === selected) setSelectedTrack("rain");
  }

  useEffect(() => {
    return () => {
      activeStopRef.current?.();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      void audioContextRef.current?.close();
    };
  }, []);

  const playButton = (
    <button
      type="button"
      aria-label={isPlaying ? "Pause ambient sound" : "Play ambient sound"}
      onClick={togglePlay}
      style={{ ...buttonStyle, background: isPlaying ? "var(--accent-orange)" : "var(--bg-nested)" }}
    >
      {isPlaying ? <Pause size={12} strokeWidth={1.75} /> : <Play size={12} strokeWidth={1.75} />}
      {isPlaying ? "pause" : "play"}
    </button>
  );

  const volumeSlider = (
    <input
      aria-label="ambient sound volume"
      type="range"
      min={0}
      max={1}
      step={0.05}
      value={volume}
      onChange={(e) => handleVolumeChange(Number(e.target.value))}
      style={{ flex: 1, minWidth: 0 }}
    />
  );

  const audioElement = <audio ref={audioElRef} style={{ display: "none" }} />;

  if (size === "S") {
    return (
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          height: "100%",
          justifyContent: "center",
          minWidth: 0,
          textAlign: "center",
        }}
      >
        {audioElement}
        <div className="block-label" style={labelStyle}>ambient sound</div>
        <VisualizerBars count={8} barRefs={barRefs} />
        <div className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)" }}>{status}</div>
        {playButton}
      </div>
    );
  }

  const allTracks = [
    ...AMBIENT_PRESETS.map((p) => ({ id: p.id as string, name: p.label, custom: false })),
    ...AMBIENT_STREAMS.map((s) => ({ id: s.id as string, name: s.label, custom: false })),
    ...customTracks.map((t) => ({ id: t.id, name: t.name, custom: true })),
  ];

  if (size === "M") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0, minWidth: 0 }}>
        {audioElement}
        <div className="block-label" style={labelStyle}>ambient sound</div>
        <select
          aria-label="ambient sound track"
          value={selected}
          onChange={(e) => selectTrack(e.target.value)}
          style={{
            background: "var(--bg-nested)",
            border: "1.5px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontFamily: "var(--font-jetbrains-mono), monospace",
            fontSize: "0.72rem",
            padding: "5px 7px",
          }}
        >
          {allTracks.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <VisualizerBars count={14} barRefs={barRefs} />
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          {playButton}
          {volumeSlider}
        </div>
        <div className="block-sub" style={{ ...monoStyle, color: "var(--text-muted)" }}>{status}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 14, height: "100%", minHeight: 0, minWidth: 0 }}>
      {audioElement}
      <div
        style={{
          alignItems: "center",
          background: "var(--bg-nested)",
          border: "1.5px solid var(--border)",
          borderRadius: 16,
          boxShadow: "3px 3px 0 var(--shadow)",
          display: "flex",
          flex: "0 0 34%",
          flexDirection: "column",
          gap: 9,
          justifyContent: "center",
          minWidth: 0,
          padding: "10px 12px",
          textAlign: "center",
        }}
      >
        <div className="block-label" style={labelStyle}>ambient sound</div>
        <div className="block-value accent" style={{ ...monoStyle, fontSize: "0.92rem" }}>{status}</div>
        <VisualizerBars count={20} barRefs={barRefs} />
        <div style={{ alignItems: "center", display: "flex", gap: 8, width: "100%" }}>
          {playButton}
          {volumeSlider}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 5, minHeight: 0, minWidth: 0, overflowY: "auto" }}>
        <div className="more-head">tracks</div>
        {allTracks.map((t) => {
          const isActive = t.id === selected;
          const Icon = !t.custom && isPresetId(t.id) ? PRESET_ICONS[t.id] : !t.custom && isStreamId(t.id) ? Radio : AudioWaveform;
          return (
            <div
              key={t.id}
              className="more-row"
              style={{
                alignItems: "center",
                background: isActive ? "var(--bg-nested)" : "transparent",
                border: isActive ? "1.5px solid var(--accent-orange)" : "1.5px solid transparent",
                borderRadius: 12,
                boxShadow: isActive ? "2px 2px 0 var(--shadow)" : "none",
                color: isActive ? "var(--accent-orange)" : "var(--text-primary)",
                cursor: "pointer",
                display: "flex",
                fontFamily: "var(--font-jetbrains-mono), monospace",
                fontSize: "0.74rem",
                gap: 7,
                justifyContent: "space-between",
                padding: "5px 7px",
              }}
              onClick={() => selectTrack(t.id)}
            >
              <span style={{ alignItems: "center", display: "flex", gap: 7, minWidth: 0, overflow: "hidden" }}>
                <Icon size={13} strokeWidth={1.75} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              </span>
              {t.custom && (
                <button
                  type="button"
                  aria-label={`remove ${t.name}`}
                  onClick={(e) => { e.stopPropagation(); void handleDeleteTrack(t.id); }}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", flexShrink: 0, opacity: 0.7 }}
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                </button>
              )}
            </div>
          );
        })}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void handleUpload(e.dataTransfer.files); }}
          style={{
            alignItems: "center",
            border: `1.5px dashed ${dragging ? "var(--accent-orange)" : "var(--border)"}`,
            borderRadius: 10,
            color: dragging ? "var(--accent-orange)" : "var(--text-muted)",
            cursor: "pointer",
            display: "flex",
            fontSize: "0.66rem",
            gap: 6,
            justifyContent: "center",
            padding: "8px",
          }}
        >
          <Upload size={12} strokeWidth={1.75} />
          <span>upload your own clip</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          style={{ display: "none" }}
          onChange={(e) => void handleUpload(e.target.files)}
        />
      </div>
    </div>
  );
}
