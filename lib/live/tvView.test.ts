import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { createTvPairing, TvPageShell, type TvView } from "@anchor-nights/kit/pairing";

import { createFindTonight, type TonightRow } from "@/lib/live/tonight";
import { resolveMusicBingoTvView, STAFF_PREVIEW_DEVICE, type TvGame } from "@/lib/live/tvView";

/**
 * /tv fails closed (spec M-9, S3.2): the kit's real pairing resolver with a
 * stand-in database. An outage shows "Reconnecting", never a game and never
 * a pairing code.
 */

const DEVICE_TOKEN = "a".repeat(43);
const NOW = new Date("2026-11-07T19:30:00Z");
const pairedRow = { id: "11111111-1111-4111-8111-111111111111", name: "Bar TV", created_at: "2026-11-07T10:00:00Z", last_seen_at: null };

function jar(cookies: Record<string, string>) {
  return { get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined) };
}

function pairing(options: { deviceLookup: "paired" | "fails"; cookies?: Record<string, string> }) {
  const rpc = vi.fn(async () => {
    if (options.deviceLookup === "fails") return { data: null, error: { message: "connection refused" } };
    return { data: [pairedRow], error: null };
  });
  const report = vi.fn();
  const kit = createTvPairing({
    config: { secureCookies: false },
    serverClient: async () => ({}) as never,
    adminClient: () => ({ rpc }) as never,
    cookies: async () => jar(options.cookies ?? { "anchor-tv": DEVICE_TOKEN }),
    headers: async () => new Headers(),
    report,
    now: () => NOW,
  });
  return { kit, report };
}

function render(view: TvView<TvGame>): string {
  return renderToStaticMarkup(
    createElement(TvPageShell<TvGame>, {
      view,
      pairing: { appName: "Music Bingo" },
      renderGame: (game) => createElement("div", { "data-game": game.id }, "GAME"),
      renderIdle: () => createElement("div", null, "IDLE"),
    })
  );
}

const failingDatabase = createFindTonight(async () => {
  throw new Error("connection refused");
});
const todaysGame = createFindTonight(async (): Promise<TonightRow[]> => [
  { id: "tonight", eventDate: "2026-11-07", mode: "running", updatedAt: "2026-11-07T19:00:00Z", createdAt: "2026-11-01T10:00:00Z" },
]);
const noStaff = async () => null;
/** What the kit's pairing screen says (checked against an unpaired render below). */
const PAIRING_SCREEN = /pair this screen|pairing code/i;

describe("/tv on a paired screen", () => {
  test("shows tonight's game", async () => {
    const { kit } = pairing({ deviceLookup: "paired" });
    const view = await resolveMusicBingoTvView({ pairing: kit, findTonight: todaysGame, staffRole: noStaff, rehearsal: false, now: () => NOW });
    expect(view).toMatchObject({ kind: "game", game: { id: "tonight" } });
    expect(render(view)).toContain('data-game="tonight"');
  });

  test("a failing database while finding tonight's game shows Reconnecting, no game and no code", async () => {
    const { kit, report } = pairing({ deviceLookup: "paired" });
    const view = await resolveMusicBingoTvView({ pairing: kit, findTonight: failingDatabase, staffRole: noStaff, rehearsal: false });
    expect(view).toEqual({ kind: "unavailable", reason: "resolver" });
    const html = render(view);
    expect(html).toContain("Reconnecting");
    expect(html).not.toContain("GAME");
    expect(html).not.toMatch(PAIRING_SCREEN);
    expect(report).toHaveBeenCalledWith("pairing:resolve_tonight", expect.any(Error));
  });

  test("a failing device lookup shows Reconnecting too, never the pairing code", async () => {
    const { kit } = pairing({ deviceLookup: "fails" });
    const staffRole = vi.fn(async () => "host" as const);
    const view = await resolveMusicBingoTvView({ pairing: kit, findTonight: todaysGame, staffRole, rehearsal: false });
    expect(view).toEqual({ kind: "unavailable", reason: "device_lookup" });
    expect(render(view)).toContain("Reconnecting");
    expect(render(view)).not.toMatch(PAIRING_SCREEN);
    // An outage is never taken for an unpaired laptop.
    expect(staffRole).not.toHaveBeenCalled();
  });
});

describe("/tv on an unpaired browser", () => {
  test("anyone not signed in gets the pairing screen", async () => {
    const { kit } = pairing({ deviceLookup: "paired", cookies: {} });
    const view = await resolveMusicBingoTvView({ pairing: kit, findTonight: todaysGame, staffRole: noStaff, rehearsal: false, requestedSessionId: "tonight" });
    expect(view).toEqual({ kind: "unpaired" });
    expect(render(view)).toMatch(PAIRING_SCREEN);
  });

  test("a signed-in host's laptop (Open Display) shows the game it asked for, without pairing", async () => {
    const { kit } = pairing({ deviceLookup: "paired", cookies: {} });
    const view = await resolveMusicBingoTvView({
      pairing: kit,
      findTonight: failingDatabase,
      staffRole: async () => "host",
      rehearsal: false,
      requestedSessionId: "game-42",
    });
    expect(view).toEqual({ kind: "game", device: STAFF_PREVIEW_DEVICE, game: { id: "game-42" }, rehearsal: false });
  });

  test("a signed-in host with no game named gets tonight's, and an outage there is Reconnecting", async () => {
    const { kit } = pairing({ deviceLookup: "paired", cookies: {} });
    const base = { pairing: kit, staffRole: async () => "admin" as const, rehearsal: false, now: () => NOW };
    expect(await resolveMusicBingoTvView({ ...base, findTonight: todaysGame })).toMatchObject({ kind: "game", game: { id: "tonight" } });
    expect(await resolveMusicBingoTvView({ ...base, findTonight: failingDatabase })).toEqual({ kind: "unavailable", reason: "resolver" });
  });

  test("a pending account, a strange session id or an auth outage gets the pairing screen, never a game", async () => {
    const { kit } = pairing({ deviceLookup: "paired", cookies: {} });
    const base = { pairing: kit, findTonight: todaysGame, rehearsal: false };
    expect(await resolveMusicBingoTvView({ ...base, staffRole: async () => "pending" as const, requestedSessionId: "x" })).toEqual({ kind: "unpaired" });
    expect(
      await resolveMusicBingoTvView({
        ...base,
        staffRole: async () => {
          throw new Error("auth down");
        },
      })
    ).toEqual({ kind: "unpaired" });
    const odd = await resolveMusicBingoTvView({ ...base, staffRole: async () => "host" as const, requestedSessionId: "../etc", now: () => NOW });
    expect(odd).toMatchObject({ kind: "game", game: { id: "tonight" } });
  });
});
