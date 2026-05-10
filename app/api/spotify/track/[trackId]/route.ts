import { NextRequest, NextResponse } from "next/server";

import {
  getOrRefreshAccessToken,
  spotifyApiRequest,
  SPOTIFY_COOKIE_ACCESS,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

type SpotifyTrackResponse = {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    images: Array<{ url: string }>;
  };
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
): Promise<NextResponse> {
  const { trackId } = await params;
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
    const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`;
    const res = await spotifyApiRequest({ accessToken, url });

    if (res.status === 404) {
      return NextResponse.json(
        { error: "Track not available" },
        { status: 404 }
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Spotify API error ${res.status}${text ? `: ${text}` : ""}`
      );
    }

    const track = (await res.json()) as SpotifyTrackResponse;
    const albumArt =
      track.album?.images?.length > 0 ? track.album.images[0]?.url ?? null : null;

    const response = NextResponse.json(
      {
        trackId: track.id,
        title: track.name,
        artist: track.artists[0]?.name ?? "",
        albumArt,
      },
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
      err instanceof Error ? err.message : "Failed to fetch track metadata";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
