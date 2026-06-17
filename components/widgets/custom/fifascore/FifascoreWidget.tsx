"use client";

import { useWidget } from "@/components/framework/WidgetContext";
import { usePolling } from "@/lib/usePolling";
import type { FifaMatch } from "@/app/api/fifascore/route";

interface ApiResponse {
  matches: FifaMatch[];
  mock?: boolean;
  error?: string;
}

const LIVE_STATUSES = new Set(["IN_PLAY", "LIVE", "PAUSED"]);

function isLive(m: FifaMatch) {
  return LIVE_STATUSES.has(m.status);
}

function getStatus(m: FifaMatch): string {
  if (m.status === "IN_PLAY" || m.status === "LIVE") {
    return m.minute != null ? `${m.minute}'` : "LIVE";
  }
  if (m.status === "PAUSED") return "HT";
  if (m.status === "FINISHED") return "FT";
  if (m.status === "CANCELLED") return "CANC";
  if (m.status === "POSTPONED") return "PST";
  if (m.status === "SCHEDULED" || m.status === "TIMED") {
    try {
      return new Date(m.utcDate).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }
  return "—";
}

function getScore(m: FifaMatch): string {
  const { home, away } = m.score.fullTime;
  if (home === null || away === null) return "- : -";
  return `${home} : ${away}`;
}

function sortedMatches(matches: FifaMatch[]): FifaMatch[] {
  const priority = (m: FifaMatch) => {
    if (isLive(m)) return 0;
    if (m.status === "SCHEDULED" || m.status === "TIMED") return 1;
    if (m.status === "FINISHED") return 2;
    return 3;
  };
  return [...matches].sort((a, b) => priority(a) - priority(b));
}

export function FifascoreWidget() {
  const { size, settings } = useWidget();
  const competition = String(settings.competition ?? "all");
  const showFinished = settings.showFinished !== false;
  const showScheduled = settings.showScheduled !== false;

  const { data } = usePolling<ApiResponse>("/api/fifascore", 60_000);

  if (!data) {
    return (
      <div className="block-sub" style={{ opacity: 0.5 }}>
        loading scores…
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="block-sub" style={{ color: "var(--accent-orange)" }}>
        {data.error}
      </div>
    );
  }

  const byCompetition =
    competition === "all"
      ? (data.matches ?? [])
      : (data.matches ?? []).filter((m) => m.competition.code === competition);

  const filtered = byCompetition.filter((m) => {
    if (m.status === "FINISHED" && !showFinished) return false;
    if ((m.status === "SCHEDULED" || m.status === "TIMED") && !showScheduled)
      return false;
    return true;
  });

  const prioritized = sortedMatches(filtered);
  const liveMatches = prioritized.filter(isLive);

  if (size === "S") {
    return <SView matches={prioritized} liveMatches={liveMatches} />;
  }
  if (size === "M") {
    return <MView matches={prioritized} />;
  }
  return <LView matches={prioritized} />;
}

// S — live pulse or total count

function SView({
  matches,
  liveMatches,
}: {
  matches: FifaMatch[];
  liveMatches: FifaMatch[];
}) {
  if (liveMatches.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          className="block-value"
          style={{ fontSize: "2rem", lineHeight: 1 }}
        >
          {matches.length > 0 ? matches.length : "—"}
        </div>
        <div className="block-sub">
          {matches.length === 1
            ? "match today"
            : matches.length > 1
              ? "matches today"
              : "no matches"}
        </div>
      </div>
    );
  }

  const top = liveMatches[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          className="block-value accent"
          style={{ fontSize: "1.4rem", lineHeight: 1 }}
        >
          {getScore(top)}
        </span>
        <span
          className="block-label"
          style={{ color: "var(--accent-orange)", letterSpacing: "0.1em" }}
        >
          {getStatus(top)}
        </span>
      </div>
      <div className="block-sub">
        {top.homeTeam.tla || top.homeTeam.shortName} ·{" "}
        {top.awayTeam.tla || top.awayTeam.shortName}
      </div>
      {liveMatches.length > 1 && (
        <div className="block-sub" style={{ color: "var(--accent-orange)" }}>
          +{liveMatches.length - 1} live
        </div>
      )}
    </div>
  );
}

// M — compact match list, up to 5

function MView({ matches }: { matches: FifaMatch[] }) {
  const shown = matches.slice(0, 5);

  if (shown.length === 0) {
    return (
      <div className="block-sub" style={{ opacity: 0.5 }}>
        no matches today
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {shown.map((m) => (
        <MatchRow key={m.id} match={m} abbreviated />
      ))}
    </div>
  );
}

// L — all matches grouped by competition

function LView({ matches }: { matches: FifaMatch[] }) {
  if (matches.length === 0) {
    return (
      <div className="block-sub" style={{ opacity: 0.5 }}>
        no matches today
      </div>
    );
  }

  const groups = new Map<string, FifaMatch[]>();
  for (const m of matches) {
    const key = m.competition.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[...groups.entries()].map(([comp, ms]) => (
        <div key={comp}>
          <div className="more-head">{comp}</div>
          {ms.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Shared row used by both M and L

function MatchRow({
  match: m,
  abbreviated = false,
}: {
  match: FifaMatch;
  abbreviated?: boolean;
}) {
  const live = isLive(m);
  const home = abbreviated
    ? (m.homeTeam.tla || m.homeTeam.shortName)
    : m.homeTeam.shortName;
  const away = abbreviated
    ? (m.awayTeam.tla || m.awayTeam.shortName)
    : m.awayTeam.shortName;

  return (
    <div
      className="more-row"
      style={{ display: "flex", alignItems: "center", gap: 8 }}
    >
      <span
        className="block-sub"
        style={{
          flex: 1,
          textAlign: "right",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {home}
      </span>
      <span
        className="block-value"
        style={{
          fontSize: "0.85rem",
          minWidth: 52,
          textAlign: "center",
          flexShrink: 0,
          color: live ? "var(--accent-orange)" : "var(--text-primary)",
        }}
      >
        {getScore(m)}
      </span>
      <span
        className="block-sub"
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {away}
      </span>
      <span
        className="block-label"
        style={{
          minWidth: 34,
          textAlign: "right",
          flexShrink: 0,
          letterSpacing: "0.08em",
          color: live ? "var(--accent-orange)" : "var(--text-muted)",
        }}
      >
        {getStatus(m)}
      </span>
    </div>
  );
}
