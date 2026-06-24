"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Play, Square } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono), monospace",
};

const labelStyle: CSSProperties = {
  color: "var(--text-muted)",
  fontFamily: "var(--font-dot-gothic), monospace",
  fontSize: "0.62rem",
  letterSpacing: "0.12em",
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

const lyricsBoxStyle: CSSProperties = {
  background: "var(--bg-nested)",
  border: "1.5px solid var(--border)",
  borderRadius: 12,
  boxShadow: "2px 2px 0 var(--shadow)",
  color: "var(--text-primary)",
  minHeight: 0,
  overflowY: "auto",
  padding: "9px 11px",
};

type Stanza = {
  heading: string;
  lines: string[];
};

type LyricLine = {
  heading: string;
  stanzaIndex: number;
  text: string;
};

function buildStanzas(rivalName: string): Stanza[] {
  const name = rivalName.trim() || "Glade";

  return [
    {
      heading: "verse 01 - empty",
      lines: [
        "Hush little Glade on a blank black pane,",
        "one lonely textbox pretending it's main.",
        "Describe a whole product, then wait for the trick,",
        "the harness does labor while Glade takes the pic.",
        "A UI that builds itself, what a glorious claim,",
        "when somebody else's CLI built the frame.",
      ],
    },
    {
      heading: "verse 02 - zero deps",
      lines: [
        "Zero dependencies, beat that drum,",
        "just Node and a harness and where is Claude from?",
        "Node eighteen plus and a CLI on PATH,",
        "three hidden footnotes doing all of the math.",
        "No scaffolds, no config, the landing page sings,",
        "then glade.config.json enters wearing fake wings.",
      ],
    },
    {
      heading: "verse 03 - hot load",
      lines: [
        "Hot-load the backend on every new call,",
        "security model: good vibes for us all.",
        "Paste in a key when the side panel slides,",
        "a nursery drawer where the attack surface hides.",
        "No reload needed, no guardrail in sight,",
        "just ship generated code in the middle of night.",
      ],
    },
    {
      heading: "verse 04 - feature creep",
      lines: [
        "Ask for a timer, get worlds underfoot,",
        "W-A-S-D through the scope-creep soot.",
        "Widgets are places, the grid is a game,",
        "because finishing one thing was apparently tame.",
        "A walking sprite tours each half-tested zone,",
        `even the bugs need a map of ${name}'s home.`,
      ],
    },
    {
      heading: "finale - lights out",
      lines: [
        `Sleep tight, ${name}, let the prompt tokens flow,`,
        "your demo is fast when the standards are low.",
        "You outsourced the code, then the credit, then taste,",
        "and called the resulting latency haste.",
        "AVN Hub brought receipts, every card built to last,",
        "Glade brought one input and a mouth full of glass.",
      ],
    },
  ];
}

function getAudioContextConstructor() {
  type AudioWindow = typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };

  const audioWindow = window as AudioWindow;
  return window.AudioContext ?? audioWindow.webkitAudioContext;
}

export function DissGladeWidget() {
  const { size, settings } = useWidget();
  const rivalName =
    typeof settings.rivalName === "string" && settings.rivalName.trim()
      ? settings.rivalName
      : "Glade";
  const voicePitch =
    typeof settings.voicePitch === "number" ? settings.voicePitch : 0.82;
  const voiceRate =
    typeof settings.voiceRate === "number" ? settings.voiceRate : 0.9;
  const beatEnabled = settings.beatEnabled !== false;

  const stanzas = useMemo(() => buildStanzas(rivalName), [rivalName]);
  const lyrics = useMemo<LyricLine[]>(
    () =>
      stanzas.flatMap((stanza, stanzaIndex) =>
        stanza.lines.map((text) => ({
          heading: stanza.heading,
          stanzaIndex,
          text,
        })),
      ),
    [stanzas],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const beatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);

  const stopBeat = () => {
    if (beatTimeoutRef.current !== null) {
      clearTimeout(beatTimeoutRef.current);
      beatTimeoutRef.current = null;
    }

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) {
      void context.close().catch(() => undefined);
    }
  };

  const startBeat = (session: number) => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    audioContextRef.current = context;

    const tone = (
      frequency: number,
      duration: number,
      volume: number,
      type: OscillatorType,
      delay = 0,
    ) => {
      if (sessionRef.current !== session) return;

      const startsAt = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startsAt);
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + duration + 0.02);
    };

    const bassNotes = [98, 98, 116.54, 87.31];
    let step = 0;

    const tick = () => {
      if (sessionRef.current !== session) return;

      tone(bassNotes[step % bassNotes.length], 0.3, 0.09, "triangle");
      tone(880, 0.055, step % 2 === 0 ? 0.035 : 0.018, "square", 0.02);
      if (step % 4 === 2) tone(146.83, 0.18, 0.055, "sawtooth", 0.1);

      step += 1;
      beatTimeoutRef.current = setTimeout(tick, 390);
    };

    tick();
  };

  const stopPlayback = () => {
    sessionRef.current += 1;
    window.speechSynthesis.cancel();
    stopBeat();
    setIsPlaying(false);
    setActiveLine(-1);
  };

  const startPlayback = () => {
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    window.speechSynthesis.cancel();
    stopBeat();
    setIsPlaying(true);
    setActiveLine(0);

    if (beatEnabled) startBeat(session);

    const voices = window.speechSynthesis.getVoices();
    const voice =
      voices.find((candidate) => /^en(-|_)/i.test(candidate.lang)) ?? voices[0];

    const speak = (index: number) => {
      if (sessionRef.current !== session) return;

      if (index >= lyrics.length) {
        stopBeat();
        if (mountedRef.current) {
          setIsPlaying(false);
          setActiveLine(-1);
        }
        return;
      }

      if (mountedRef.current) setActiveLine(index);

      const utterance = new SpeechSynthesisUtterance(lyrics[index].text);
      utterance.pitch = voicePitch;
      utterance.rate = voiceRate;
      if (voice) utterance.voice = voice;
      utterance.onend = () => speak(index + 1);
      utterance.onerror = () => {
        if (sessionRef.current !== session) return;
        stopBeat();
        if (mountedRef.current) {
          setIsPlaying(false);
          setActiveLine(-1);
        }
      };
      window.speechSynthesis.speak(utterance);
    };

    speak(0);
  };

  const handlePlayback = () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    startPlayback();
  };

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      window.speechSynthesis.cancel();

      if (beatTimeoutRef.current !== null) {
        clearTimeout(beatTimeoutRef.current);
      }

      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context) {
        void context.close().catch(() => undefined);
      }
    };
  }, []);

  const PlayIcon = isPlaying ? Square : Play;
  const playLabel = isPlaying ? "stop diss" : "play diss";
  const activeStanzaIndex =
    activeLine >= 0 ? lyrics[activeLine]?.stanzaIndex ?? 0 : 0;
  const mediumStanza = stanzas[activeStanzaIndex] ?? stanzas[0];
  const mediumStartIndex = lyrics.findIndex(
    (line) => line.stanzaIndex === activeStanzaIndex,
  );

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
        <div className="block-label" style={labelStyle}>
          nursery warfare
        </div>
        <div
          className="block-value accent"
          style={{ ...monoStyle, fontSize: "1.05rem", overflowWrap: "anywhere" }}
        >
          {isPlaying ? "mic: live" : `roast ${rivalName}`}
        </div>
        <button
          aria-label={playLabel}
          onClick={handlePlayback}
          style={buttonStyle}
          type="button"
        >
          <PlayIcon size={14} strokeWidth={1.75} />
          {isPlaying ? "stop" : "play"}
        </button>
      </div>
    );
  }

  if (size === "M") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          height: "100%",
          minHeight: 0,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <div className="block-label" style={labelStyle}>
            {mediumStanza.heading}
          </div>
          <button
            aria-label={playLabel}
            onClick={handlePlayback}
            style={buttonStyle}
            type="button"
          >
            <PlayIcon size={14} strokeWidth={1.75} />
            {playLabel}
          </button>
        </div>

        <div style={{ ...lyricsBoxStyle, ...monoStyle, flex: 1, fontSize: "0.73rem" }}>
          {mediumStanza.lines.map((line, index) => {
            const lineIndex = mediumStartIndex + index;
            const isActive = isPlaying && lineIndex === activeLine;

            return (
              <div
                key={`${mediumStanza.heading}-${line}`}
                style={{
                  color: isActive ? "var(--accent-orange)" : "var(--text-primary)",
                  fontWeight: isActive ? 700 : 400,
                  lineHeight: 1.45,
                  marginBottom: 3,
                }}
              >
                {isActive ? "> " : ""}
                {line}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 9,
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <div className="block-label" style={labelStyle}>
          bedtime bars for {rivalName}
        </div>
        <button
          aria-label={playLabel}
          onClick={handlePlayback}
          style={buttonStyle}
          type="button"
        >
          <PlayIcon size={14} strokeWidth={1.75} />
          {playLabel}
        </button>
      </div>

      <div style={{ ...lyricsBoxStyle, flex: 1 }}>
        {stanzas.map((stanza, stanzaIndex) => {
          const stanzaStart = lyrics.findIndex(
            (line) => line.stanzaIndex === stanzaIndex,
          );

          return (
            <section key={stanza.heading} style={{ marginBottom: 13 }}>
              <div className="more-head" style={labelStyle}>
                {stanza.heading}
              </div>
              <div className="more-row" style={{ display: "block", padding: "4px 0" }}>
                {stanza.lines.map((line, index) => {
                  const lineIndex = stanzaStart + index;
                  const isActive = isPlaying && lineIndex === activeLine;

                  return (
                    <div
                      key={`${stanza.heading}-${line}`}
                      style={{
                        ...monoStyle,
                        color: isActive
                          ? "var(--accent-cyan)"
                          : "var(--text-primary)",
                        fontSize: "0.76rem",
                        fontWeight: isActive ? 700 : 400,
                        lineHeight: 1.5,
                      }}
                    >
                      {isActive ? "> " : ""}
                      {line}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="block-sub" style={{ ...monoStyle, overflowWrap: "anywhere" }}>
        voice {voicePitch.toFixed(2)}x / rate {voiceRate.toFixed(2)}x / beat{" "}
        {beatEnabled ? "armed" : "muted"}
      </div>
    </div>
  );
}
