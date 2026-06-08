import {
  DEFAULT_CHALLENGE_BONUS_POINTS,
  DEFAULT_REVEAL_CONFIG,
  LIVE_SESSION_VERSION,
  sanitizeChallengeBonusPoints,
  type LiveGameConfig,
  type LiveSessionV1,
  type PrepData,
  type RevealConfig,
} from "@/lib/live/types";
import { sanitizeContent, normalizeVariant } from "@/lib/live/content";

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateRevealConfig(input: unknown): RevealConfig | null {
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
    challengeBonusPoints: sanitizeChallengeBonusPoints(asNumber(input.challengeBonusPoints) ?? DEFAULT_CHALLENGE_BONUS_POINTS),
    ...(Array.isArray(input.challengeSongs) ? {
      challengeSongs: (input.challengeSongs as unknown[])
        .filter((cs): cs is Record<string, unknown> => isObject(cs))
        .map(cs => ({ artist: asString(cs.artist) ?? "", title: asString(cs.title) ?? "", type: asString(cs.type) === "dance-along" ? "dance-along" as const : "sing-along" as const }))
        .filter(cs => cs.artist && cs.title),
    } : {}),
    ...(asString(input.introSongArtist) ? { introSongArtist: asString(input.introSongArtist)! } : {}),
    ...(asString(input.introSongTitle) ? { introSongTitle: asString(input.introSongTitle)! } : {}),
    ...(Array.isArray(input.introSongs) ? {
      introSongs: (input.introSongs as unknown[])
        .filter((entry): entry is Record<string, unknown> => isObject(entry))
        .map(entry => ({
          type: asString(entry.type) === "dance-along" ? "dance-along" as const : "sing-along" as const,
          spotifyUrl: asString(entry.spotifyUrl) ?? "",
          trackId: asString(entry.trackId) ?? "",
          artist: asString(entry.artist) ?? "",
          title: asString(entry.title) ?? "",
        }))
        .filter(entry => entry.trackId && entry.artist && entry.title),
    } : {}),
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

  const prepData = validatePrepData(input.prepData);

  const brandId = asString(input.brandId);
  const content = sanitizeContent(input.content);
  const welcomeVariant = normalizeVariant(input.welcomeVariant);
  const titleVariant = normalizeVariant(input.titleVariant);

  return {
    version: LIVE_SESSION_VERSION,
    id,
    name,
    createdAt,
    eventDateInput,
    eventDateDisplay,
    games: [game1, game2],
    revealConfig,
    breakPlaylistId: asString(input.breakPlaylistId) ?? "",
    ...(prepData ? { prepData } : {}),
    ...(brandId ? { brandId } : {}),
    ...(Object.keys(content).length ? { content } : {}),
    ...(welcomeVariant ? { welcomeVariant } : {}),
    ...(titleVariant ? { titleVariant } : {}),
  };
}

function validatePrepData(input: unknown): PrepData | null {
  if (!isObject(input)) return null;

  const game1SongsText = asString(input.game1SongsText);
  const game2SongsText = asString(input.game2SongsText);
  const game1Theme = asString(input.game1Theme);
  const game2Theme = asString(input.game2Theme);
  const game1ChallengeSong = asString(input.game1ChallengeSong);
  const game2ChallengeSong = asString(input.game2ChallengeSong);
  const cardCount = asNumber(input.cardCount);
  const game1ChallengeBonusPoints = asNumber(input.game1ChallengeBonusPoints);
  const game2ChallengeBonusPoints = asNumber(input.game2ChallengeBonusPoints);

  if (!game1SongsText || !game2SongsText || !game1Theme || !game2Theme || !game1ChallengeSong || !game2ChallengeSong || cardCount === null || cardCount < 1) {
    return null;
  }

  return {
    game1SongsText, game2SongsText, game1Theme, game2Theme, game1ChallengeSong, game2ChallengeSong, cardCount,
    ...(Array.isArray(input.game1ChallengeSongs) ? {
      game1ChallengeSongs: (input.game1ChallengeSongs as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0).map(s => (s as string).trim()),
    } : {}),
    ...(Array.isArray(input.game2ChallengeSongs) ? {
      game2ChallengeSongs: (input.game2ChallengeSongs as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0).map(s => (s as string).trim()),
    } : {}),
    ...(game1ChallengeBonusPoints !== null ? {
      game1ChallengeBonusPoints: sanitizeChallengeBonusPoints(game1ChallengeBonusPoints),
    } : {}),
    ...(game2ChallengeBonusPoints !== null ? {
      game2ChallengeBonusPoints: sanitizeChallengeBonusPoints(game2ChallengeBonusPoints),
    } : {}),
    ...(asString(input.game1IntroSong) ? { game1IntroSong: asString(input.game1IntroSong)! } : {}),
    ...(asString(input.game2IntroSong) ? { game2IntroSong: asString(input.game2IntroSong)! } : {}),
  };
}
