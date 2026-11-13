import { MAX_SONGS_PER_GAME } from "@/lib/gameInput";

export type PrepSubmitInput = {
  eventDate: string;
  countInput: string;
  game1: { songCount: number; poolSize: number };
  game2: { songCount: number; poolSize: number };
};

/**
 * Whether the prep wizard can generate the pack and playlists. Challenge songs
 * and warm-up songs are optional (Peter, 13 November 2026), so neither is
 * checked here.
 */
export function canSubmitPrep(input: PrepSubmitInput): boolean {
  const count = Number.parseInt(input.countInput, 10);
  if (!input.eventDate.trim()) return false;
  if (!Number.isFinite(count) || count < 1 || count > 200) return false;
  for (const game of [input.game1, input.game2]) {
    if (game.songCount < 1 || game.songCount > MAX_SONGS_PER_GAME) return false;
    if (game.poolSize < 25) return false;
  }
  return true;
}
