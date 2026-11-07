import { describe, expect, test, vi } from "vitest";

import { createFindTonight, isTonightGame, pickTonight, tonightDates, type TonightRow } from "@/lib/live/tonight";

/**
 * Tonight's game by today's date in London (spec M-9, S3.2). Every instant
 * here is absolute (UTC), so the results are the same whichever zone the
 * suite runs in: npm test pins Europe/London, npm run test:utc runs UTC.
 */

function row(id: string, eventDate: string, mode: string | null, updatedAt = "2026-11-07T18:00:00Z"): TonightRow {
  return { id, eventDate, mode, updatedAt, createdAt: "2026-11-01T10:00:00Z" };
}

describe("tonightDates", () => {
  test("in winter (GMT) London's date turns over at midnight UTC", () => {
    expect(tonightDates(new Date("2026-11-07T23:59:59Z"))).toEqual({ today: "2026-11-07", lateNight: null });
    expect(tonightDates(new Date("2026-11-08T00:00:00Z"))).toEqual({ today: "2026-11-08", lateNight: "2026-11-07" });
  });

  test("in summer (BST) London's date turns over at 23:00 UTC, an hour before UTC's", () => {
    expect(tonightDates(new Date("2026-07-17T22:59:59Z")).today).toBe("2026-07-17");
    expect(tonightDates(new Date("2026-07-17T23:00:00Z"))).toEqual({ today: "2026-07-18", lateNight: "2026-07-17" });
  });

  test("last night still counts until 04:00 London, in both seasons", () => {
    // Winter: 03:59 London is 03:59 UTC.
    expect(tonightDates(new Date("2026-11-08T03:59:00Z")).lateNight).toBe("2026-11-07");
    expect(tonightDates(new Date("2026-11-08T04:00:00Z")).lateNight).toBeNull();
    // Summer: 03:59 London is 02:59 UTC.
    expect(tonightDates(new Date("2026-07-18T02:59:00Z")).lateNight).toBe("2026-07-17");
    expect(tonightDates(new Date("2026-07-18T03:00:00Z")).lateNight).toBeNull();
  });

  test("the nights the clocks change", () => {
    // Clocks go back at 02:00 BST on 25 October 2026 (01:00 UTC).
    expect(tonightDates(new Date("2026-10-24T22:59:00Z")).today).toBe("2026-10-24");
    expect(tonightDates(new Date("2026-10-24T23:30:00Z"))).toEqual({ today: "2026-10-25", lateNight: "2026-10-24" });
    expect(tonightDates(new Date("2026-10-25T03:59:00Z")).lateNight).toBe("2026-10-24");
    expect(tonightDates(new Date("2026-10-25T04:00:00Z")).lateNight).toBeNull();
    // Clocks go forward at 01:00 GMT on 29 March 2026.
    expect(tonightDates(new Date("2026-03-28T23:59:00Z")).today).toBe("2026-03-28");
    expect(tonightDates(new Date("2026-03-29T00:00:00Z"))).toEqual({ today: "2026-03-29", lateNight: "2026-03-28" });
    expect(tonightDates(new Date("2026-03-29T02:59:00Z")).lateNight).toBe("2026-03-28");
    expect(tonightDates(new Date("2026-03-29T03:00:00Z")).lateNight).toBeNull();
  });
});

describe("pickTonight", () => {
  const evening = new Date("2026-11-07T19:30:00Z");

  test("picks today's game by London date, never another day's", () => {
    const rows = [row("yesterday", "2026-11-06", "idle"), row("today", "2026-11-07", null), row("tomorrow", "2026-11-08", null)];
    expect(pickTonight(rows, evening)?.id).toBe("today");
    expect(pickTonight([row("tomorrow", "2026-11-08", null)], evening)).toBeNull();
  });

  test("an unfinished game beats an ended one; then the most recently changed", () => {
    const rows = [
      row("ended", "2026-11-07", "ended", "2026-11-07T19:00:00Z"),
      row("older", "2026-11-07", "idle", "2026-11-07T15:00:00Z"),
      row("newer", "2026-11-07", "running", "2026-11-07T18:00:00Z"),
    ];
    expect(pickTonight(rows, evening)?.id).toBe("newer");
    expect(pickTonight([row("only-ended", "2026-11-07", "ended")], evening)?.id).toBe("only-ended");
  });

  test("after midnight a running game from last night stays on, until 04:00", () => {
    const rows = [row("last-night", "2026-11-07", "running")];
    expect(pickTonight(rows, new Date("2026-11-08T00:30:00Z"))?.id).toBe("last-night");
    expect(pickTonight(rows, new Date("2026-11-08T04:00:00Z"))).toBeNull();
  });

  test("after midnight last night's idle or ended game does not come back", () => {
    const after = new Date("2026-11-08T00:30:00Z");
    expect(pickTonight([row("idle", "2026-11-07", "idle")], after)).toBeNull();
    expect(pickTonight([row("ended", "2026-11-07", "ended")], after)).toBeNull();
    expect(pickTonight([row("never-run", "2026-11-07", null)], after)).toBeNull();
  });

  test("today's game wins over last night's live one", () => {
    const after = new Date("2026-11-08T00:30:00Z");
    const rows = [row("last-night", "2026-11-07", "paused"), row("today", "2026-11-08", null)];
    expect(pickTonight(rows, after)?.id).toBe("today");
  });
});

describe("isTonightGame (a paired TV may read only tonight's game)", () => {
  test("today's game yes, another day's no", () => {
    const now = new Date("2026-11-07T19:30:00Z");
    expect(isTonightGame({ eventDate: "2026-11-07", mode: null }, now)).toBe(true);
    expect(isTonightGame({ eventDate: "2026-11-06", mode: "running" }, now)).toBe(false);
    expect(isTonightGame({ eventDate: "2026-11-08", mode: null }, now)).toBe(false);
  });

  test("last night's live game until 04:00 London only", () => {
    expect(isTonightGame({ eventDate: "2026-11-07", mode: "break" }, new Date("2026-11-08T01:00:00Z"))).toBe(true);
    expect(isTonightGame({ eventDate: "2026-11-07", mode: "ended" }, new Date("2026-11-08T01:00:00Z"))).toBe(false);
    expect(isTonightGame({ eventDate: "2026-11-07", mode: "break" }, new Date("2026-11-08T04:00:00Z"))).toBe(false);
  });
});

describe("createFindTonight", () => {
  test("asks only for tonight's dates", async () => {
    const list = vi.fn(async () => [row("today", "2026-11-08", null)]);
    const find = createFindTonight(list);
    expect(await find({ now: new Date("2026-11-08T19:00:00Z") })).toEqual({ id: "today" });
    expect(list).toHaveBeenLastCalledWith(["2026-11-08"]);
    await find({ now: new Date("2026-11-08T01:00:00Z") });
    expect(list).toHaveBeenLastCalledWith(["2026-11-08", "2026-11-07"]);
  });

  test("a database error throws (the kit shows Reconnecting), it is never read as no game", async () => {
    const find = createFindTonight(async () => {
      throw new Error("connection refused");
    });
    await expect(find({ now: new Date("2026-11-08T19:00:00Z") })).rejects.toThrow("connection refused");
  });
});
