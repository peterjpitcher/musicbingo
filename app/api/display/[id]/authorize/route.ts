import { NextRequest, NextResponse } from "next/server";

import { setSessionAccessCookie, verifySessionAccessToken } from "@/lib/live/access";
import { getSession } from "@/lib/live/sessionRepo";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("token");
  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  if (!verifySessionAccessToken({ sessionId: id, role: "display", token })) {
    return NextResponse.json({ error: "Invalid private display link." }, { status: 401 });
  }

  const response = NextResponse.redirect(new URL(`/display/${encodeURIComponent(id)}`, request.nextUrl.origin));
  setSessionAccessCookie(response, id, "display", token ?? "");
  return response;
}
