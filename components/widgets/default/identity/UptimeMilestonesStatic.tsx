"use client";
import "./UptimeMilestones.css";

// Wallpaper-build variant of UptimeMilestones — same milestone list/markup,
// but the "session" line measures time since the wallpaper itself loaded
// instead of polling /api/uptime (no server in a static export). The day
// counter never needed the server at all (just Date.now() vs a fixed epoch),
// so only that one line actually changes.

import { useEffect, useState } from "react";
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
import { formatDuration } from "@/lib/format";

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

export function UptimeMilestonesStatic() {
  const [loadedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const days = Math.floor((now - EPOCH_MS) / 86_400_000) + 1;
  const session = formatDuration(Math.floor((now - loadedAt) / 1000));
  const next = MILESTONES.find((m) => m.days > days) ?? null;

  return (
    <>
      <div className="milestone-list">
        {MILESTONES.slice(0, VISIBLE_MILESTONES).map((m) => {
          const reached = m.days <= days;
          const isNext = next === m;
          const pct = isNext ? Math.round((days / m.days) * 100) : 100;
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
                <div className="m-sub">{reached ? `day ${m.days}` : `${m.days - days} days away`}</div>
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
          <div className="m-footer-session">session {session}</div>
        </div>
        <div className="m-footer-value">day {days}</div>
      </div>
    </>
  );
}
