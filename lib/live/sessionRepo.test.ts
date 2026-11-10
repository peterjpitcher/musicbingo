import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEmptyRuntimeState } from "@/lib/live/types";

/** The live writes in the repo (spec M-9): every refusal is reported, a missing game is an error. */

const rpc = vi.fn();
const deleteChain = { eq: vi.fn(), select: vi.fn() };
vi.mock("@/lib/supabase/service", () => ({
  getSupabaseClient: () => ({
    rpc,
    from: () => ({ delete: () => deleteChain }),
  }),
}));

const repo = await import("@/lib/live/sessionRepo");

beforeEach(() => {
  rpc.mockReset();
  deleteChain.eq.mockReset().mockReturnValue(deleteChain);
  deleteChain.select.mockReset();
});

const save = (expectedVersion = 1) =>
  repo.saveLiveRuntime({
    sessionId: "game-1",
    deviceId: "dev-1",
    userId: "user-1",
    expectedVersion,
    runtime: makeEmptyRuntimeState("game-1"),
    event: { type: "runtime_snapshot", clientEventId: "c1", payload: { a: 1 } },
  });

describe("saveLiveRuntime", () => {
  test("one call to the atomic save_live_runtime with the expected version and the event", async () => {
    rpc.mockResolvedValue({ data: { ok: true, runtime_version: "8" }, error: null });
    expect(await save(7)).toEqual({ ok: true, version: 8 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "save_live_runtime",
      expect.objectContaining({ p_session_id: "game-1", p_device: "dev-1", p_user: "user-1", p_expected_version: 7, p_event_type: "runtime_snapshot", p_client_event_id: "c1" })
    );
  });

  test("each refusal comes back with its reason", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: "missing" }, error: null });
    expect(await save()).toEqual({ ok: false, reason: "missing", version: null, secondsSinceSeen: null });
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: "not_controller", runtime_version: 2, seen_seconds_ago: 5 }, error: null });
    expect(await save()).toEqual({ ok: false, reason: "not_controller", version: 2, secondsSinceSeen: 5 });
    rpc.mockResolvedValueOnce({ data: { ok: false, reason: "conflict", runtime_version: 9 }, error: null });
    expect(await save()).toMatchObject({ ok: false, reason: "conflict", version: 9 });
  });

  test("a database error or an answer it does not know throws, never reads as saved", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(save()).rejects.toThrow("boom");
    rpc.mockResolvedValueOnce({ data: { ok: "yes" }, error: null });
    await expect(save()).rejects.toThrow(/Unexpected/);
  });

  test("a runtime for another game is refused before the database", async () => {
    await expect(
      repo.saveLiveRuntime({ sessionId: "game-2", deviceId: "d", userId: "u", expectedVersion: 0, runtime: makeEmptyRuntimeState("game-1") })
    ).rejects.toThrow(/mismatch/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("a missing game is an error", () => {
  test("revoking links on a missing game throws SessionNotFoundError", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(repo.revokeSessionLinks("gone", "user-1")).rejects.toBeInstanceOf(repo.SessionNotFoundError);
  });

  test("a delete that removed nothing throws SessionNotFoundError", async () => {
    deleteChain.select.mockResolvedValue({ data: [], error: null });
    await expect(repo.deleteSession("gone")).rejects.toBeInstanceOf(repo.SessionNotFoundError);
    deleteChain.select.mockResolvedValue({ data: [{ id: "game-1" }], error: null });
    await expect(repo.deleteSession("game-1")).resolves.toBeUndefined();
  });
});
