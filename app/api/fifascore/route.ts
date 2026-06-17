import { NextRequest, NextResponse } from "next/server";

// Requires: FOOTBALL_DATA_API_KEY — free tier at https://www.football-data.org/
// Without a key, the route returns realistic WC 2026 mock data.

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
  stage: string;
  group: string | null;
  matchday: number | null;
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
      id: 2001,
      competition: { name: "FIFA World Cup 2026", code: "WC" },
      stage: "GROUP_STAGE",
      group: "GROUP_A",
      matchday: 1,
      status: "FINISHED",
      minute: 90,
      homeTeam: { name: "United States", shortName: "USA", tla: "USA" },
      awayTeam: { name: "Panama", shortName: "Panama", tla: "PAN" },
      score: {
        fullTime: { home: 3, away: 0 },
        halfTime: { home: 1, away: 0 },
      },
      utcDate: iso(-3 * 3_600_000),
    },
    {
      id: 2002,
      competition: { name: "FIFA World Cup 2026", code: "WC" },
      stage: "GROUP_STAGE",
      group: "GROUP_B",
      matchday: 1,
      status: "IN_PLAY",
      minute: 34,
      homeTeam: { name: "Brazil", shortName: "Brazil", tla: "BRA" },
      awayTeam: { name: "Japan", shortName: "Japan", tla: "JPN" },
      score: {
        fullTime: { home: 1, away: 0 },
        halfTime: { home: null, away: null },
      },
      utcDate: iso(-34 * 60_000),
    },
    {
      id: 2003,
      competition: { name: "FIFA World Cup 2026", code: "WC" },
      stage: "GROUP_STAGE",
      group: "GROUP_C",
      matchday: 1,
      status: "PAUSED",
      minute: null,
      homeTeam: { name: "Argentina", shortName: "Argentina", tla: "ARG" },
      awayTeam: { name: "Australia", shortName: "Australia", tla: "AUS" },
      score: {
        fullTime: { home: 2, away: 1 },
        halfTime: { home: 2, away: 1 },
      },
      utcDate: iso(-45 * 60_000),
    },
    {
      id: 2004,
      competition: { name: "FIFA World Cup 2026", code: "WC" },
      stage: "GROUP_STAGE",
      group: "GROUP_D",
      matchday: 1,
      status: "SCHEDULED",
      minute: null,
      homeTeam: { name: "France", shortName: "France", tla: "FRA" },
      awayTeam: { name: "Morocco", shortName: "Morocco", tla: "MAR" },
      score: {
        fullTime: { home: null, away: null },
        halfTime: { home: null, away: null },
      },
      utcDate: iso(2 * 3_600_000),
    },
    {
      id: 2005,
      competition: { name: "FIFA World Cup 2026", code: "WC" },
      stage: "GROUP_STAGE",
      group: "GROUP_E",
      matchday: 1,
      status: "SCHEDULED",
      minute: null,
      homeTeam: { name: "England", shortName: "England", tla: "ENG" },
      awayTeam: { name: "Senegal", shortName: "Senegal", tla: "SEN" },
      score: {
        fullTime: { home: null, away: null },
        halfTime: { home: null, away: null },
      },
      utcDate: iso(4 * 3_600_000),
    },
    {
      id: 2006,
      competition: { name: "FIFA World Cup 2026", code: "WC" },
      stage: "GROUP_STAGE",
      group: "GROUP_F",
      matchday: 1,
      status: "SCHEDULED",
      minute: null,
      homeTeam: { name: "Spain", shortName: "Spain", tla: "ESP" },
      awayTeam: { name: "Mexico", shortName: "Mexico", tla: "MEX" },
      score: {
        fullTime: { home: null, away: null },
        halfTime: { home: null, away: null },
      },
      utcDate: iso(28 * 3_600_000),
    },
    {
      id: 2007,
      competition: { name: "FIFA World Cup 2026", code: "WC" },
      stage: "GROUP_STAGE",
      group: "GROUP_G",
      matchday: 1,
      status: "SCHEDULED",
      minute: null,
      homeTeam: { name: "Germany", shortName: "Germany", tla: "GER" },
      awayTeam: { name: "Saudi Arabia", shortName: "Saudi Arabia", tla: "KSA" },
      score: {
        fullTime: { home: null, away: null },
        halfTime: { home: null, away: null },
      },
      utcDate: iso(30 * 3_600_000),
    },
    {
      id: 2008,
      competition: { name: "FIFA World Cup 2026", code: "WC" },
      stage: "GROUP_STAGE",
      group: "GROUP_H",
      matchday: 1,
      status: "SCHEDULED",
      minute: null,
      homeTeam: { name: "Portugal", shortName: "Portugal", tla: "POR" },
      awayTeam: { name: "Canada", shortName: "Canada", tla: "CAN" },
      score: {
        fullTime: { home: null, away: null },
        halfTime: { home: null, away: null },
      },
      utcDate: iso(52 * 3_600_000),
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
    stage: String(o.stage ?? "GROUP_STAGE"),
    group: typeof o.group === "string" ? o.group : null,
    matchday: typeof o.matchday === "number" ? o.matchday : null,
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

export async function GET(req: NextRequest) {
  const rawDays = Number(req.nextUrl.searchParams.get("daysAhead") ?? "2");
  const daysAhead = isNaN(rawDays) ? 2 : Math.max(0, Math.min(7, rawDays));

  if (!API_KEY) {
    return NextResponse.json({ matches: getMockMatches(), mock: true });
  }

  const today = new Date();
  const dateFrom = today.toISOString().split("T")[0];
  const dateTo = new Date(today.getTime() + daysAhead * 86_400_000)
    .toISOString()
    .split("T")[0];

  try {
    const res = await fetch(
      `${BASE}/competitions/WC/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
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
