import { NextResponse } from "next/server";

// Requires: FOOTBALL_DATA_API_KEY — free tier at https://www.football-data.org/
// Without a key, the route returns realistic mock data so the widget still renders.

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const BASE = "https://api.football-data.org/v4";

export const dynamic = "force-dynamic";

interface Team {
  name: string;
  shortName: string;
  tla: string;
}

interface ScoreDetail {
  home: number | null;
  away: number | null;
}

export interface FifaMatch {
  id: number;
  competition: { name: string; code: string };
  status: string;
  minute: number | null;
  homeTeam: Team;
  awayTeam: Team;
  score: { fullTime: ScoreDetail; halfTime: ScoreDetail };
  utcDate: string;
}

function getMockMatches(): FifaMatch[] {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  return [
    {
      id: 1,
      competition: { name: "Premier League", code: "PL" },
      status: "IN_PLAY",
      minute: 67,
      homeTeam: { name: "Arsenal FC", shortName: "Arsenal", tla: "ARS" },
      awayTeam: { name: "Chelsea FC", shortName: "Chelsea", tla: "CHE" },
      score: {
        fullTime: { home: 2, away: 1 },
        halfTime: { home: 1, away: 0 },
      },
      utcDate: iso(-67 * 60_000),
    },
    {
      id: 2,
      competition: { name: "Premier League", code: "PL" },
      status: "FINISHED",
      minute: 90,
      homeTeam: { name: "Liverpool FC", shortName: "Liverpool", tla: "LIV" },
      awayTeam: {
        name: "Manchester City FC",
        shortName: "Man City",
        tla: "MCI",
      },
      score: {
        fullTime: { home: 3, away: 2 },
        halfTime: { home: 2, away: 1 },
      },
      utcDate: iso(-180 * 60_000),
    },
    {
      id: 3,
      competition: { name: "La Liga", code: "PD" },
      status: "IN_PLAY",
      minute: 45,
      homeTeam: { name: "FC Barcelona", shortName: "Barcelona", tla: "BAR" },
      awayTeam: {
        name: "Real Madrid CF",
        shortName: "Real Madrid",
        tla: "RMA",
      },
      score: {
        fullTime: { home: 1, away: 1 },
        halfTime: { home: 1, away: 0 },
      },
      utcDate: iso(-45 * 60_000),
    },
    {
      id: 4,
      competition: { name: "UEFA Champions League", code: "CL" },
      status: "SCHEDULED",
      minute: null,
      homeTeam: { name: "Bayern München", shortName: "Bayern", tla: "BAY" },
      awayTeam: {
        name: "Paris Saint-Germain FC",
        shortName: "PSG",
        tla: "PSG",
      },
      score: {
        fullTime: { home: null, away: null },
        halfTime: { home: null, away: null },
      },
      utcDate: iso(60 * 60_000),
    },
    {
      id: 5,
      competition: { name: "Serie A", code: "SA" },
      status: "PAUSED",
      minute: null,
      homeTeam: { name: "Juventus FC", shortName: "Juventus", tla: "JUV" },
      awayTeam: { name: "AC Milan", shortName: "AC Milan", tla: "MIL" },
      score: {
        fullTime: { home: 0, away: 0 },
        halfTime: { home: 0, away: 0 },
      },
      utcDate: iso(-45 * 60_000),
    },
    {
      id: 6,
      competition: { name: "Bundesliga", code: "BL1" },
      status: "SCHEDULED",
      minute: null,
      homeTeam: {
        name: "Borussia Dortmund",
        shortName: "Dortmund",
        tla: "BVB",
      },
      awayTeam: {
        name: "Bayer 04 Leverkusen",
        shortName: "Leverkusen",
        tla: "B04",
      },
      score: {
        fullTime: { home: null, away: null },
        halfTime: { home: null, away: null },
      },
      utcDate: iso(90 * 60_000),
    },
  ];
}

function parseTeam(raw: unknown): Team {
  const t = raw as Record<string, unknown> | null | undefined;
  return {
    name: String(t?.name ?? ""),
    shortName: String(t?.shortName ?? t?.name ?? ""),
    tla: String(t?.tla ?? ""),
  };
}

function parseScoreDetail(raw: unknown): ScoreDetail {
  const s = raw as Record<string, unknown> | null | undefined;
  return {
    home: typeof s?.home === "number" ? s.home : null,
    away: typeof s?.away === "number" ? s.away : null,
  };
}

function parseMatch(raw: unknown): FifaMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const comp = o.competition as Record<string, unknown> | undefined;
  const score = o.score as Record<string, unknown> | undefined;

  return {
    id: typeof o.id === "number" ? o.id : 0,
    competition: {
      name: String(comp?.name ?? ""),
      code: String(comp?.code ?? ""),
    },
    status: String(o.status ?? ""),
    minute: typeof o.minute === "number" ? o.minute : null,
    homeTeam: parseTeam(o.homeTeam),
    awayTeam: parseTeam(o.awayTeam),
    score: {
      fullTime: parseScoreDetail(score?.fullTime),
      halfTime: parseScoreDetail(score?.halfTime),
    },
    utcDate: String(o.utcDate ?? ""),
  };
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ matches: getMockMatches(), mock: true });
  }

  const today = new Date().toISOString().split("T")[0];

  try {
    const res = await fetch(
      `${BASE}/matches?dateFrom=${today}&dateTo=${today}`,
      {
        headers: { "X-Auth-Token": API_KEY },
        next: { revalidate: 60 },
      },
    );

    if (!res.ok) {
      throw new Error(`football-data.org responded with ${res.status}`);
    }

    const raw = (await res.json()) as { matches?: unknown[] };
    const matches = (raw.matches ?? [])
      .map(parseMatch)
      .filter(Boolean) as FifaMatch[];

    return NextResponse.json({ matches });
  } catch (err) {
    console.error("fifascore route error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch scores",
        matches: [],
      },
      { status: 500 },
    );
  }
}
