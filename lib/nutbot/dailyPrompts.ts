/** Conversation starters only fill the draft; they never execute an action. */
const PROMPTS = {
  chill: [
    "what's up?", "tell me something weird", "roast my homelab",
    "how are you feeling?", "give me a tiny creative challenge",
    "what should I build this weekend?", "tell me a terrible tech joke",
    "invent a useless gadget", "give me a rabbit hole to explore",
    "pitch me a strange game idea", "teach me something in one minute",
    "help me name my next project", "ask me an unexpected question",
    "what would a robot do on a day off?", "give me a fun thought experiment",
  ],
  work: [
    "any containers unhealthy?", "what's eating the most disk?",
    "did a usb drive drop out?", "failed systemd units?",
    "summarize this machine's health", "which services restarted recently?",
    "check memory pressure", "what's using the most CPU?",
    "look for recent errors in the logs", "check mounted drives",
    "which containers have been running longest?", "check available disk space",
    "help me investigate a slow service", "summarize network interfaces",
  ],
};

/** Seeded shuffle: a fresh daily selection that stays stable across refreshes. */
export function dailyPrompts(mode: keyof typeof PROMPTS, localDay: string): string[] {
  if (!localDay) return [];
  let seed = 2166136261;
  for (const char of mode + localDay) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const count = random() < .5 ? 2 : 3;
  const pool = [...PROMPTS[mode]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
