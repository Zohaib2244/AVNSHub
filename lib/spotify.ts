const TOKEN_URL = "https://accounts.spotify.com/api/token";
const CURRENTLY_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
const RECENTLY_PLAYED_URL = "https://api.spotify.com/v1/me/player/recently-played?limit=6";
const QUEUE_URL = "https://api.spotify.com/v1/me/player/queue";
const PLAYER_BASE_URL = "https://api.spotify.com/v1/me/player/";

const ACCESS_TOKEN_SAFETY_MARGIN_MS = 60_000;
const NOW_PLAYING_CACHE_TTL_MS = 30_000;

export type NowPlaying = {
  trackName: string;
  artist: string;
  albumArtUrl: string | null;
  isPlaying: boolean;
  progressMs: number | null;
  durationMs: number | null;
  playedAt: string | null;
  recentTracks: { trackName: string; artist: string; uri: string }[];
  queue: { trackName: string; artist: string }[];
} | null;

export type PlayerAction = "play" | "pause" | "next" | "previous" | "play-track";

/** Credentials passed in from the widget's settings. Any field left blank
    falls back to the corresponding SPOTIFY_* env var, so existing .env.local
    setups keep working unchanged. */
export type SpotifyCreds = {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
};

function resolveCreds(creds?: SpotifyCreds): { clientId: string; clientSecret: string; refreshToken: string } {
  const clientId = creds?.clientId?.trim() || process.env.SPOTIFY_CLIENT_ID || "";
  const clientSecret = creds?.clientSecret?.trim() || process.env.SPOTIFY_CLIENT_SECRET || "";
  const refreshToken = creds?.refreshToken?.trim() || process.env.SPOTIFY_REFRESH_TOKEN || "";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN");
  }
  return { clientId, clientSecret, refreshToken };
}

type SpotifyArtist = { name: string };
type SpotifyImage = { url: string };
type SpotifyTrack = {
  name: string;
  uri: string;
  artists: SpotifyArtist[];
  album: { images?: SpotifyImage[] };
  duration_ms: number;
};

// token + now-playing caches are keyed by the resolved refresh token, so
// switching credentials in the widget settings refetches instead of serving
// another account's cached data
let cachedAccessToken: { token: string; expiresAt: number; key: string } | null = null;

async function getAccessToken(resolved: { clientId: string; clientSecret: string; refreshToken: string }): Promise<string> {
  const { clientId, clientSecret, refreshToken } = resolved;
  if (cachedAccessToken && cachedAccessToken.key === refreshToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - ACCESS_TOKEN_SAFETY_MARGIN_MS,
    key: refreshToken,
  };

  return cachedAccessToken.token;
}

function normalizeTrack(track: SpotifyTrack): { trackName: string; artist: string; albumArtUrl: string | null; uri: string } {
  return {
    trackName: track.name,
    artist: track.artists.map((a) => a.name).join(", "),
    albumArtUrl: track.album.images?.[0]?.url ?? null,
    uri: track.uri,
  };
}

// Queue is best-effort: requires user-read-playback-state and an active
// session — return [] rather than failing the whole now-playing payload.
async function fetchQueue(accessToken: string): Promise<{ trackName: string; artist: string }[]> {
  try {
    const response = await fetch(QUEUE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return [];

    const data = (await response.json()) as { queue?: SpotifyTrack[] };
    return (data.queue ?? []).slice(0, 4).map((t) => ({
      trackName: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
    }));
  } catch {
    return [];
  }
}

async function fetchRecentTracks(
  accessToken: string,
): Promise<{ trackName: string; artist: string; albumArtUrl: string | null; uri: string; playedAt: string }[]> {
  const response = await fetch(RECENTLY_PLAYED_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Spotify recently-played request failed: ${response.status}`);
  }

  const data = (await response.json()) as { items?: { track: SpotifyTrack; played_at: string }[] };
  return (data.items ?? []).map((item) => ({
    ...normalizeTrack(item.track),
    playedAt: item.played_at,
  }));
}

async function fetchCurrentlyPlayingRaw(
  accessToken: string,
): Promise<{ trackName: string; artist: string; albumArtUrl: string | null; isPlaying: boolean; progressMs: number | null; durationMs: number | null } | null> {
  const response = await fetch(CURRENTLY_PLAYING_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Spotify currently-playing request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    item: SpotifyTrack | null;
    is_playing: boolean;
    progress_ms: number | null;
  };

  if (!data.item) {
    return null;
  }

  return {
    ...normalizeTrack(data.item),
    isPlaying: data.is_playing,
    progressMs: data.progress_ms,
    durationMs: data.item.duration_ms,
  };
}

let cachedNowPlaying: { data: NowPlaying; expiresAt: number; key: string } | null = null;

async function fetchNowPlaying(resolved: { clientId: string; clientSecret: string; refreshToken: string }): Promise<NowPlaying> {
  const accessToken = await getAccessToken(resolved);
  const [current, recent] = await Promise.all([
    fetchCurrentlyPlayingRaw(accessToken),
    fetchRecentTracks(accessToken),
  ]);

  if (current) {
    const queue = await fetchQueue(accessToken);
    return {
      ...current,
      playedAt: null,
      recentTracks: recent.slice(0, 4).map(({ trackName, artist, uri }) => ({ trackName, artist, uri })),
      queue,
    };
  }

  const last = recent[0];
  if (!last) return null;

  return {
    trackName: last.trackName,
    artist: last.artist,
    albumArtUrl: last.albumArtUrl,
    isPlaying: false,
    progressMs: null,
    durationMs: null,
    playedAt: last.playedAt,
    recentTracks: recent.slice(1, 5).map(({ trackName, artist, uri }) => ({ trackName, artist, uri })),
    queue: [],
  };
}

export async function getNowPlaying(creds?: SpotifyCreds): Promise<NowPlaying> {
  const resolved = resolveCreds(creds);
  if (cachedNowPlaying && cachedNowPlaying.key === resolved.refreshToken && cachedNowPlaying.expiresAt > Date.now()) {
    return cachedNowPlaying.data;
  }

  const data = await fetchNowPlaying(resolved);

  cachedNowPlaying = { data, expiresAt: Date.now() + NOW_PLAYING_CACHE_TTL_MS, key: resolved.refreshToken };
  return data;
}

// ─── playback controls ────────────────────────────────────────────
// Requires the user-modify-playback-state scope (re-run `npm run
// spotify:auth` if the refresh token predates it) and Spotify Premium.
// Controls act on whatever device is currently active.

export async function controlPlayback(action: PlayerAction, uri?: string, creds?: SpotifyCreds): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await getAccessToken(resolveCreds(creds));

  let url: string;
  let method: "PUT" | "POST" = "PUT";
  let body: string | undefined;

  switch (action) {
    case "play":
      url = `${PLAYER_BASE_URL}play`;
      break;
    case "pause":
      url = `${PLAYER_BASE_URL}pause`;
      break;
    case "next":
      url = `${PLAYER_BASE_URL}next`;
      method = "POST";
      break;
    case "previous":
      url = `${PLAYER_BASE_URL}previous`;
      method = "POST";
      break;
    case "play-track":
      if (!uri) return { ok: false, error: "missing track uri" };
      url = `${PLAYER_BASE_URL}play`;
      body = JSON.stringify({ uris: [uri] });
      break;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
    cache: "no-store",
  });

  if (response.ok || response.status === 204) {
    // Bust the cache so the next poll reflects the new state immediately
    cachedNowPlaying = null;
    return { ok: true };
  }

  if (response.status === 404) return { ok: false, error: "no active spotify device" };
  if (response.status === 403) return { ok: false, error: "spotify premium required (or missing scope — re-run spotify:auth)" };
  return { ok: false, error: `spotify returned ${response.status}` };
}
