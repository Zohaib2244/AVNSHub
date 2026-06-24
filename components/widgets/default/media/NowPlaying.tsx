"use client";
import "./NowPlaying.css";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Music, Pause, Play } from "lucide-react";
import { usePolling } from "@/lib/usePolling";
import { timeAgo } from "@/lib/format";
import { useWidget } from "@/components/framework/WidgetContext";
import type { NowPlaying as NowPlayingData, PlayerAction, SpotifyCreds } from "@/lib/spotify";

const POLL_URL = "/api/now-playing";
const POLL_MS = 30_000;

/** Build a creds object from this widget's settings, or undefined when every
    field is blank (so the request stays a GET that uses the server env vars). */
function spotifyCredsFrom(settings: Record<string, string | number | boolean>): SpotifyCreds | undefined {
  const clientId = String(settings.spotifyClientId ?? "").trim();
  const clientSecret = String(settings.spotifyClientSecret ?? "").trim();
  const refreshToken = String(settings.spotifyRefreshToken ?? "").trim();
  if (!clientId && !clientSecret && !refreshToken) return undefined;
  return { clientId, clientSecret, refreshToken };
}

/** returns an error message, or null on success */
async function spotifyControl(action: PlayerAction, uri: string | undefined, refresh: () => void, creds?: SpotifyCreds) {
  try {
    const res = await fetch("/api/spotify-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, uri, creds }),
    });
    const result = (await res.json()) as { ok: boolean; error?: string };
    if (!result.ok) return result.error ?? "control failed";
    // Give Spotify a beat to apply the change, then refresh the capsule
    setTimeout(refresh, 700);
    return null;
  } catch {
    return "control request failed";
  }
}

/** L-tier addition: recently played tracks, or the live queue while playing */
function RecentTracks({ data, onPlayTrack }: { data: NowPlayingData | undefined; onPlayTrack: (uri: string) => void }) {
  const queue = data?.queue ?? [];
  const recentTracks = data?.recentTracks ?? [];
  const showQueue = !!data?.isPlaying && queue.length > 0;

  if (!showQueue && recentTracks.length === 0) {
    return <div className="block-sub">no recent tracks</div>;
  }

  return (
    <>
      <div className="more-head">Recently Played / Queue</div>
      {showQueue
        ? queue.map((t, i) => (
            <div className="more-row" key={i}>
              <span>{t.trackName}</span>
              <span className="more-meta">{t.artist}</span>
            </div>
          ))
        : recentTracks.map((t, i) => (
            <div
              className="more-row clickable"
              key={i}
              onClick={() => onPlayTrack(t.uri)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") onPlayTrack(t.uri);
              }}
            >
              <span>{t.trackName}</span>
              <span className="more-meta">{t.artist}</span>
            </div>
          ))}
    </>
  );
}

export function NowPlaying() {
  const { size, hoverExpanded, settings } = useWidget();
  const creds = spotifyCredsFrom(settings);
  const { data, refresh } = usePolling<NowPlayingData>(POLL_URL, POLL_MS, creds);
  const [controlError, setControlError] = useState<string | null>(null);

  async function control(action: PlayerAction) {
    setControlError(null);
    setControlError(await spotifyControl(action, undefined, refresh, creds));
  }

  async function playTrack(uri: string) {
    setControlError(null);
    setControlError(await spotifyControl("play-track", uri, refresh, creds));
  }

  if (size === "S") {
    return (
      <div className="spotify-s-shell">
        <div className="spotify-art-frame spotify-art-s">
          {data?.albumArtUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- spotify album art is a tiny external image
            <img src={data.albumArtUrl} alt="" />
          ) : (
            <Music size={18} strokeWidth={1.75} />
          )}
          {data?.isPlaying && <span className="spotify-live-dot" aria-hidden="true" />}
        </div>
        <div className="spotify-s-title">{data?.trackName ?? "—"}</div>
      </div>
    );
  }

  const progressPercent =
    data?.progressMs != null && data.durationMs
      ? Math.min(100, Math.max(0, (data.progressMs / data.durationMs) * 100))
      : 0;

  return (
    <>
      <div className="spotify-label">
        <Music size={14} strokeWidth={1.75} />
        now playing
      </div>

      <AnimatePresence mode="wait">
        {!data ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="spotify-shell"
          >
            <div className="spotify-now-row">
              <div className="spotify-art-frame">
                <Music size={22} strokeWidth={1.75} />
              </div>
              <div className="spotify-copy">
                <div className="spotify-title">—</div>
                <div className="spotify-artist">spotify idle</div>
              </div>
              <div className="spotify-controls">
                <button type="button" className="player-btn" aria-label="previous track" disabled>
                  <ChevronLeft size={18} strokeWidth={2.25} />
                </button>
                <button type="button" className="player-btn player-btn-main" aria-label="play" disabled>
                  <Play size={18} strokeWidth={2.25} />
                </button>
                <button type="button" className="player-btn" aria-label="next track" disabled>
                  <ChevronRight size={18} strokeWidth={2.25} />
                </button>
              </div>
            </div>
            <div className="spotify-progress" aria-hidden="true">
              <span style={{ width: "0%" }} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`${data.trackName}-${data.playedAt ?? "live"}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="spotify-shell"
          >
            <div className="spotify-now-row">
              <div className="spotify-art-frame">
                {data.albumArtUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- spotify album art is a tiny external image
                  <img src={data.albumArtUrl} alt="" />
                ) : (
                  <Music size={22} strokeWidth={1.75} />
                )}
              </div>

              <div className="spotify-copy">
                <div className="spotify-title">{data.trackName}</div>
                <div className="spotify-artist">
                  {data.artist}
                  {!data.isPlaying && data.playedAt && ` · ${timeAgo(data.playedAt)}`}
                </div>
              </div>

              <div className="spotify-controls">
                <button type="button" className="player-btn" onClick={() => control("previous")} aria-label="previous track">
                  <ChevronLeft size={18} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  className="player-btn player-btn-main"
                  onClick={() => control(data.isPlaying ? "pause" : "play")}
                  aria-label={data.isPlaying ? "pause" : "play"}
                >
                  {data.isPlaying ? <Pause size={18} strokeWidth={2.25} /> : <Play size={18} strokeWidth={2.25} />}
                </button>
                <button type="button" className="player-btn" onClick={() => control("next")} aria-label="next track">
                  <ChevronRight size={18} strokeWidth={2.25} />
                </button>
              </div>
            </div>

            <div className={`spotify-progress${data.isPlaying ? " is-live" : ""}`} aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {controlError && <div className="control-error">{controlError}</div>}

      {(size === "L" || hoverExpanded) && (
        <div className="size-l-more">
          <RecentTracks data={data} onPlayTrack={playTrack} />
        </div>
      )}
    </>
  );
}
