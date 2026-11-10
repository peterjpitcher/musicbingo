import type { AppRole } from "@anchor-nights/kit/auth";
import type { ResolveTonight, TvDevice, TvPairing, TvView } from "@anchor-nights/kit/pairing";

/**
 * What /tv shows (spec M-9, S3.1, S3.2):
 *
 *   - a paired TV: tonight's game (lib/live/tonight.ts) or the idle screen;
 *   - an unpaired screen: the kit's 6-digit pairing code;
 *   - a signed-in host or admin on an unpaired browser (the laptop's "Open
 *     Display"): the game the console is running (`?session=`), else tonight's
 *     game, without pairing the laptop;
 *   - an outage (the device lookup or tonight's game could not be read):
 *     "Reconnecting", never a game and never a pairing code.
 */

export type TvGame = { id: string };

/** The device a signed-in host's own browser stands in as. Never stored. */
export const STAFF_PREVIEW_DEVICE: TvDevice = Object.freeze({
  id: "staff-preview",
  name: "This laptop",
  createdAt: "1970-01-01T00:00:00.000Z",
  lastSeenAt: null,
});

const SESSION_ID = /^[A-Za-z0-9_-]{1,80}$/;

export interface TvViewDeps {
  pairing: Pick<TvPairing, "resolveTvView">;
  findTonight: ResolveTonight<TvGame>;
  /** The signed-in person's role, or null. May throw on an outage. */
  staffRole: () => Promise<AppRole | null>;
  rehearsal: boolean;
  /** `?session=`: honoured only for a signed-in host or admin. */
  requestedSessionId?: string | null;
  now?: () => Date;
}

export async function resolveMusicBingoTvView(deps: TvViewDeps): Promise<TvView<TvGame>> {
  const view = await deps.pairing.resolveTvView({ resolveTonight: deps.findTonight, rehearsal: deps.rehearsal });
  if (view.kind !== "unpaired") return view;

  let role: AppRole | null;
  try {
    role = await deps.staffRole();
  } catch {
    // Auth unreachable: this browser is unpaired either way, and the pairing
    // screen reports its own outage. Never show a game on a guess.
    return view;
  }
  if (role !== "admin" && role !== "host") return view;

  const device = STAFF_PREVIEW_DEVICE;
  const requested = deps.requestedSessionId?.trim();
  if (requested && SESSION_ID.test(requested)) {
    return { kind: "game", device, game: { id: requested }, rehearsal: deps.rehearsal };
  }
  try {
    const game = await deps.findTonight({ device, now: deps.now?.() ?? new Date(), rehearsal: deps.rehearsal });
    return game ? { kind: "game", device, game, rehearsal: deps.rehearsal } : { kind: "idle", device, rehearsal: deps.rehearsal };
  } catch {
    return { kind: "unavailable", reason: "resolver" };
  }
}
