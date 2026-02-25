import { NextRequest, NextResponse } from "next/server";

import { listSessions, upsertSession } from "@/lib/live/sessionRepo";
import { validateLiveSession } from "@/lib/live/validate";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json(sessions, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to list sessions." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
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
