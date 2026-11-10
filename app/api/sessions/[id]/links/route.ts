import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/routeGuard";
import { buildSessionAccessLinks } from "@/lib/live/access";
import { reportError } from "@/lib/reportError";
import { getSession } from "@/lib/live/sessionRepo";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;

    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json(
      buildSessionAccessLinks(request.nextUrl.origin, id),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // Fails closed: without LIVE_LINK_SECRET no link is made, and the host is told.
    await reportError({ scope: "api:session-links:get" }, err);
    const message = err instanceof Error ? err.message : "Failed to create links.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
