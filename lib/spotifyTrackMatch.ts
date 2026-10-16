// Scores Spotify search results against a line from a prep song list. The
// playlist builder (app/api/spotify/create-playlist) searches up to twice per
// song, keeps the best-scoring track and adds it at MATCH_ACCEPT_SCORE or above.

export const MATCH_ACCEPT_SCORE = 0.62;
/** A match this strong skips the broader second search. */
export const MATCH_CONFIDENT_SCORE = 0.85;

export type TrackCandidate = {
  uri: string;
  name: string;
  artists: string[];
};

export type ScoredTrackCandidate = TrackCandidate & { score: number };

export function normalizeForMatch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNoise(input: string): string {
  return input
    .replace(/\s*\((?:feat\.?|ft\.?|featuring)\b[^)]*\)\s*/gi, " ")
    .replace(/\s*(?:feat\.?|ft\.?|featuring)\b.+$/i, "")
    .replace(/\s*\[[^\]]*]\s*/g, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Spotify puts version labels after a spaced hyphen ("Help! - Remastered 2009",
// "Waves - Robin Schulz Radio Edit"). Hyphens inside a title have no spaces round them.
function stripDashSuffix(input: string): string {
  return input.replace(/\s+-\s+.*$/, "").trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let prev = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    const curr = new Array<number>(m + 1);
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        (prev[j - 1] ?? 0) + cost
      );
    }
    prev = curr;
  }

  return prev[m] ?? 0;
}

function tokenJaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let intersection = 0;
  for (const t of aTokens) if (bTokens.has(t)) intersection++;
  const union = aTokens.size + bTokens.size - intersection;
  return union ? intersection / union : 0;
}

export function stringSimilarity(aRaw: string, bRaw: string): number {
  const a = normalizeForMatch(aRaw);
  const b = normalizeForMatch(bRaw);
  if (!a || !b) return 0;

  const maxLen = Math.max(a.length, b.length);
  const lev = maxLen ? 1 - levenshteinDistance(a, b) / maxLen : 0;
  const jac = tokenJaccard(a, b);
  return Math.max(0, Math.min(1, Math.max(lev, jac)));
}

export function titleSimilarity(input: string, candidate: string): number {
  const direct = stringSimilarity(input, candidate);
  const stripped = stringSimilarity(stripNoise(input), stripNoise(candidate));
  const withoutSuffix = stringSimilarity(stripNoise(input), stripDashSuffix(stripNoise(candidate)));
  return Math.max(direct, stripped, withoutSuffix);
}

function artistSimilarity(inputArtist: string, candidateArtists: string[]): number {
  const input = stripNoise(inputArtist);
  if (!input.trim()) return 0;
  const candidates = candidateArtists.length ? candidateArtists : [""];
  let best = 0;
  for (const artist of candidates) {
    best = Math.max(best, stringSimilarity(input, artist));
  }
  best = Math.max(best, stringSimilarity(input, candidates.join(" ")));
  return best;
}

function combinedScore(titleScore: number, artistScore: number): number {
  return 0.65 * titleScore + 0.35 * artistScore;
}

/** Scores a track against a list line, also trying the line as typed title first. */
export function scoreTrackCandidate(
  song: { artist: string; title: string },
  candidate: Pick<TrackCandidate, "name" | "artists">
): number {
  const normalScore = combinedScore(
    titleSimilarity(song.title, candidate.name),
    artistSimilarity(song.artist, candidate.artists)
  );
  const swappedScore = combinedScore(
    titleSimilarity(song.artist, candidate.name),
    artistSimilarity(song.title, candidate.artists)
  );
  return Math.max(normalScore, swappedScore);
}

/**
 * Folds one page of search results into the best match found so far. Of two
 * equally scored tracks the earlier one is kept.
 */
export function pickBestCandidate(
  song: { artist: string; title: string },
  candidates: TrackCandidate[],
  best: ScoredTrackCandidate | null
): ScoredTrackCandidate | null {
  let result = best;
  for (const candidate of candidates) {
    const score = scoreTrackCandidate(song, candidate);
    if (!result || score > result.score) result = { ...candidate, score };
  }
  return result;
}
