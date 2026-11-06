import { NextRequest, NextResponse } from "next/server";

import {
  setSessionAccessCookie,
  type SessionAccessRole,
  verifySessionAccessToken,
} from "@/lib/live/access";
import { getSession } from "@/lib/live/sessionRepo";

export const runtime = "nodejs";

function readRole(value: string | null): SessionAccessRole {
  return value === "display" ? "display" : "host";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const role = readRole(request.nextUrl.searchParams.get("role"));
  const token = request.nextUrl.searchParams.get("token");

  // The link token is checked first, so a caller without one cannot learn
  // which games exist. A host link only sets its cookie and opens the
  // console: /host needs a signed-in host or admin (proxy.ts), and every
  // console API route asks for one too, so the link no longer grants access
  // on its own (M-8). Expiry and revocation for these links are M-9.
  if (!verifySessionAccessToken({ sessionId: id, role, token })) {
    return NextResponse.json({ error: "Invalid private link." }, { status: 401 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const destination = role === "display"
    ? `/display/${encodeURIComponent(id)}`
    : `/host/${encodeURIComponent(id)}`;
  const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  setSessionAccessCookie(response, id, role, token ?? "");
  return response;
}
