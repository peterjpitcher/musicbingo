import { NextRequest, NextResponse } from "next/server";

import { readSessionAccessToken, setSessionAccessCookie, type SessionAccessRole } from "@/lib/live/access";
import { getSessionRecord } from "@/lib/live/sessionRepo";
import { reportError } from "@/lib/reportError";

export const runtime = "nodejs";

function readRole(value: string | null): SessionAccessRole {
  return value === "display" ? "display" : "host";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const role = readRole(request.nextUrl.searchParams.get("role"));
  const token = request.nextUrl.searchParams.get("token");

  // The link token is checked first (signature and expiry), so a caller
  // without one cannot learn which games exist. A host link only sets its
  // cookie and opens the console: /host needs a signed-in host or admin
  // (proxy.ts), and every console API route asks for one too.
  const claims = readSessionAccessToken({ sessionId: id, role, token });
  if (!claims || !token) {
    return NextResponse.json({ error: "This private link is invalid or has expired." }, { status: 401 });
  }

  try {
    const record = await getSessionRecord(id);
    if (!record) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    if (claims.generation !== record.linkGeneration) {
      return NextResponse.json({ error: "This private link was cancelled. Ask for a new one." }, { status: 401 });
    }
  } catch (err) {
    await reportError({ scope: "api:session-authorize:get" }, err);
    return NextResponse.json({ error: "Could not check the link just now. Try again." }, { status: 503 });
  }

  const destination = role === "display"
    ? `/display/${encodeURIComponent(id)}`
    : `/host/${encodeURIComponent(id)}`;
  const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  setSessionAccessCookie(response, claims, token);
  return response;
}
