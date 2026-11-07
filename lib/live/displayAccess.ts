import type { NextRequest } from "next/server";
import { tvDeviceCookieName, type TvDevice } from "@anchor-nights/kit/pairing/shared";

import type { RouteGate } from "@/lib/auth/routeGuard";
import { readRequestLinkClaims } from "@/lib/live/access";
import type { SessionRecord } from "@/lib/live/sessionRepo";
import { isTonightGame } from "@/lib/live/tonight";

/**
 * Who may read a game's TV snapshot (spec M-9), in this order:
 *
 *   1. a TV link for this game (the cookie its link set): signed, unexpired,
 *      and of the game's current link generation, so a cancelled link stops
 *      at its next poll;
 *   2. a paired TV (the kit's device cookie), for tonight's game only
 *      (lib/live/tonight.ts), so a pub screen cannot be pointed at any game;
 *   3. a signed-in host or admin (the laptop's Open Display).
 *
 * Nothing about the game is read until one of those holds, so a caller with
 * none of them cannot learn which games exist.
 */

export type DisplayGate =
  | { ok: true; via: "display-token" | "paired-tv" | "staff"; record: SessionRecord }
  | { ok: false; response: Response };

export interface DisplayAccessDeps {
  loadRecord: (sessionId: string) => Promise<SessionRecord | null>;
  requirePairedTv: (request: Request) => Promise<TvDevice | null>;
  requireStaff: (request: Request) => Promise<RouteGate>;
  now?: () => Date;
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Whether the request carries the kit's TV device cookie at all (http or https name). */
export function hasTvDeviceCookie(request: NextRequest): boolean {
  return Boolean(request.cookies.get(tvDeviceCookieName(true))?.value || request.cookies.get(tvDeviceCookieName(false))?.value);
}

export async function authoriseDisplay(request: NextRequest, sessionId: string, deps: DisplayAccessDeps): Promise<DisplayGate> {
  const now = deps.now?.() ?? new Date();
  let record: SessionRecord | null | undefined;
  const load = async (): Promise<SessionRecord | null> => {
    if (record === undefined) record = await deps.loadRecord(sessionId);
    return record;
  };

  const claims = readRequestLinkClaims(request, sessionId, "display");
  let cancelledLink = false;
  if (claims) {
    const found = await load();
    if (!found) return { ok: false, response: json(404, "Session not found.") };
    if (claims.generation === found.linkGeneration) return { ok: true, via: "display-token", record: found };
    cancelledLink = true;
  }

  let notTonight = false;
  if (hasTvDeviceCookie(request)) {
    const device = await deps.requirePairedTv(request);
    if (device) {
      const found = await load();
      if (found && isTonightGame({ eventDate: found.eventDate, mode: found.runtime?.mode ?? null }, now)) {
        return { ok: true, via: "paired-tv", record: found };
      }
      notTonight = true;
    }
  }

  const gate = await deps.requireStaff(request);
  if (gate.ok) {
    const found = await load();
    if (!found) return { ok: false, response: json(404, "Session not found.") };
    return { ok: true, via: "staff", record: found };
  }
  if (cancelledLink) return { ok: false, response: json(401, "link_cancelled") };
  if (notTonight) return { ok: false, response: json(403, "not_tonight") };
  return gate;
}
