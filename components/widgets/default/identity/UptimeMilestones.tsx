"use client";

import {
  Calendar,
  CalendarRange,
  Crown,
  Medal,
  PartyPopper,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { formatDuration } from "@/lib/format";

// Day 1 = the card's first commit (2026-06-08). Milestones accrue from here;
// the session line below tracks the live process uptime from /api/uptime.
const EPOCH_MS = Date.UTC(2026, 5, 8);

const MILESTONES = [
  { days: 1, label: "first day", Icon: PartyPopper },
  { days: 7, label: "one week", Icon: CalendarRange },
  { days: 30, label: "one month", Icon: Calendar },
  { days: 100, label: "100 days", Icon: Trophy },
  { days: 180, label: "six months", Icon: Medal },
  { days: 365, label: "one year", Icon: Star },
  { days: 500, label: "500 days", Icon: Zap },
  { days: 1000, label: "1000 days", Icon: Crown },
];

const VISIBLE_MILESTONES = 6;

export function UptimeMilestones() {
  const { data } = usePolling<{ uptimeSeconds: number }>("/api/uptime", 60_000);

  // day counter rides the same fetch cycle (client-only, so no hydration mismatch)
  const days = data !== null ? Math.floor((Date.now() - EPOCH_MS) / 86_400_000) + 1 : null;
  const session = data !== null ? formatDuration(data.uptimeSeconds) : null;
  const next = days !== null ? MILESTONES.find((m) => m.days > days) ?? null : null;

  return (
    <>
      <div className="milestone-list">
        {MILESTONES.slice(0, VISIBLE_MILESTONES).map((m) => {
          const reached = days !== null && m.days <= days;
          const isNext = next === m;
          const pct = isNext && days !== null ? Math.round((days / m.days) * 100) : 100;
          return (
            <div className="milestone" key={m.days}>
              <div className={`m-icon ${reached ? "reached" : "next"}`}>
                <m.Icon size={16} strokeWidth={1.75} />
              </div>
              <div className="m-body">
                <div className="m-title">
                  {m.label}
                  {reached && <span className="m-flag">reached</span>}
                  {isNext && <span className="m-pct">{pct}%</span>}
                </div>
                <div className="m-sub">
                  {days === null ? "—" : reached ? `day ${m.days}` : `${m.days - days} days away`}
                </div>
                {isNext && (
                  <div className="progress-wrap">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="m-footer">
        <div>
          <div className="m-footer-label">card uptime</div>
          <div className="m-footer-session">session {session ?? "—"}</div>
        </div>
        <div className="m-footer-value">day {days ?? "—"}</div>
      </div>
    </>
  );
}
