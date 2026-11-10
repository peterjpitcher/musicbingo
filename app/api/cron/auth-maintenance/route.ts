import { createAuthMaintenance } from "@anchor-nights/kit/auth";

import { isCronRequest } from "@/lib/auth/cron";
import { authConfig } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/reportError";
import { tvPairing } from "@/lib/tv-pairing";

/**
 * Daily sign-in housekeeping (auth standard section 11; spec M-8), run by
 * Vercel Cron (vercel.json): deletes sign-in telemetry after 12 months, other
 * audit events after 6 years, spent recovery grants after a day and finished
 * invites after 12 months, then fails any invite stuck half-accepted and
 * deletes the still-banned account it left behind.
 *
 * Then the TV pairing clean-up (spec M-9): pairing codes go after a day,
 * pairing attempts (with their IP addresses) after 30 days and removed TVs
 * 12 months after removal.
 *
 * Never callable from a browser: Vercel sends `Authorization: Bearer
 * <CRON_SECRET>`. Without CRON_SECRET it refuses everything (fails closed).
 * Both steps are idempotent, so a platform retry is harmless.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return json(401, { error: "unauthenticated" });
  }
  try {
    const maintenance = createAuthMaintenance({ config: authConfig(), adminClient: createAdminClient });
    const pruned = await maintenance.pruneAuthData();
    const invites = await maintenance.reconcileInvites();
    const pairing = await tvPairing().maintenance.prunePairing();
    return json(200, { ok: true, pruned, invites, pairing });
  } catch (err) {
    await reportError({ scope: "cron:auth-maintenance" }, err);
    return json(500, { ok: false, error: "auth_maintenance_failed" });
  }
}
