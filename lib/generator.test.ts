import { describe, expect, it } from "vitest";

import { generateCards } from "@/lib/generator";

describe("generateCards", () => {
  it("creates 6x3 cards with one free cell per row", () => {
    const combinedPool = Array.from({ length: 60 }, (_, index) => `Item ${index + 1}`);

    const cards = generateCards({ combinedPool, count: 20, seed: "print-design" });

    expect(cards).toHaveLength(20);
    for (const card of cards) {
      expect(card.items).toHaveLength(18);
      expect(card.items.filter((item) => item === "")).toHaveLength(3);

      for (let row = 0; row < 3; row++) {
        const rowItems = card.items.slice(row * 6, row * 6 + 6);
        expect(rowItems.filter((item) => item === "")).toHaveLength(1);
        expect(rowItems.filter((item) => item !== "")).toHaveLength(5);
      }
    }
  });
});
