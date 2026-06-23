import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Definition = {
  definition: string;
  example?: string;
  synonyms: string[];
};

type Meaning = {
  partOfSpeech: string;
  definitions: Definition[];
};

type DictionaryPayload = {
  query: string;
  word: string;
  correctedWord?: string;
  phonetic?: string;
  meanings: Meaning[];
  synonyms: string[];
  suggestions: string[];
  sourceUrl?: string;
  error?: string;
  status: "exact" | "corrected" | "missing" | "error";
};

const DEFAULT_WORD = "serendipity";
const MAX_SUGGESTIONS = 6;

function cleanWord(value: string | null) {
  const word = (value ?? DEFAULT_WORD).trim().replace(/\s+/g, " ");
  return (word || DEFAULT_WORD).slice(0, 64);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));
}

function unique(values: string[], limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }

  return result;
}

function sameWord(a: string, b: string) {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function parseDefinitions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((definition): Definition | null => {
      const text = stringValue(definition.definition);
      if (!text) return null;

      return {
        definition: text,
        example: stringValue(definition.example),
        synonyms: unique(stringArray(definition.synonyms), 6),
      };
    })
    .filter((definition): definition is Definition => definition !== null);
}

function parseMeanings(entries: Record<string, unknown>[]) {
  const meanings: Meaning[] = [];

  for (const entry of entries) {
    const rawMeanings = entry.meanings;
    if (!Array.isArray(rawMeanings)) continue;

    for (const rawMeaning of rawMeanings) {
      if (!isRecord(rawMeaning)) continue;
      const definitions = parseDefinitions(rawMeaning.definitions);
      if (definitions.length === 0) continue;

      meanings.push({
        partOfSpeech: stringValue(rawMeaning.partOfSpeech) ?? "word",
        definitions,
      });
    }
  }

  return meanings;
}

function parsePhonetic(entries: Record<string, unknown>[]) {
  for (const entry of entries) {
    const phonetic = stringValue(entry.phonetic);
    if (phonetic) return phonetic;

    if (!Array.isArray(entry.phonetics)) continue;
    for (const rawPhonetic of entry.phonetics) {
      if (!isRecord(rawPhonetic)) continue;
      const text = stringValue(rawPhonetic.text);
      if (text) return text;
    }
  }

  return undefined;
}

function parseSourceUrl(entries: Record<string, unknown>[]) {
  for (const entry of entries) {
    const urls = stringArray(entry.sourceUrls);
    if (urls[0]) return urls[0];
  }

  return undefined;
}

function collectSynonyms(meanings: Meaning[]) {
  return unique(
    meanings.flatMap((meaning) =>
      meaning.definitions.flatMap((definition) => definition.synonyms),
    ),
    10,
  );
}

function parseSuggestions(value: unknown, query: string) {
  if (!Array.isArray(value)) return [];

  return unique(
    value
      .filter(isRecord)
      .map((suggestion) => stringValue(suggestion.word))
      .filter((word): word is string => Boolean(word))
      .filter((word) => word.length <= 64),
    MAX_SUGGESTIONS,
  ).sort((a, b) => {
    if (sameWord(a, query)) return -1;
    if (sameWord(b, query)) return 1;
    return 0;
  });
}

async function fetchSuggestions(word: string) {
  try {
    const suggestUrl = new URL("https://api.datamuse.com/sug");
    suggestUrl.searchParams.set("s", word);
    suggestUrl.searchParams.set("max", String(MAX_SUGGESTIONS));

    const suggestRes = await fetch(suggestUrl, { next: { revalidate: 3600 } });
    if (!suggestRes.ok) return [];

    return parseSuggestions(await suggestRes.json(), word);
  } catch {
    return [];
  }
}

async function fetchEntry(word: string) {
  const dictionaryRes = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { next: { revalidate: 86_400 } },
  );

  if (dictionaryRes.status === 404) return null;

  if (!dictionaryRes.ok) {
    throw new Error(`Dictionary request failed: ${dictionaryRes.status}`);
  }

  const body: unknown = await dictionaryRes.json();
  const entries = Array.isArray(body) ? body.filter(isRecord) : [];
  const meanings = parseMeanings(entries);

  if (meanings.length === 0) return null;

  return {
    word: stringValue(entries[0]?.word) ?? word,
    phonetic: parsePhonetic(entries),
    meanings,
    synonyms: collectSynonyms(meanings),
    sourceUrl: parseSourceUrl(entries),
  };
}

function errorPayload(
  query: string,
  word: string,
  suggestions: string[],
  status: "missing" | "error",
  error: string,
): DictionaryPayload {
  return {
    query,
    word,
    meanings: [],
    synonyms: [],
    suggestions,
    status,
    error,
  };
}

export async function GET(req: NextRequest) {
  const query = cleanWord(req.nextUrl.searchParams.get("word"));

  try {
    const suggestions = await fetchSuggestions(query);
    const exact = await fetchEntry(query);

    if (exact) {
      const payload: DictionaryPayload = {
        query,
        status: "exact",
        suggestions,
        ...exact,
      };

      return NextResponse.json(payload);
    }

    const correction = suggestions.find((suggestion) => !sameWord(suggestion, query));
    if (correction) {
      const corrected = await fetchEntry(correction);
      if (corrected) {
        const payload: DictionaryPayload = {
          query,
          correctedWord: corrected.word,
          status: "corrected",
          suggestions,
          ...corrected,
        };

        return NextResponse.json(payload);
      }
    }

    return NextResponse.json(
      errorPayload(query, query, suggestions, "missing", `no entry found for ${query}`),
    );
  } catch (error) {
    console.error("dictionary route error:", error);
    return NextResponse.json(errorPayload(query, query, [], "error", "dictionary lookup failed"));
  }
}
