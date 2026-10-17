/**
 * Orders an event pack's songs (run sheet and host clipboard) to match the
 * game's Spotify playlist. app/api/generate fetches the playlist tracks and
 * passes them to sortSongsBySpotifyOrder.
 */

import type { Song } from "@/lib/types";

export type SpotifyTrack = { trackId: string; title: string; artist: string };

function normalizeTrackText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripTrackNoise(value: string): string {
  return value
    .replace(/\s*\((?:feat\.?|ft\.?|featuring)\b[^)]*\)\s*/gi, " ")
    .replace(/\s*(?:feat\.?|ft\.?|featuring)\b.+$/i, "")
    .replace(/\s*\[[^\]]*]\s*/g, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  const union = aTokens.size + bTokens.size - intersection;
  return union ? intersection / union : 0;
}

function trackTextScore(input: string, candidate: string): number {
  const inputNorm = normalizeTrackText(input);
  const candidateNorm = normalizeTrackText(candidate);
  if (!inputNorm || !candidateNorm) return 0;
  if (inputNorm === candidateNorm) return 1;
  if (inputNorm.includes(candidateNorm) || candidateNorm.includes(inputNorm)) return 0.9;

  const strippedInput = normalizeTrackText(stripTrackNoise(input));
  const strippedCandidate = normalizeTrackText(stripTrackNoise(candidate));
  if (strippedInput && strippedCandidate) {
    if (strippedInput === strippedCandidate) return 0.95;
    if (strippedInput.includes(strippedCandidate) || strippedCandidate.includes(strippedInput)) return 0.85;
  }

  return tokenOverlapScore(strippedInput || inputNorm, strippedCandidate || candidateNorm);
}

function spotifyOrderScore(song: Song, track: SpotifyTrack): number {
  return 0.65 * trackTextScore(song.title, track.title)
    + 0.35 * trackTextScore(song.artist, track.artist);
}

/**
 * Sort songs to match Spotify playlist order using normalised artist+title key matching.
 * Songs with no Spotify match are appended at the end in their original relative order.
 * The returned array always contains all input songs, so the count is always preserved.
 */
export function sortSongsBySpotifyOrder(songs: Song[], spotifyTracks: SpotifyTrack[] | null): Song[] {
  if (!spotifyTracks || spotifyTracks.length === 0) return songs;

  const unusedTrackIndexes = new Set(spotifyTracks.map((_, index) => index));
  const ordered = songs.map((song, originalIndex) => {
    let bestIndex = Infinity;
    let bestScore = 0;

    for (const trackIndex of unusedTrackIndexes) {
      const track = spotifyTracks[trackIndex];
      if (!track) continue;
      const score = spotifyOrderScore(song, track);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = trackIndex;
      }
    }

    if (bestScore >= 0.72 && Number.isFinite(bestIndex)) {
      unusedTrackIndexes.delete(bestIndex);
      return { song, originalIndex, spotifyIndex: bestIndex };
    }

    return { song, originalIndex, spotifyIndex: Infinity };
  });

  return ordered
    .sort((a, b) => {
      if (a.spotifyIndex !== b.spotifyIndex) return a.spotifyIndex - b.spotifyIndex;
      return a.originalIndex - b.originalIndex;
    })
    .map((item) => item.song);
}
