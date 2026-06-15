"use client";

import { useState, useSyncExternalStore } from "react";
import { BarChart3, Check, Plus } from "lucide-react";
import {
  addGame,
  addSession,
  getGames,
  getSelected,
  getServerGames,
  lastNDays,
  setSelected,
  subscribeSessions,
  type GameMap,
} from "@/lib/sessions";
import { formatMins } from "@/lib/format";

const DAYS_SHOWN = 14;
const DOW_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function useSessions(): { games: GameMap | null; selected: string } {
  const games = useSyncExternalStore(subscribeSessions, getGames, getServerGames);
  const selected = useSyncExternalStore(subscribeSessions, getSelected, getSelected);
  return { games, selected };
}

function dailyTotals(games: GameMap, selected: string) {
  const game = games[selected] ?? Object.values(games)[0];
  const days = lastNDays(DAYS_SHOWN);
  const byDay: Record<string, number> = {};
  game.sessions.forEach((s) => {
    byDay[s.date] = (byDay[s.date] ?? 0) + s.mins;
  });
  const vals = days.map((d) => byDay[d] ?? 0);
  return { game, days, byDay, vals };
}

export function SessionTracker() {
  const { games, selected } = useSessions();
  const [minsInput, setMinsInput] = useState("");
  const [copied, setCopied] = useState(false);

  if (!games) return <div className="block-sub">loading...</div>;

  const { game, days, byDay, vals } = dailyTotals(games, selected);
  const total = vals.reduce((a, b) => a + b, 0);
  const best = Math.max(...vals);
  const recent = game.sessions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  function switchGame(value: string) {
    if (value !== "custom") {
      setSelected(value);
      return;
    }
    const name = prompt("Game name:");
    if (name) addGame(name);
  }

  function logSession() {
    const mins = parseInt(minsInput, 10);
    if (!mins || mins < 1) return;
    addSession(selected, mins);
    setMinsInput("");
  }

  function copyReport() {
    const daysPlayed = vals.filter((v) => v > 0).length;
    const breakdown = days.map((d) => `${d}: ${byDay[d] ?? 0}m`).join(", ");
    const text =
      `Generate a gaming session report for ${game.name}. ` +
      `Data from last ${DAYS_SHOWN} days: total ${total} mins across ${daysPlayed} days. ` +
      `Best day: ${best} mins. Daily breakdown: ${breakdown}. ` +
      `Give me insights, streaks, and suggestions.`;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <>
      <select className="tracker-select" value={selected} onChange={(e) => switchGame(e.target.value)}>
        {Object.entries(games).map(([key, g]) => (
          <option key={key} value={key}>
            {g.name}
          </option>
        ))}
        <option value="custom">+ add game...</option>
      </select>

      <div className="tracker-log-pane">
        <div className="tracker-sub-label">recent log</div>
        <div className="session-log">
          {recent.length === 0 ? (
            <div className="slog-empty">no sessions yet — log one below</div>
          ) : (
            recent.map((s) => (
              <div className="slog-row" key={s.date}>
                <span>
                  {new Date(`${s.date}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" })}
                </span>
                <span className="slog-dur">{formatMins(s.mins)}</span>
              </div>
            ))
          )}
        </div>
        <div className="add-session">
          <input
            type="number"
            min={1}
            max={600}
            placeholder="mins played today"
            value={minsInput}
            onChange={(e) => setMinsInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && logSession()}
          />
          <button type="button" onClick={logSession}>
            <Plus size={12} strokeWidth={1.75} />
            log
          </button>
        </div>
        <button type="button" className="report-btn" onClick={copyReport}>
          {copied ? <Check size={12} strokeWidth={2} /> : <BarChart3 size={12} strokeWidth={1.75} />}
          {copied ? "report prompt copied" : "copy report prompt"}
        </button>
      </div>
    </>
  );
}

export function SessionTrackerMore() {
  const { games, selected } = useSessions();

  if (!games) return <div className="block-sub">loading...</div>;

  const { game, days, vals } = dailyTotals(games, selected);
  const maxVal = Math.max(...vals, 1);
  const total = vals.reduce((a, b) => a + b, 0);
  const avg = total > 0 ? Math.round(total / DAYS_SHOWN) : 0;
  const best = Math.max(...vals);

  return (
    <>
      <div className="tracker-sub-label">
        {game.name} · daily sessions · last {DAYS_SHOWN} days
      </div>
      <div className="chart-bars">
        {vals.map((v, i) => {
          const isToday = i === vals.length - 1;
          return (
            <div
              className="cb"
              key={days[i]}
              style={{
                height: `${Math.max(4, Math.round((v / maxVal) * 100))}%`,
                background: isToday ? "var(--accent-orange)" : "var(--accent-cyan)",
                opacity: v ? 1 : 0.2,
              }}
            >
              <div className="cb-tip">{v ? `${v}m` : "—"}</div>
            </div>
          );
        })}
      </div>
      <div className="chart-labels">
        {days.map((d, i) => (
          <span key={d} className={i === days.length - 1 ? "today" : undefined}>
            {DOW_SHORT[new Date(`${d}T00:00:00`).getDay()]}
          </span>
        ))}
      </div>
      <div className="tracker-stats">
        <div className="tracker-stat">
          <div className="tracker-stat-n">{Math.round(total / 60)}h</div>
          <div className="tracker-stat-l">14-day total</div>
        </div>
        <div className="tracker-stat">
          <div className="tracker-stat-n">{avg}m</div>
          <div className="tracker-stat-l">avg/day</div>
        </div>
        <div className="tracker-stat">
          <div className="tracker-stat-n">{Math.round((best / 60) * 10) / 10}h</div>
          <div className="tracker-stat-l">best day</div>
        </div>
      </div>
    </>
  );
}
