import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { formatEventDateDisplay } from "@/lib/eventDate";
import {
  normalizeGameTheme,
  parseGameSongsText,
} from "@/lib/gameInput";
import type { ParseResult, Song } from "@/lib/types";
import {
  getSpotifyWebConfig,
  refreshSpotifyAccessToken,
  spotifyApiRequest,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = items[i];
    items[i] = items[j] as T;
    items[j] = tmp as T;
  }
  return items;
}

async function spotifyJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const res = await spotifyApiRequest({ accessToken, url, init });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify API error ${res.status}${text ? `: ${text}` : ""}`);
  }
  return (await res.json()) as T;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

type SpotifyMeResponse = { id?: unknown };
type SpotifyPlaylistResponse = { id?: unknown; external_urls?: unknown };
type SpotifySearchResponse = {
  tracks?: {
    items?: Array<{
      uri?: unknown;
      name?: unknown;
      artists?: Array<{ name?: unknown }>;
    }>;
  };
};

type MatchedTrack = {
  uri: string;
  artist: string;
  title: string;
};

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normalizeForMatch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNoise(input: string): string {
  return input
    .replace(/\s*\((?:feat\.?|ft\.?|featuring)\b[^)]*\)\s*/gi, " ")
    .replace(/\s*(?:feat\.?|ft\.?|featuring)\b.+$/i, "")
    .replace(/\s*\[[^\]]*]\s*/g, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let prev = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    const curr = new Array<number>(m + 1);
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        (prev[j - 1] ?? 0) + cost
      );
    }
    prev = curr;
  }

  return prev[m] ?? 0;
}

function tokenJaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let intersection = 0;
  for (const t of aTokens) if (bTokens.has(t)) intersection++;
  const union = aTokens.size + bTokens.size - intersection;
  return union ? intersection / union : 0;
}

function stringSimilarity(aRaw: string, bRaw: string): number {
  const a = normalizeForMatch(aRaw);
  const b = normalizeForMatch(bRaw);
  if (!a || !b) return 0;

  const maxLen = Math.max(a.length, b.length);
  const lev = maxLen ? 1 - levenshteinDistance(a, b) / maxLen : 0;
  const jac = tokenJaccard(a, b);
  return Math.max(0, Math.min(1, Math.max(lev, jac)));
}

function titleSimilarity(input: string, candidate: string): number {
  const direct = stringSimilarity(input, candidate);
  const stripped = stringSimilarity(stripNoise(input), stripNoise(candidate));
  return Math.max(direct, stripped);
}

function artistSimilarity(inputArtist: string, candidateArtists: string[]): number {
  const input = stripNoise(inputArtist);
  if (!input.trim()) return 0;
  const candidates = candidateArtists.length ? candidateArtists : [""];
  let best = 0;
  for (const artist of candidates) {
    best = Math.max(best, stringSimilarity(input, artist));
  }
  best = Math.max(best, stringSimilarity(input, candidates.join(" ")));
  return best;
}

function combinedScore(titleScore: number, artistScore: number): number {
  return 0.65 * titleScore + 0.35 * artistScore;
}

function safeSearchTerm(raw: string): string {
  return raw.replace(/"/g, "").trim();
}

type PlaylistBuildResult = {
  playlistId: string;
  playlistName: string;
  playlistUrl: string | null;
  totalSongs: number;
  addedCount: number;
  notFoundCount: number;
  notFound: Array<{ artist: string; title: string }>;
};

async function createPlaylistForGame(params: {
  accessToken: string;
  userId: string;
  playlistName: string;
  description: string;
  songs: Song[];
}): Promise<PlaylistBuildResult> {
  const playlist = await spotifyJson<SpotifyPlaylistResponse>(
    params.accessToken,
    `https://api.spotify.com/v1/users/${encodeURIComponent(params.userId)}/playlists`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: params.playlistName,
        public: false,
        description: params.description,
      }),
    }
  );

  const playlistId = getString(playlist.id);
  const playlistUrl = getString((playlist.external_urls as any)?.spotify);
  if (!playlistId) throw new Error("Spotify API error: missing playlist id");

  const results = await mapWithConcurrency(params.songs, 5, async (song) => {
    const title = safeSearchTerm(song.title);
    const artist = safeSearchTerm(song.artist);

    const queries: Array<{ q: string; limit: number }> = [
      { q: `track:"${title}" artist:"${artist}"`, limit: 8 },
      { q: `"${title}" "${artist}"`, limit: 12 },
    ];

    type Candidate = MatchedTrack & { score: number };

    let best: Candidate | null = null;
    for (const { q, limit } of queries) {
      const queryParams = new URLSearchParams({ q, type: "track", limit: String(limit), market: "from_token" });
      const url = `https://api.spotify.com/v1/search?${queryParams.toString()}`;
      const json = await spotifyJson<SpotifySearchResponse>(params.accessToken, url);
      const items = json.tracks?.items ?? [];

      for (const item of items) {
        const uri = getString(item?.uri);
        const name = getString(item?.name);
        const artists = (Array.isArray(item?.artists) ? item.artists : [])
          .map((a) => getString(a?.name))
          .filter((v): v is string => Boolean(v));
        if (!uri || !name) continue;

        const normalScore = combinedScore(
          titleSimilarity(song.title, name),
          artistSimilarity(song.artist, artists)
        );
        const swappedScore = combinedScore(
          titleSimilarity(song.artist, name),
          artistSimilarity(song.title, artists)
        );

        const score = Math.max(normalScore, swappedScore);
        if (!best || score > best.score) {
          best = {
            uri,
            score,
            title: name,
            artist: artists.join(", ") || song.artist,
          };
        }
      }

      if (best && best.score >= 0.85) break;
    }

    if (best && best.score >= 0.62) {
      return {
        match: {
          uri: best.uri,
          artist: best.artist,
          title: best.title,
        },
      };
    }
    return { notFound: { artist: song.artist, title: song.title } };
  });

  const matchedTracks = results.flatMap((r: any) => (r?.match ? [r.match as MatchedTrack] : []));
  const notFound = results.flatMap((r: any) => (r?.notFound ? [r.notFound as { artist: string; title: string }] : []));

  shuffleInPlace(matchedTracks);
  const trackUris = matchedTracks.map((track) => track.uri);
  for (const uris of chunk(trackUris, 100)) {
    await spotifyJson(params.accessToken, `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris }),
    });
  }

  return {
    playlistId,
    playlistName: params.playlistName,
    playlistUrl,
    totalSongs: params.songs.length,
    addedCount: trackUris.length,
    notFoundCount: notFound.length,
    notFound,
  };
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const secure = process.env.NODE_ENV === "production";

  const refreshToken = request.cookies.get(COOKIE_REFRESH)?.value ?? "";
  if (!refreshToken.trim()) {
    return new Response("Spotify is not connected. Click \"Connect Spotify\" and try again.", { status: 401 });
  }

  const form = await request.formData();

  const eventDateInput = asString(form.get("event_date")).trim();
  const eventDateDisplay = formatEventDateDisplay(eventDateInput);
  const game1Theme = normalizeGameTheme(asString(form.get("game1_theme")));
  const game2Theme = normalizeGameTheme(asString(form.get("game2_theme")));

  let parsedGame1: ParseResult;
  let parsedGame2: ParseResult;
  try {
    parsedGame1 = parseGameSongsText(asString(form.get("game1_songs")), "Game 1");
    parsedGame2 = parseGameSongsText(asString(form.get("game2_songs")), "Game 2");
  } catch (err: any) {
    return new Response(err?.message ? String(err.message) : "Invalid game inputs.", { status: 400 });
  }

  let accessToken: string;
  let newRefreshToken: string | null = null;
  try {
    const cfg = getSpotifyWebConfig(origin);
    const refreshed = await refreshSpotifyAccessToken(cfg, refreshToken);
    accessToken = refreshed.accessToken;
    newRefreshToken = refreshed.refreshToken;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to refresh Spotify token.";
    return new Response(`${msg}\n\nTry clicking \"Connect Spotify\" again.`, { status: 401 });
  }

  try {
    const me = await spotifyJson<SpotifyMeResponse>(accessToken, "https://api.spotify.com/v1/me");
    const userId = getString(me.id);
    if (!userId) throw new Error("Spotify API error: missing user id");

    const dateSuffix = eventDateDisplay ? ` - ${eventDateDisplay}` : "";
    const gameInputs = [
      {
        gameNumber: 1 as const,
        theme: game1Theme,
        songs: parsedGame1.songs,
      },
      {
        gameNumber: 2 as const,
        theme: game2Theme,
        songs: parsedGame2.songs,
      },
    ];

    const playlists = [];
    for (const game of gameInputs) {
      const playlistName = `Music Bingo Game ${game.gameNumber}${dateSuffix} (${game.theme})`;
      const description = `Generated by Music Bingo. Game ${game.gameNumber}. Theme: ${game.theme}.`;

      const created = await createPlaylistForGame({
        accessToken,
        userId,
        playlistName,
        description,
        songs: game.songs,
      });

      playlists.push({
        gameNumber: game.gameNumber,
        theme: game.theme,
        ...created,
      });
    }

    const res = NextResponse.json({ playlists }, { headers: { "Cache-Control": "no-store" } });
    if (newRefreshToken) {
      res.cookies.set({
        name: COOKIE_REFRESH,
        value: newRefreshToken,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return res;
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : "Failed to create Spotify playlists.";
    return new Response(msg, { status: 500 });
  }
}
