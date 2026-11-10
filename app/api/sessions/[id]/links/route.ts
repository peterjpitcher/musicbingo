import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/routeGuard";
import { buildSessionAccessLinks } from "@/lib/live/access";
import { reportError } from "@/lib/reportError";
import { siteOrigin } from "@/lib/siteUrl";
import { getSessionRecord, revokeSessionLinks, SessionNotFoundError } from "@/lib/live/sessionRepo";

export const runtime = "nodejs";

/** New host and TV links for a game, each working for 24 hours (lib/live/access.ts). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;

    const record = await getSessionRecord(id);
    if (!record) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json(
      // On the canonical address (NEXT_PUBLIC_SITE_URL, spec M-10), whichever
      // alias the host opened the console on.
      buildSessionAccessLinks(siteOrigin(request.nextUrl.origin), id, record.linkGeneration),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // Fails closed: without LIVE_LINK_SECRET no link is made, and the host is told.
    await reportError({ scope: "api:session-links:get" }, err);
    const message = err instanceof Error ? err.message : "Failed to create links.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Cancels every host and TV link made so far for this game (spec M-9): each
 * is refused at its next request, including the cookie a link already set.
 * Paired TVs are not affected (they are removed on the staff page).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const generation = await revokeSessionLinks(id, gate.userId);
    return NextResponse.json({ ok: true, generation }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
    }
    await reportError({ scope: "api:session-links:delete" }, err);
    return NextResponse.json({ ok: false, error: "Could not cancel the links. Try again." }, { status: 500 });
  }
}
