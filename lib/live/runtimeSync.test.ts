import { afterEach, describe, expect, test, vi } from "vitest";

import { HOST_DEVICE_HEADER } from "@/lib/live/hostDevice";
import { pushRuntimeState, readSaveOutcome, SAVE_MESSAGES, shouldRetry, syncStateFor } from "@/lib/live/runtimeSync";
import { makeEmptyRuntimeState } from "@/lib/live/types";

/** The console's saves (spec M-9): only a save that landed counts, and a failed one is shown. */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readSaveOutcome", () => {
  test("only a 200 with ok and a version is saved", () => {
    expect(readSaveOutcome(200, { ok: true, version: 5 })).toEqual({ kind: "saved", version: 5 });
    expect(readSaveOutcome(200, { ok: true })).toMatchObject({ kind: "failed" });
    expect(readSaveOutcome(200, null)).toMatchObject({ kind: "failed" });
  });

  test("each refusal keeps its reason", () => {
    expect(readSaveOutcome(404, { ok: false, reason: "missing" })).toEqual({ kind: "missing" });
    expect(readSaveOutcome(409, { ok: false, reason: "not_controller", secondsSinceSeen: 3 })).toEqual({ kind: "not_controller", secondsSinceSeen: 3 });
    expect(readSaveOutcome(409, { ok: false, reason: "conflict", version: 9 })).toEqual({ kind: "conflict", version: 9 });
    expect(readSaveOutcome(401, null)).toEqual({ kind: "signed_out", status: 401 });
    expect(readSaveOutcome(403, { ok: false, reason: "inactive" })).toEqual({ kind: "signed_out", status: 403 });
    expect(readSaveOutcome(500, { error: "Database unavailable." })).toEqual({ kind: "failed", message: "Database unavailable." });
  });
});

describe("what the host sees", () => {
  test("a failed write is shown and retried; a refusal is shown and not retried", () => {
    expect(syncStateFor({ kind: "failed", message: "x" })).toEqual({ status: "retrying", message: SAVE_MESSAGES.retrying });
    expect(shouldRetry({ kind: "failed", message: "x" })).toBe(true);

    for (const outcome of [
      { kind: "not_controller", secondsSinceSeen: 1 },
      { kind: "conflict", version: 2 },
      { kind: "missing" },
      { kind: "signed_out", status: 401 },
    ] as const) {
      expect(syncStateFor(outcome).status).toBe("refused");
      expect(shouldRetry(outcome)).toBe(false);
    }
    expect(syncStateFor({ kind: "missing" })).toMatchObject({ title: SAVE_MESSAGES.missingTitle });
    expect(syncStateFor({ kind: "saved", version: 1 })).toEqual({ status: "saved" });
  });
});

describe("pushRuntimeState", () => {
  test("sends the device id and the version it last saw, to the one atomic save route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, version: 8 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await pushRuntimeState("game-1", makeEmptyRuntimeState("game-1"), { deviceId: "dev-1", expectedVersion: 7 });
    expect(outcome).toEqual({ kind: "saved", version: 8 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/sessions/game-1/commands");
    expect((init.headers as Record<string, string>)[HOST_DEVICE_HEADER]).toBe("dev-1");
    expect(JSON.parse(String(init.body))).toMatchObject({ expectedVersion: 7, type: "runtime_snapshot" });
  });

  test("a network failure is a failed save, never a silent success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const outcome = await pushRuntimeState("game-1", makeEmptyRuntimeState("game-1"), { deviceId: "dev-1", expectedVersion: 0 });
    expect(outcome).toEqual({ kind: "failed", message: "Failed to fetch" });
  });
});
