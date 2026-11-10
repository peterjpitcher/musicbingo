import { describe, expect, test } from "vitest";

import { BROADCAST_HOLD_MS, decideBroadcast, decidePoll, NOTHING_APPLIED } from "@/lib/live/snapshotOrder";

/** The TV drops stale runtimes by version, never steps back (spec M-9, S4.4). */

describe("decidePoll", () => {
  test("applies the first poll and each newer version", () => {
    const first = decidePoll(NOTHING_APPLIED, 3, 1_000, 0);
    expect(first.apply).toBe(true);
    const next = decidePoll(first.mark, 4, 2_000, 0);
    expect(next.apply).toBe(true);
    expect(next.mark.version).toBe(4);
  });

  test("a stale version is dropped, even with a later clock", () => {
    const at5 = decidePoll(NOTHING_APPLIED, 5, 1_000, 0).mark;
    expect(decidePoll(at5, 4, 9_999_999, 0).apply).toBe(false);
  });

  test("the same version twice is applied once", () => {
    const at5 = decidePoll(NOTHING_APPLIED, 5, 1_000, 0).mark;
    expect(decidePoll(at5, 5, 1_000, 0).apply).toBe(false);
  });

  test("a poll older than a fresh same-device broadcast waits; once broadcasts stop, polls rule", () => {
    const polled = decidePoll(NOTHING_APPLIED, 5, 1_000, 0).mark;
    const broadcast = decideBroadcast(polled, 3_000, 10_000).mark;
    expect(decidePoll(broadcast, 6, 2_000, 10_000 + BROADCAST_HOLD_MS - 1).apply).toBe(false);
    expect(decidePoll(broadcast, 6, 2_000, 10_000 + BROADCAST_HOLD_MS).apply).toBe(true);
  });
});

describe("decideBroadcast", () => {
  test("applies only a newer runtime from the console", () => {
    const shown = decideBroadcast(NOTHING_APPLIED, 2_000, 0);
    expect(shown.apply).toBe(true);
    expect(decideBroadcast(shown.mark, 2_000, 1).apply).toBe(false);
    expect(decideBroadcast(shown.mark, 1_500, 1).apply).toBe(false);
    expect(decideBroadcast(shown.mark, 2_500, 1).apply).toBe(true);
  });
});
