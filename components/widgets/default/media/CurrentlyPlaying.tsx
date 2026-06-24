"use client";
import "./CurrentlyPlaying.css";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Library } from "lucide-react";
import { GameLibrary } from "@/components/widgets/default/media/GameLibrary";
import { usePolling } from "@/lib/usePolling";
import { timeAgo } from "@/lib/format";
import { useWidget } from "@/components/framework/WidgetContext";
import type { CurrentlyPlaying as CurrentlyPlayingData, SteamCreds } from "@/lib/steam";

/* eslint-disable @next/next/no-img-element -- steam avatars are tiny external images */

const POLL_URL = "/api/currently-playing";
const POLL_MS = 60_000;

/** Steam creds from this widget's settings, or undefined when blank (GET +
    server env-var fallback). */
function steamCredsFrom(settings: Record<string, string | number | boolean>): SteamCreds | undefined {
  const apiKey = String(settings.steamApiKey ?? "").trim();
  const steamId = String(settings.steamProfileId ?? "").trim();
  if (!apiKey && !steamId) return undefined;
  return { apiKey, steamId };
}

/** L-tier addition: games played in the last two weeks */
function RecentlyPlayed({ data }: { data: CurrentlyPlayingData | undefined }) {
  const recentlyPlayed = data?.recentlyPlayed ?? [];

  if (recentlyPlayed.length === 0) {
    return <div className="block-sub">nothing played recently</div>;
  }

  return (
    <>
      <div className="more-head">last 2 weeks</div>
      {recentlyPlayed.map((g) => (
        <div className="more-row" key={g.gameName}>
          <span>{g.gameName}</span>
          <span className="more-meta">
            {g.hours2w}h · {g.hoursTotal}h total
          </span>
        </div>
      ))}
    </>
  );
}

export function CurrentlyPlaying() {
  const { size, hoverExpanded, settings } = useWidget();
  const creds = steamCredsFrom(settings);
  const { data } = usePolling<CurrentlyPlayingData>(POLL_URL, POLL_MS, creds);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyFriendCode() {
    if (!data?.friendCode) return;
    navigator.clipboard.writeText(data.friendCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  if (size === "S") {
    return (
      <div className="steam-s-shell">
        <div className="steam-s-title">{data?.gameName ?? "—"}</div>
        {data && (
          <span className={`status-chip ${data.status}`}>
            <span className="status-dot" />
            {data.status}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="steam-card-grid">
        <div className="steam-last-played">
          <div className="steam-card-title">Last played</div>

          <AnimatePresence mode="wait">
            {!data ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="steam-game-name">—</div>
                <div className="steam-time">—</div>
              </motion.div>
            ) : (
              <motion.div
                key={data.gameName}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
              >
                <div className="steam-game-name">{data.gameName}</div>
                <div className="steam-time">
                  {data.recentPlaytimeMinutes > 0
                    ? `${Math.round((data.recentPlaytimeMinutes / 60) * 10) / 10}h recent`
                    : `last played ${timeAgo(data.lastPlayedTimestamp * 1000)}`}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {data && (
            <button type="button" className="steam-library-btn" onClick={() => setLibraryOpen(true)}>
              <Library size={14} strokeWidth={1.75} />
              View Library
            </button>
          )}
        </div>

        <div className="steam-user-panel">
          <div className="steam-status-row">
            <div className="steam-status-title">Online Status</div>
            {data && (
              <span className={`status-chip ${data.status}`}>
                <span className="status-dot" />
                {data.status}
              </span>
            )}
          </div>

          <div className="steam-profile-row">
            {data?.avatarUrl ? (
              <img src={data.avatarUrl} alt="steam avatar" className="steam-avatar" />
            ) : (
              <div className="steam-avatar steam-avatar-placeholder">pfp</div>
            )}
            <div className="steam-username">{data?.personaName ?? "User name"}</div>
          </div>

          {data?.friendCode && (
            <button
              type="button"
              className="copy-btn"
              onClick={copyFriendCode}
              aria-label="copy steam friend code"
              title={`copy friend code (${data.friendCode})`}
            >
              {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
              {copied ? "copied!" : "copy friend code"}
            </button>
          )}
        </div>
      </div>

      {(size === "L" || hoverExpanded) && (
        <div className="size-l-more">
          <RecentlyPlayed data={data} />
        </div>
      )}

      <GameLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} creds={creds} />
    </>
  );
}
