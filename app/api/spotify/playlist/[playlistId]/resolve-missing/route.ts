import { NextRequest, NextResponse } from "next/server";
import {
  getSpotifyWebConfig,
  refreshSpotifyAccessToken,
  spotifyApiRequest,
  parseSpotifyTrackUrl,
  getTrackMetadata,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Resolution = {
  artist: string;
  title: string;
  spotifyTrackUrl: string;
};

type ResolvedTrack = {
  artist: string;
  title: string;
  trackId: string;
};

type FailedTrack = {
  artist: string;
  title: string;
  error: string;
};

type RouteParams = {
  params: Promise<{ playlistId: string }>;
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
  const { playlistId } = await params;
  const origin = new URL(request.url).origin;
  const secure = process.env.NODE_ENV === "production";

  // --- Auth: require the refresh-token cookie ---
  // All non-200 responses use JSON { error } so the client (which reads
  // res.json().error) can surface the real reason instead of a generic code.
  const refreshToken = request.cookies.get(COOKIE_REFRESH)?.value ?? "";
  if (!refreshToken.trim()) {
    return NextResponse.json(
      { error: 'Spotify is not connected. Click "Connect Spotify" and try again.' },
      { status: 401 },
    );
  }

  // --- Parse and validate request body ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !Array.isArray((body as Record<string, unknown>).resolutions)
  ) {
    return NextResponse.json(
      { error: 'Body must be JSON with a "resolutions" array.' },
      { status: 400 },
    );
  }

  const resolutions = (body as { resolutions: unknown[] }).resolutions;

  // Validate each resolution entry
  for (let i = 0; i < resolutions.length; i++) {
    const item = resolutions[i];
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).artist !== "string" ||
      typeof (item as Record<string, unknown>).title !== "string" ||
      typeof (item as Record<string, unknown>).spotifyTrackUrl !== "string"
    ) {
      return NextResponse.json(
        { error: `resolutions[${i}] must have string fields: artist, title, spotifyTrackUrl.` },
        { status: 400 },
      );
    }
  }

  const typedResolutions = resolutions as Resolution[];

  // --- Obtain a fresh access token ---
  let accessToken: string;
  let newRefreshToken: string | null = null;
  try {
    const cfg = getSpotifyWebConfig(origin);
    const refreshed = await refreshSpotifyAccessToken(cfg, refreshToken);
    accessToken = refreshed.accessToken;
    newRefreshToken = refreshed.refreshToken;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to refresh Spotify token.";
    return NextResponse.json(
      { error: `${msg}\n\nTry clicking "Connect Spotify" again.` },
      { status: 401 },
    );
  }

  // --- Process each resolution ---
  const resolved: ResolvedTrack[] = [];
  const failed: FailedTrack[] = [];

  for (const resolution of typedResolutions) {
    const { artist, title, spotifyTrackUrl } = resolution;

    // Extract and validate the track ID from the pasted URL or URI
    const parsed = parseSpotifyTrackUrl(spotifyTrackUrl);
    if ("error" in parsed) {
      failed.push({ artist, title, error: parsed.error });
      continue;
    }

    const { trackId } = parsed;

    // Validate track ID: must be a 22-character base62 string
    if (!/^[A-Za-z0-9]{22}$/.test(trackId)) {
      failed.push({
        artist,
        title,
        error: `Invalid track ID "${trackId}" — expected a 22-character base62 string.`,
      });
      continue;
    }

    // Confirm the track exists on Spotify
    try {
      await getTrackMetadata(accessToken, trackId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Track not found on Spotify.";
      failed.push({ artist, title, error: msg });
      continue;
    }

    // Add the track to the playlist
    const addUrl = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`;
    const addRes = await spotifyApiRequest({
      accessToken,
      url: addUrl,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
      },
    });

    if (!addRes.ok) {
      failed.push({
        artist,
        title,
        error: `Spotify returned HTTP ${addRes.status} when adding track to playlist.`,
      });
      continue;
    }

    resolved.push({ artist, title, trackId });
  }

  // --- Build response, refreshing the cookie if the token rotated ---
  const responseBody = { resolved, failed };
  const nextRes = NextResponse.json(responseBody, {
    headers: { "Cache-Control": "no-store" },
  });

  if (newRefreshToken) {
    nextRes.cookies.set({
      name: COOKIE_REFRESH,
      value: newRefreshToken,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return nextRes;
}
