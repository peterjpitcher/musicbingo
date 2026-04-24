import { NextRequest, NextResponse } from "next/server";

import { spotifyApiRequest, SPOTIFY_COOKIE_ACCESS, getOrRefreshAccessToken, type GetOrRefreshTokenResult } from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

function unauthorized(message: string): Response {
  return new Response(message, { status: 401, headers: { "Cache-Control": "no-store" } });
}

function applyTokenCookies(
  response: NextResponse,
  tokenResult: GetOrRefreshTokenResult,
  secure: boolean
): void {
  if (tokenResult.newRefreshToken) {
    response.cookies.set({ name: COOKIE_REFRESH, value: tokenResult.newRefreshToken, httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  if (tokenResult.newCacheValue && tokenResult.newCacheMaxAge) {
    response.cookies.set({ name: SPOTIFY_COOKIE_ACCESS, value: tokenResult.newCacheValue, httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: tokenResult.newCacheMaxAge });
  }
}

export type PlaylistTrack = {
  trackId: string;
  title: string;
  artist: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> }
) {
  const { playlistId } = await params;
  const origin = new URL(request.url).origin;
  const secure = process.env.NODE_ENV === "production";

  const refreshToken = request.cookies.get(COOKIE_REFRESH)?.value ?? "";
  if (!refreshToken.trim()) {
    return unauthorized("Spotify is not connected.");
  }

  let tokenResult: GetOrRefreshTokenResult;
  try {
    tokenResult = await getOrRefreshAccessToken({
      refreshToken,
      cachedRaw: request.cookies.get(SPOTIFY_COOKIE_ACCESS)?.value ?? null,
      origin,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to refresh Spotify token.";
    return unauthorized(msg);
  }

  const { accessToken } = tokenResult;

  // Fetch up to 100 tracks from the playlist. Bingo playlists are typically 50 tracks.
  const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?fields=items(track(id,name,artists(name)))&limit=100`;
  const res = await spotifyApiRequest({ accessToken, url });

  if (res.status === 401) return unauthorized("Spotify session expired. Reconnect and try again.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return new Response(text || `Spotify API error (HTTP ${res.status})`, { status: res.status });
  }

  const json = (await res.json()) as { items?: unknown[] };
  const tracks: PlaylistTrack[] = (json.items ?? [])
    .map((item: unknown) => {
      const t = (item as any)?.track;
      if (!t || typeof t.id !== "string") return null;
      const artist = Array.isArray(t.artists) && t.artists.length > 0
        ? String(t.artists[0]?.name ?? "")
        : "";
      return { trackId: t.id, title: String(t.name ?? ""), artist };
    })
    .filter((t): t is PlaylistTrack => t !== null);

  const response = NextResponse.json({ tracks }, { headers: { "Cache-Control": "no-store" } });
  applyTokenCookies(response, tokenResult, secure);
  return response;
}
