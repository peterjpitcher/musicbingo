import {
  DEFAULT_REVEAL_CONFIG,
  LIVE_SESSION_VERSION,
  type LiveGameConfig,
  type LiveSessionV1,
  type RevealConfig,
} from "@/lib/live/types";

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validateRevealConfig(input: unknown): RevealConfig | null {
  if (!isObject(input)) return null;

  const albumMs = asNumber(input.albumMs);
  const titleMs = asNumber(input.titleMs);
  const artistMs = asNumber(input.artistMs);
  const nextMs = asNumber(input.nextMs);

  if (
    albumMs === null
    || titleMs === null
    || artistMs === null
    || nextMs === null
    || albumMs < 0
    || titleMs < albumMs
    || artistMs < titleMs
    || nextMs < artistMs
  ) {
    return null;
  }

  return { albumMs, titleMs, artistMs, nextMs };
}

function validateGameConfig(input: unknown): LiveGameConfig | null {
  if (!isObject(input)) return null;

  const gameNumberRaw = asNumber(input.gameNumber);
  const gameNumber = gameNumberRaw === 1 || gameNumberRaw === 2 ? gameNumberRaw : null;
  const theme = asString(input.theme);
  const playlistId = asString(input.playlistId);
  const playlistName = asString(input.playlistName);
  const playlistUrl = typeof input.playlistUrl === "string" && input.playlistUrl.trim() ? input.playlistUrl.trim() : null;
  const totalSongs = asNumber(input.totalSongs);
  const addedCount = asNumber(input.addedCount);

  if (!gameNumber || !theme || !playlistId || !playlistName || totalSongs === null || addedCount === null) {
    return null;
  }

  return {
    gameNumber,
    theme,
    playlistId,
    playlistName,
    playlistUrl,
    totalSongs,
    addedCount,
    challengeSongArtist: asString(input.challengeSongArtist) ?? "",
    challengeSongTitle: asString(input.challengeSongTitle) ?? "",
  };
}

export function validateLiveSession(input: unknown): LiveSessionV1 | null {
  if (!isObject(input)) return null;

  const version = asString(input.version);
  if (version !== LIVE_SESSION_VERSION) return null;

  const id = asString(input.id);
  const name = asString(input.name);
  const createdAt = asString(input.createdAt);
  const eventDateInput = asString(input.eventDateInput);
  const eventDateDisplay = asString(input.eventDateDisplay);
  const revealConfig = validateRevealConfig(input.revealConfig) ?? DEFAULT_REVEAL_CONFIG;
  const rawGames = Array.isArray(input.games) ? input.games : [];

  const games = rawGames.map(validateGameConfig).filter((item): item is LiveGameConfig => Boolean(item));
  const game1 = games.find((game) => game.gameNumber === 1);
  const game2 = games.find((game) => game.gameNumber === 2);

  if (!id || !name || !createdAt || !eventDateInput || !eventDateDisplay || !game1 || !game2) {
    return null;
  }

  return {
    version: LIVE_SESSION_VERSION,
    id,
    name,
    createdAt,
    eventDateInput,
    eventDateDisplay,
    games: [game1, game2],
    revealConfig,
  };
}
