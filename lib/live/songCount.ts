import type { LiveGameConfig, LiveSessionV1 } from "@/lib/live/types";

/**
 * How many songs a game has: the tracks that made it onto its Spotify
 * playlist (`addedCount`), else the songs typed into prep (`totalSongs`).
 * The intro song is not counted: prep pastes it as its own Spotify link, so
 * it is never on the game playlist. 0 when the game is unknown.
 */
export function gameSongTotal(
  session: Pick<LiveSessionV1, "games"> | null | undefined,
  gameNumber: 1 | 2 | null | undefined,
): number {
  if (!session || !gameNumber) return 0;
  const game: LiveGameConfig | undefined = session.games.find((item) => item.gameNumber === gameNumber);
  if (!game) return 0;
  const count = game.addedCount > 0 ? game.addedCount : game.totalSongs;
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export type SongCount = { played: number; left: number };

/**
 * The game screens' "played" and "left" numbers (Peter, 13 November 2026).
 * `played` is the game's played-song list, the same count the Bingo Claim
 * screen shows, so it includes the song now playing. `left` never goes below
 * 0 (a host can play past the end of the playlist). Null when the game's
 * size is unknown, so the screen shows nothing rather than a wrong number.
 */
export function songCount(playedCount: number, total: number): SongCount | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  const played = Number.isFinite(playedCount) && playedCount > 0 ? Math.floor(playedCount) : 0;
  return { played, left: Math.max(0, Math.floor(total) - played) };
}
