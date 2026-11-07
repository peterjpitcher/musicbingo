import { describe, expect, test } from "vitest";

import {
  canTakeOver,
  hostControlReducer,
  INITIAL_HOST_CONTROL,
  secondsUntilTakeover,
  TAKEOVER_AFTER_S,
} from "@/lib/live/hostControl";

/** The console's view of the server-held control lock (spec M-9, S4.3). */

describe("hostControlReducer", () => {
  test("starts checking, and holds once the server grants control", () => {
    expect(INITIAL_HOST_CONTROL.status).toBe("checking");
    const held = hostControlReducer(INITIAL_HOST_CONTROL, { type: "held", version: 7 });
    expect(held).toMatchObject({ status: "held", serverVersion: 7, error: null });
  });

  test("a refusal is lost control, whatever the console thought before", () => {
    const held = hostControlReducer(INITIAL_HOST_CONTROL, { type: "held", version: 1 });
    const lost = hostControlReducer(held, { type: "refused", secondsSinceSeen: 4, version: null, at: 1_000 });
    expect(lost).toMatchObject({ status: "lost", holderSilentFor: 4, observedAt: 1_000 });
  });

  test("a request that failed outright keeps the status and records the error", () => {
    const held = hostControlReducer(INITIAL_HOST_CONTROL, { type: "held", version: 1 });
    const failed = hostControlReducer(held, { type: "failed", error: "offline" });
    expect(failed).toMatchObject({ status: "held", error: "offline" });
  });
});

describe("takeover after 30 seconds without contact", () => {
  const lost = hostControlReducer(INITIAL_HOST_CONTROL, { type: "refused", secondsSinceSeen: 10, version: null, at: 0 });

  test("is not offered while the holder was heard from in the last 30 seconds", () => {
    expect(canTakeOver(lost, 0)).toBe(false);
    expect(secondsUntilTakeover(lost, 0)).toBe(20);
    expect(canTakeOver(lost, 19_000)).toBe(false);
    expect(secondsUntilTakeover(lost, 19_500)).toBe(1);
  });

  test("is offered from 30 seconds of silence", () => {
    expect(canTakeOver(lost, 20_000)).toBe(true);
    expect(secondsUntilTakeover(lost, 25_000)).toBe(0);
  });

  test("never while this console holds control, or before the server has said", () => {
    const held = hostControlReducer(INITIAL_HOST_CONTROL, { type: "held", version: 1 });
    expect(canTakeOver(held, 60_000)).toBe(false);
    expect(canTakeOver(INITIAL_HOST_CONTROL, 60_000)).toBe(false);
    const unknown = hostControlReducer(INITIAL_HOST_CONTROL, { type: "refused", secondsSinceSeen: null, version: null, at: 0 });
    expect(canTakeOver(unknown, 60_000)).toBe(false);
    expect(TAKEOVER_AFTER_S).toBe(30);
  });
});
