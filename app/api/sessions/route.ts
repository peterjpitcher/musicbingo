import { NextRequest, NextResponse } from "next/server";

import { hasAdminAccess } from "@/lib/live/access";
import { listSessions, upsertSession } from "@/lib/live/sessionRepo";
import { validateLiveSession } from "@/lib/live/validate";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const sessions = await listSessions();
    return NextResponse.json(sessions, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to list sessions." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const session = validateLiveSession(body);
    if (!session) {
      return NextResponse.json({ error: "Invalid live session payload." }, { status: 400 });
    }
    await upsertSession(session);
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save session." }, { status: 500 });
  }
}
