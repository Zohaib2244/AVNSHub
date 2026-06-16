// Lightweight subsequence fuzzy matcher — no dependency, fine for the small
// lists (widget names, etc.) this app filters. `query`'s characters must
// appear in `target` in order (case-insensitive); consecutive runs and
// word-boundary starts score higher so e.g. "np" ranks "now playing" above
// "a very nutty home server".

export function fuzzyScore(query: string, target: string): number | null {
  if (!query) return 0;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let score = 0;
  let qi = 0;
  let prevMatched = false;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      prevMatched = false;
      continue;
    }
    score += 1;
    if (prevMatched) score += 2;
    if (ti === 0 || t[ti - 1] === " ") score += 2;
    prevMatched = true;
    qi++;
  }

  return qi === q.length ? score : null;
}

/** filters + ranks `items` by fuzzy score against `getText(item)`; an empty
    query returns `items` unchanged (no-op filter) */
export function fuzzyFilter<T>(items: readonly T[], query: string, getText: (item: T) => string): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [...items];

  return items
    .map((item) => ({ item, score: fuzzyScore(trimmed, getText(item)) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
