import crypto from "node:crypto";
import seedrandom from "seedrandom";

import type { Card } from "@/lib/types";

type GenerateCardsParams = {
  uniqueArtists: string[];
  uniqueTitles: string[];
  count: number;
  seed?: string;
  maxAttemptsPerCard?: number;
};

function makeRng(seed?: string): () => number {
  if (seed && seed.trim()) return seedrandom(seed.trim());
  return Math.random;
}

function sampleWithoutReplacement<T>(arr: readonly T[], k: number, rng: () => number): T[] {
  if (k > arr.length) throw new Error("sample size exceeds population");
  const copy = arr.slice();
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

function hashSignature(artists: readonly string[], titles: readonly string[]): string {
  const sig = `${artists.join("\n")}\n---\n${titles.join("\n")}`;
  return crypto.createHash("sha256").update(sig, "utf8").digest("hex");
}

function blankIndicesOnePerRowAndColumn(rng: () => number): number[] {
  const cols = sampleWithoutReplacement([0, 1, 2, 3, 4], 5, rng); // permutation
  const blanks: number[] = [];
  for (let row = 0; row < 5; row++) {
    blanks.push(row * 5 + cols[row]);
  }
  return blanks;
}

function fillGridWithBlanks(params: {
  items: string[];
  blankIndices: number[];
  rng: () => number;
}): string[] {
  const blankSet = new Set<number>(params.blankIndices);
  const filledCount = 25 - blankSet.size;
  const sampled = sampleWithoutReplacement(params.items, filledCount, params.rng);

  const grid = Array.from({ length: 25 }, () => "");
  let j = 0;
  for (let i = 0; i < 25; i++) {
    if (blankSet.has(i)) continue;
    grid[i] = sampled[j] ?? "";
    j++;
  }
  return grid;
}

export function generateCards(params: GenerateCardsParams): Card[] {
  const { uniqueArtists, uniqueTitles, count } = params;
  const maxAttemptsPerCard = params.maxAttemptsPerCard ?? 1000;

  if (uniqueArtists.length < 25) {
    throw new Error(`Need at least 25 unique artists, got ${uniqueArtists.length}`);
  }
  if (uniqueTitles.length < 25) {
    throw new Error(`Need at least 25 unique titles, got ${uniqueTitles.length}`);
  }
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("count must be a positive number");
  }

  const rng = makeRng(params.seed);
  const seen = new Set<string>();
  const cards: Card[] = [];

  for (let i = 0; i < count; i++) {
    let created: Card | null = null;
    for (let attempt = 0; attempt < maxAttemptsPerCard; attempt++) {
      // Blank squares: ensure each row/column has at least 4 filled cells (max 1 blank per row/column).
      const blanksArtists = blankIndicesOnePerRowAndColumn(rng);
      const blanksTitles = blankIndicesOnePerRowAndColumn(rng);

      const artists = fillGridWithBlanks({ items: uniqueArtists, blankIndices: blanksArtists, rng });
      const titles = fillGridWithBlanks({ items: uniqueTitles, blankIndices: blanksTitles, rng });
      const hash = hashSignature(artists, titles);
      if (seen.has(hash)) continue;
      seen.add(hash);
      created = { artists, titles, cardId: hash.slice(0, 10) };
      break;
    }
    if (!created) {
      throw new Error(
        "Unable to generate a unique card set. Try increasing your song list or using fewer cards."
      );
    }
    cards.push(created);
  }

  return cards;
}
