import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/routeGuard";
import { listSessions, upsertSession } from "@/lib/live/sessionRepo";
import { validateLiveSession } from "@/lib/live/validate";
import { reportError } from "@/lib/reportError";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const sessions = await listSessions();
    return NextResponse.json(sessions, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    await reportError({ scope: "api:sessions:get" }, err);
    return NextResponse.json({ error: err?.message ?? "Failed to list sessions." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const body = await request.json().catch(() => null);
    const session = validateLiveSession(body);
    if (!session) {
      return NextResponse.json({ error: "Invalid live session payload." }, { status: 400 });
    }
    await upsertSession(session);
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    await reportError({ scope: "api:sessions:put" }, err);
    return NextResponse.json({ error: err?.message ?? "Failed to save session." }, { status: 500 });
  }
}
