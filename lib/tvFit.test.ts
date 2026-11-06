import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fitsInCanvas } from "./tvFit";

type Rect = { top: number; bottom: number; width: number; height: number };

/** A column `height` canvas pixels tall, drawn at `scale`, holding children at canvas positions. */
function column(height: number, scale: number, children: Array<{ top: number; bottom: number }>): HTMLElement {
  const top = 100;
  const rect = (r: { top: number; bottom: number }): Rect => ({
    top: top + r.top * scale,
    bottom: top + r.bottom * scale,
    width: 100,
    height: (r.bottom - r.top) * scale,
  });
  const kids = children.map((child) => ({ getBoundingClientRect: () => rect(child) }));
  return {
    clientHeight: height,
    offsetHeight: height,
    getBoundingClientRect: () => rect({ top: 0, bottom: height }),
    querySelectorAll: () => kids,
  } as unknown as HTMLElement;
}

describe("fitsInCanvas", () => {
  beforeEach(() => {
    vi.stubGlobal("getComputedStyle", () => ({ paddingBottom: "0px" }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("content inside the column fits at any Stage scale", () => {
    for (const scale of [0.5, 1, 2]) {
      expect(fitsInCanvas(column(900, scale, [{ top: 100, bottom: 850 }]))).toBe(true);
    }
  });

  test("content running past the bottom does not fit, at any Stage scale", () => {
    for (const scale of [0.5, 1, 2]) {
      expect(fitsInCanvas(column(900, scale, [{ top: 100, bottom: 960 }]))).toBe(false);
    }
  });

  test("content pushed above the top by centring does not fit", () => {
    expect(fitsInCanvas(column(900, 0.5, [{ top: -40, bottom: 880 }]))).toBe(false);
  });

  test("a column not laid out yet counts as fitting", () => {
    expect(fitsInCanvas(column(0, 1, [{ top: 0, bottom: 50 }]))).toBe(true);
  });
});
