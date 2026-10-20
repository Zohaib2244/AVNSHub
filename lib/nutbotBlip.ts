// A tiny, synthesized companion to NutBot's streaming mouth movement.
//
// It stays opt-in and is primed from the send click/key event, which keeps
// browser autoplay rules happy. Token frames can arrive in bursts, so a very
// short cooldown preserves the "CRT chat" feel without turning a fast reply
// into a continuous tone.

let audio: AudioContext | null = null;
let lastBlipAt = 0;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    audio ??= new AudioContext();
    return audio;
  } catch {
    return null;
  }
}

/** Call synchronously from the user's send gesture to unlock the optional sound. */
export function primeTokenBlips(enabled: boolean) {
  if (!enabled) return;
  const context = audioContext();
  if (context?.state === "suspended") void context.resume().catch(() => {});
}

/** One soft blip for a streamed token frame, alongside pulseSpeech(). */
export function pulseTokenBlip(enabled: boolean, chars = 1) {
  if (!enabled || typeof document === "undefined" || document.visibilityState !== "visible") return;
  const context = audioContext();
  if (!context || context.state !== "running") return;

  const now = context.currentTime;
  // A provider may put several tokens in one render frame. Keep those frames
  // from stacking into a harsh click while retaining the speaking cadence.
  if (now - lastBlipAt < 0.035) return;
  lastBlipAt = now;

  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const pitch = 610 + Math.min(18, Math.max(0, chars)) * 9;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(pitch, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.03);
  } catch {
    // Audio is purely decorative. A device that cannot create a node should
    // never affect streaming or the mouth animation.
  }
}
