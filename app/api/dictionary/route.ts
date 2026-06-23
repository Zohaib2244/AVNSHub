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
  word: string;
  phonetic?: string;
  meanings: Meaning[];
  synonyms: string[];
  sourceUrl?: string;
  error?: string;
};

const DEFAULT_WORD = "serendipity";

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

function errorPayload(word: string, error: string): DictionaryPayload {
  return {
    word,
    meanings: [],
    synonyms: [],
    error,
  };
}

export async function GET(req: NextRequest) {
  const word = cleanWord(req.nextUrl.searchParams.get("word"));

  try {
    const dictionaryRes = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { next: { revalidate: 86_400 } },
    );

    if (dictionaryRes.status === 404) {
      return NextResponse.json(errorPayload(word, `no entry found for ${word}`));
    }

    if (!dictionaryRes.ok) {
      throw new Error(`Dictionary request failed: ${dictionaryRes.status}`);
    }

    const body: unknown = await dictionaryRes.json();
    const entries = Array.isArray(body) ? body.filter(isRecord) : [];
    const meanings = parseMeanings(entries);

    if (meanings.length === 0) {
      return NextResponse.json(errorPayload(word, `no definitions returned for ${word}`));
    }

    const payload: DictionaryPayload = {
      word: stringValue(entries[0]?.word) ?? word,
      phonetic: parsePhonetic(entries),
      meanings,
      synonyms: collectSynonyms(meanings),
      sourceUrl: parseSourceUrl(entries),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("dictionary route error:", error);
    return NextResponse.json(errorPayload(word, "dictionary lookup failed"));
  }
}
