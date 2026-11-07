import { tvPairing } from "@/lib/tv-pairing";
import { reportError } from "@/lib/reportError";

/**
 * The kit's pairing endpoint (spec M-9, S3.1): an unpaired /tv POSTs for a
 * 6-digit code and GETs (polls) until a signed-in host or admin has typed it
 * into the host console. Open to anyone by design, and it carries no
 * authority: a code does nothing until active staff type it, the device
 * cookie only lands in the browser holding the matching pairing secret, and
 * the kit rate-limits both calls. Outside the proxy's protected routes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable(): Response {
  return new Response(JSON.stringify({ status: "unavailable" }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await tvPairing().routes.POST(request);
  } catch (err) {
    // Missing auth settings or a client that could not be built: fail closed.
    await reportError({ scope: "api:tv-pairing:post" }, err);
    return unavailable();
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    return await tvPairing().routes.GET(request);
  } catch (err) {
    await reportError({ scope: "api:tv-pairing:get" }, err);
    return unavailable();
  }
}
