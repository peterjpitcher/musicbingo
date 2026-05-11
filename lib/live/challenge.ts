import { getChallengeSongs, type LiveGameConfig } from "@/lib/live/types";

export function matchChallengeSong(
  track: { title: string; artist: string } | null,
  game: LiveGameConfig | null | undefined
): 'sing-along' | 'dance-along' | null {
  if (!track || !game) return null;
  const songs = getChallengeSongs(game);
  if (songs.length === 0) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  const t = norm(track.title);
  const a = norm(track.artist);
  if (!t || !a) return null;
  const match = songs.find((cs) => {
    const ct = norm(cs.title);
    const ca = norm(cs.artist);
    if (!ct || !ca) return false;
    return (t.includes(ct) || ct.includes(t)) && (a.includes(ca) || ca.includes(a));
  });
  return match?.type ?? null;
}
