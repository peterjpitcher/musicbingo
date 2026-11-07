/**
 * Every Route Handler in app/api, with what it does and what protects it
 * (auth standard section 6; spec M-8). lib/auth/routeRegistry.test.ts fails
 * when a route.ts on disk is missing from this list, when its exported
 * methods differ, and when any route lets an anonymous caller through.
 *
 * Protection classes:
 *   staff                   a signed-in, active host or admin; state-changing
 *                           methods must also be same-origin (lib/auth/routeGuard.ts)
 *   tv-display              the TV's own route (lib/live/displayAccess.ts):
 *                           the game's TV link token (current generation,
 *                           unexpired), a paired TV for tonight's game, or a
 *                           signed-in host or admin
 *   tv-pairing              the kit's pairing endpoint: open by design, carries
 *                           no authority (a code does nothing until active
 *                           staff type it; rate limited by the kit)
 *   display-link-token      the TV link itself: the signed token in the URL
 *   host-link-token         the host link: the signed token sets a cookie and
 *                           opens /host/[id], which then needs sign-in
 *   error-sink-bearer       server to server: ERROR_SINK_TOKEN as a bearer token
 *   cron-secret             Vercel Cron: CRON_SECRET as a bearer token
 *   public-events           the TV's events loop (spec M-7, S7.1): open by
 *                           design, read only, holds only what the pub's
 *                           website already shows (no game, token or key);
 *                           the management key stays on the server
 */

export type Protection =
  | "staff"
  | "tv-display"
  | "tv-pairing"
  | "display-link-token"
  | "host-link-token"
  | "error-sink-bearer"
  | "cron-secret"
  | "public-events";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RouteEntry {
  /** The URL path, with [param] segments as in the app folder. */
  path: string;
  methods: readonly HttpMethod[];
  protection: Protection;
  /** Who calls it. */
  caller: "staff browser" | "TV browser" | "server" | "Vercel Cron" | "Spotify redirect";
  /** What it changes, whatever the HTTP method says. */
  sideEffects: string;
}

export const ROUTE_REGISTRY: readonly RouteEntry[] = Object.freeze([
  { path: "/api/brands", methods: ["GET", "POST"], protection: "staff", caller: "staff browser", sideEffects: "POST creates a venue" },
  { path: "/api/brands/[id]", methods: ["GET", "PUT", "DELETE"], protection: "staff", caller: "staff browser", sideEffects: "PUT edits, DELETE removes a venue" },
  { path: "/api/brands/[id]/logo", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "uploads a logo to brand-assets" },
  { path: "/api/cron/auth-maintenance", methods: ["GET"], protection: "cron-secret", caller: "Vercel Cron", sideEffects: "prunes old audit rows, grants and invites; fails stuck invites (idempotent)" },
  { path: "/api/display/[id]/authorize", methods: ["GET"], protection: "display-link-token", caller: "TV browser", sideEffects: "sets the TV token cookie" },
  { path: "/api/display/[id]/snapshot", methods: ["GET"], protection: "tv-display", caller: "TV browser", sideEffects: "none (read); a paired TV's last-seen time, at most once a minute" },
  { path: "/api/errors", methods: ["GET", "POST"], protection: "error-sink-bearer", caller: "server", sideEffects: "POST stores a redacted error report; GET answers 405" },
  { path: "/api/generate", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "none stored (builds the event pack)" },
  { path: "/api/screen/events", methods: ["GET"], protection: "public-events", caller: "TV browser", sideEffects: "none (read); the upcoming events from the management app, cached for 60 seconds" },
  { path: "/api/sessions", methods: ["GET", "PUT"], protection: "staff", caller: "staff browser", sideEffects: "PUT saves a game" },
  { path: "/api/sessions/[id]", methods: ["GET", "DELETE"], protection: "staff", caller: "staff browser", sideEffects: "DELETE removes a game" },
  { path: "/api/sessions/[id]/authorize", methods: ["GET"], protection: "host-link-token", caller: "staff browser", sideEffects: "sets the host token cookie" },
  { path: "/api/sessions/[id]/brand", methods: ["PUT"], protection: "staff", caller: "staff browser", sideEffects: "changes a game's venue" },
  { path: "/api/sessions/[id]/commands", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "saves a session event and the runtime in one transaction, held to the control lock and version" },
  { path: "/api/sessions/[id]/control", methods: ["POST", "PUT", "DELETE"], protection: "staff", caller: "staff browser", sideEffects: "POST takes, PUT keeps (heartbeat), DELETE releases the console control lock" },
  { path: "/api/sessions/[id]/links", methods: ["GET", "DELETE"], protection: "staff", caller: "staff browser", sideEffects: "GET signs new host and TV links (none stored); DELETE cancels every link made so far" },
  { path: "/api/sessions/[id]/runtime", methods: ["GET", "PUT"], protection: "staff", caller: "staff browser", sideEffects: "PUT saves the live runtime, held to the control lock and version" },
  { path: "/api/sessions/import", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "saves an imported game" },
  { path: "/api/spotify/authorize", methods: ["GET"], protection: "staff", caller: "staff browser", sideEffects: "sets the OAuth state cookie" },
  { path: "/api/spotify/callback", methods: ["GET"], protection: "staff", caller: "Spotify redirect", sideEffects: "stores the Spotify refresh token cookie" },
  { path: "/api/spotify/create-playlist", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "creates Spotify playlists" },
  { path: "/api/spotify/disconnect", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "clears the Spotify cookies" },
  { path: "/api/spotify/live/command", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "controls Spotify playback" },
  { path: "/api/spotify/live/status", methods: ["GET"], protection: "staff", caller: "staff browser", sideEffects: "none (read)" },
  { path: "/api/spotify/playlist-tracks/[playlistId]", methods: ["GET"], protection: "staff", caller: "staff browser", sideEffects: "none (read)" },
  { path: "/api/spotify/playlist/[playlistId]/resolve-missing", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "adds found tracks to a Spotify playlist" },
  { path: "/api/spotify/playlist/[playlistId]/tracks", methods: ["GET"], protection: "staff", caller: "staff browser", sideEffects: "none (read)" },
  { path: "/api/spotify/resolve-track", methods: ["POST"], protection: "staff", caller: "staff browser", sideEffects: "none stored (searches Spotify)" },
  { path: "/api/spotify/status", methods: ["GET"], protection: "staff", caller: "staff browser", sideEffects: "none (read)" },
  { path: "/api/spotify/track/[trackId]", methods: ["GET"], protection: "staff", caller: "staff browser", sideEffects: "none (read)" },
  { path: "/api/tv/pairing", methods: ["GET", "POST"], protection: "tv-pairing", caller: "TV browser", sideEffects: "POST issues a pairing code (stores its hash and the IP for a day); GET polls and, once staff approved the code, pairs the TV (sets its device cookie)" },
]);
