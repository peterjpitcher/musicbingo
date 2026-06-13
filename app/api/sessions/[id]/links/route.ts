import { NextRequest, NextResponse } from "next/server";

import { buildSessionAccessLinks, hasAnySessionAccess, hasAdminAccess } from "@/lib/live/access";
import { getSession } from "@/lib/live/sessionRepo";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!hasAdminAccess(request) && !hasAnySessionAccess(request, id, ["host"])) {
      return NextResponse.json({ error: "Admin or host access required." }, { status: 401 });
    }

    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json(
      buildSessionAccessLinks(request.nextUrl.origin, id),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create links.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
