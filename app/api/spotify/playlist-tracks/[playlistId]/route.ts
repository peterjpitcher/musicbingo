import { NextRequest, NextResponse } from "next/server";

import {
  getOrRefreshAccessToken,
  spotifyApiRequest,
  SPOTIFY_COOKIE_ACCESS,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

type SpotifyTrackItem = {
  track: {
    id: string | null;
    uri: string | null;
    name: string | null;
    artists: Array<{ name: string }>;
  } | null;
};

type SpotifyPlaylistTracksResponse = {
  items: SpotifyTrackItem[];
  next: string | null;
  total: number;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> }
): Promise<NextResponse> {
  const { playlistId } = await params;
  const origin = new URL(request.url).origin;
  const secure = process.env.NODE_ENV === "production";

  const refreshToken = request.cookies.get(COOKIE_REFRESH)?.value ?? "";
  if (!refreshToken.trim()) {
    return NextResponse.json(
      { error: "Not authenticated with Spotify" },
      { status: 401 }
    );
  }

  const cachedRaw = request.cookies.get(SPOTIFY_COOKIE_ACCESS)?.value ?? null;

  let tokenResult;
  try {
    tokenResult = await getOrRefreshAccessToken({
      refreshToken,
      cachedRaw,
      origin,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to refresh Spotify token" },
      { status: 401 }
    );
  }

  const { accessToken } = tokenResult;

  try {
    const tracks: Array<{
      uri: string;
      trackId: string;
      title: string;
      artist: string;
      position: number;
    }> = [];

    const fields = encodeURIComponent(
      "items(track(id,uri,name,artists(name))),next,total"
    );
    let url: string | null = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?fields=${fields}`;
    let total = 0;
    let position = 0;

    while (url) {
      const res = await spotifyApiRequest({ accessToken, url });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Spotify API error ${res.status}${text ? `: ${text}` : ""}`
        );
      }

      const page = (await res.json()) as SpotifyPlaylistTracksResponse;
      total = page.total;

      for (const item of page.items) {
        if (!item.track || !item.track.uri || !item.track.id) {
          position++;
          continue;
        }

        tracks.push({
          uri: item.track.uri,
          trackId: item.track.id,
          title: item.track.name ?? "",
          artist: item.track.artists.map((a) => a.name).join(", "),
          position,
        });
        position++;
      }

      url = page.next;
    }

    const response = NextResponse.json(
      { tracks, total },
      { headers: { "Cache-Control": "no-store" } }
    );

    if (tokenResult.newCacheValue) {
      response.cookies.set(SPOTIFY_COOKIE_ACCESS, tokenResult.newCacheValue, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        maxAge: tokenResult.newCacheMaxAge ?? 3500,
        path: "/",
      });
    }
    if (tokenResult.newRefreshToken) {
      response.cookies.set(COOKIE_REFRESH, tokenResult.newRefreshToken, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }

    return response;
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Failed to fetch playlist tracks";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
