import { NextRequest, NextResponse } from "next/server";

import { hasAdminAccess } from "@/lib/live/access";
import { upsertSession } from "@/lib/live/sessionRepo";
import { validateLiveSession } from "@/lib/live/validate";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const text = await request.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON. Check the file and try again." }, { status: 400 });
    }

    const session = validateLiveSession(parsed);
    if (!session) {
      return NextResponse.json({ error: "Invalid live session schema or unsupported version." }, { status: 400 });
    }

    await upsertSession(session);
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to import session." }, { status: 500 });
  }
}
