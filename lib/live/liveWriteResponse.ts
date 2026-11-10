import type { LiveWriteResult } from "@/lib/live/sessionRepo";

/**
 * The HTTP answer for a live write or control request (spec M-9, S4.4). Only
 * a write that landed is 200; every refusal says why, so the console can
 * show the host that it did not save:
 *
 *   200 { ok: true, version }
 *   403 { ok: false, reason: "inactive" }         the account is no longer active staff
 *   404 { ok: false, reason: "missing" }          the game does not exist
 *   409 { ok: false, reason: "not_controller" }   another console holds control
 *   409 { ok: false, reason: "conflict" }         the save was out of date (version)
 */
export function liveWriteResponse(result: LiveWriteResult): Response {
  const status = result.ok ? 200 : result.reason === "missing" ? 404 : result.reason === "inactive" ? 403 : 409;
  const body = result.ok
    ? { ok: true, version: result.version }
    : { ok: false, reason: result.reason, version: result.version, secondsSinceSeen: result.secondsSinceSeen };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function missingDeviceResponse(): Response {
  return new Response(JSON.stringify({ ok: false, reason: "no_device", error: "This console sent no device id." }), {
    status: 400,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
