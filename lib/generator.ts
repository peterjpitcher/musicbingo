import crypto from "node:crypto";
import seedrandom from "seedrandom";

import type { Card } from "@/lib/types";

type GenerateCardsParams = {
  combinedPool: string[];
  count: number;
  seed?: string;
  maxAttemptsPerCard?: number;
};

const COLS = 5;
const ROWS = 3;
const CELLS = COLS * ROWS; // 15
const FILLED_PER_ROW = COLS - 1; // 4
const FILLED_PER_CARD = ROWS * FILLED_PER_ROW; // 12
const MIN_POOL_SIZE = 25;

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

function hashSignature(items: readonly string[]): string {
  const sig = items.join("\n");
  return crypto.createHash("sha256").update(sig, "utf8").digest("hex");
}

function blankIndicesDistinctColumns(rng: () => number): number[] {
  const cols = sampleWithoutReplacement([0, 1, 2, 3, 4], ROWS, rng);
  const blanks: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    blanks.push(row * COLS + cols[row]);
  }
  return blanks;
}

function fillGrid(params: {
  pool: readonly string[];
  blankIndices: number[];
  rng: () => number;
}): string[] {
  const blankSet = new Set<number>(params.blankIndices);
  const sampled = sampleWithoutReplacement(params.pool, FILLED_PER_CARD, params.rng);

  const grid = Array.from({ length: CELLS }, () => "");
  let j = 0;
  for (let i = 0; i < CELLS; i++) {
    if (blankSet.has(i)) continue;
    grid[i] = sampled[j] ?? "";
    j++;
  }
  return grid;
}

export function generateCards(params: GenerateCardsParams): Card[] {
  const { combinedPool, count } = params;
  const maxAttemptsPerCard = params.maxAttemptsPerCard ?? 1000;

  if (combinedPool.length < MIN_POOL_SIZE) {
    throw new Error(`Need at least ${MIN_POOL_SIZE} unique items in combined pool, got ${combinedPool.length}`);
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
      const blankIndices = blankIndicesDistinctColumns(rng);
      const items = fillGrid({ pool: combinedPool, blankIndices, rng });
      const hash = hashSignature(items);
      if (seen.has(hash)) continue;
      seen.add(hash);
      created = { items, cardId: hash.slice(0, 10) };
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
