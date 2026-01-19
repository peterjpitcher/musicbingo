import crypto from "node:crypto";

export const SPOTIFY_OAUTH_SCOPES = [
  "playlist-modify-private",
  "user-read-private",
] as const;

export type SpotifyWebConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function envString(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function getSpotifyWebConfig(origin: string): SpotifyWebConfig {
  const clientId = envString("SPOTIFY_CLIENT_ID");
  const clientSecret = envString("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "Spotify is not configured on the server.\n\n"
        + "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local, then restart `npm run dev`.\n"
        + "You can create these in a Spotify Developer app:\n"
        + "  https://developer.spotify.com/dashboard"
    );
  }

  const explicitRedirect = envString("SPOTIFY_WEB_REDIRECT_URI");
  const redirectUri = explicitRedirect || `${origin}/api/spotify/callback`;

  return { clientId, clientSecret, redirectUri };
}

export function makeSpotifyOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildSpotifyAuthorizeUrl(cfg: SpotifyWebConfig, state: string): string {
  const params = new URLSearchParams();
  params.set("client_id", cfg.clientId);
  params.set("response_type", "code");
  params.set("redirect_uri", cfg.redirectUri);
  params.set("scope", SPOTIFY_OAUTH_SCOPES.join(" "));
  params.set("state", state);
  params.set("show_dialog", "true");
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  error?: unknown;
  error_description?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function spotifyTokenRequest(cfg: SpotifyWebConfig, params: URLSearchParams): Promise<TokenResponse> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: params.toString(),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok) {
    const err = asString(json?.error) ?? `HTTP ${res.status}`;
    const desc = asString(json?.error_description);
    throw new Error(`Spotify token exchange failed: ${err}${desc ? ` (${desc})` : ""}`);
  }

  return json ?? {};
}

export async function exchangeSpotifyCodeForTokens(cfg: SpotifyWebConfig, code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}> {
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", cfg.redirectUri);

  const json = await spotifyTokenRequest(cfg, params);

  const accessToken = asString(json.access_token);
  if (!accessToken) throw new Error("Spotify token exchange failed: missing access token");
  const expiresIn = asNumber(json.expires_in) ?? 3600;
  const refreshToken = asString(json.refresh_token);

  return { accessToken, refreshToken, expiresIn };
}

export async function refreshSpotifyAccessToken(cfg: SpotifyWebConfig, refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}> {
  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);

  const json = await spotifyTokenRequest(cfg, params);

  const accessToken = asString(json.access_token);
  if (!accessToken) throw new Error("Spotify refresh failed: missing access token");
  const expiresIn = asNumber(json.expires_in) ?? 3600;
  const newRefreshToken = asString(json.refresh_token);

  return { accessToken, refreshToken: newRefreshToken, expiresIn };
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function spotifyApiRequest(params: {
  accessToken: string;
  url: string;
  init?: RequestInit;
  retry?: { maxAttempts?: number };
}): Promise<Response> {
  const maxAttempts = params.retry?.maxAttempts ?? 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(params.url, {
      ...params.init,
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        ...(params.init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (res.status !== 429) return res;

    const retryAfterSeconds = Number.parseInt(res.headers.get("retry-after") ?? "1", 10);
    const waitMs = Math.max(500, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 1000);
    if (attempt === maxAttempts) return res;
    await sleepMs(waitMs);
  }

  throw new Error("Spotify API request failed after retries");
}

