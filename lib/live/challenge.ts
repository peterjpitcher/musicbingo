import { getChallengeSongs, type LiveGameConfig } from "@/lib/live/types";

type ChallengeType = "sing-along" | "dance-along";

function normalizeComparable(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVersionText(input: string): string {
  return input
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*]\s*/g, " ")
    .replace(/\s+-\s*(?:radio edit|single version|remaster(?:ed)?(?:\s+\d{2,4})?|album version)\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableVariants(input: string): string[] {
  const variants = [normalizeComparable(input), normalizeComparable(stripVersionText(input))]
    .filter(Boolean);
  return [...new Set(variants)];
}

function fuzzyContains(left: string, right: string): boolean {
  const leftVariants = comparableVariants(left);
  const rightVariants = comparableVariants(right);

  return leftVariants.some((leftVariant) =>
    rightVariants.some((rightVariant) =>
      leftVariant.includes(rightVariant) || rightVariant.includes(leftVariant)
    )
  );
}

function fieldsMatch(track: { title: string; artist: string }, challenge: { title: string; artist: string }): boolean {
  return fuzzyContains(track.title, challenge.title) && fuzzyContains(track.artist, challenge.artist);
}

function swappedFieldsMatch(track: { title: string; artist: string }, challenge: { title: string; artist: string }): boolean {
  return fuzzyContains(track.title, challenge.artist) && fuzzyContains(track.artist, challenge.title);
}

/** Returns the matching challenge song type, or null if no challenge song matches. */
export function matchChallengeSong(
  track: { title: string; artist: string } | null,
  game: LiveGameConfig | null | undefined
): ChallengeType | null {
  if (!track || !game) return null;
  const songs = getChallengeSongs(game);
  if (songs.length === 0) return null;

  const normalMatch = songs.find((song) => fieldsMatch(track, song));
  if (normalMatch) return normalMatch.type;

  const swappedMatch = songs.find((song) => swappedFieldsMatch(track, song));
  return swappedMatch?.type ?? null;
}
