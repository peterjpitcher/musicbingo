import { NextRequest, NextResponse } from "next/server";
import {
  getSpotifyWebConfig,
  refreshSpotifyAccessToken,
  parseSpotifyTrackUrl,
  getTrackMetadata,
} from "@/lib/spotifyWeb";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Resolves a pasted Spotify track link into a stable identifier plus display
 * metadata for the Welcome (idle) screen's song line. No playlist is involved.
 *
 * Body: { url: string } — accepts `open.spotify.com/track/{id}` or `spotify:track:{id}`.
 * Returns: { trackId, uri, title, artist }.
 *
 * Auth/refresh mirrors resolve-missing: all non-200 responses use JSON { error }
 * so the host UI (which reads res.json().error) can surface the real reason.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  const secure = process.env.NODE_ENV === "production";

  // --- Auth: require the refresh-token cookie ---
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

  const url =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).url
      : undefined;
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json(
      { error: 'Body must be JSON with a "url" string.' },
      { status: 400 },
    );
  }

  // --- Extract and validate the track ID from the pasted URL or URI ---
  const parsed = parseSpotifyTrackUrl(url);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { trackId } = parsed;
  // Validate track ID: must be a 22-character base62 string.
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) {
    return NextResponse.json(
      { error: `Invalid track ID "${trackId}" — expected a 22-character base62 string.` },
      { status: 400 },
    );
  }

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

  // --- Confirm the track exists on Spotify and fetch its metadata ---
  let metadata: { trackId: string; title: string; artist: string };
  try {
    const fetched = await getTrackMetadata(accessToken, trackId);
    metadata = { trackId: fetched.trackId, title: fetched.title, artist: fetched.artist };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Track not found on Spotify.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // --- Build response, refreshing the cookie if the token rotated ---
  const nextRes = NextResponse.json(
    {
      trackId: metadata.trackId,
      uri: `spotify:track:${metadata.trackId}`,
      title: metadata.title,
      artist: metadata.artist,
    },
    { headers: { "Cache-Control": "no-store" } },
  );

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
