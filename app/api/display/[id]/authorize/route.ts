import { NextRequest, NextResponse } from "next/server";

import { readSessionAccessToken, setSessionAccessCookie } from "@/lib/live/access";
import { getSessionRecord } from "@/lib/live/sessionRepo";
import { reportError } from "@/lib/reportError";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("token");

  // The token is the gate (the TV is never signed in): its signature and
  // expiry are checked before the lookup, so a caller without one cannot
  // learn which games exist; then its generation, so a cancelled link fails.
  const claims = readSessionAccessToken({ sessionId: id, role: "display", token });
  if (!claims || !token) {
    return NextResponse.json({ error: "This private display link is invalid or has expired." }, { status: 401 });
  }

  try {
    const record = await getSessionRecord(id);
    if (!record) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    if (claims.generation !== record.linkGeneration) {
      return NextResponse.json({ error: "This private display link was cancelled. Ask for a new one." }, { status: 401 });
    }
  } catch (err) {
    await reportError({ scope: "api:display-authorize:get" }, err);
    return NextResponse.json({ error: "Could not check the link just now. Try again." }, { status: 503 });
  }

  const response = NextResponse.redirect(new URL(`/display/${encodeURIComponent(id)}`, request.nextUrl.origin));
  setSessionAccessCookie(response, claims, token);
  return response;
}
