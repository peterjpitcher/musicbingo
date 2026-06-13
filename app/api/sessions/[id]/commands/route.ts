import { NextRequest, NextResponse } from "next/server";

import { hasSessionAccess } from "@/lib/live/access";
import { sessionCommandSchema } from "@/lib/live/commandSchema";
import { appendSessionEvent, getSession, upsertRuntimeState } from "@/lib/live/sessionRepo";
import { validateRuntimeState } from "@/lib/live/storage";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!hasSessionAccess(request, id, "host")) {
      return NextResponse.json({ error: "Host access required." }, { status: 401 });
    }

    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = sessionCommandSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid command payload." }, { status: 400 });
    }

    const runtimeState = parsed.data.runtime === undefined
      ? null
      : validateRuntimeState(parsed.data.runtime);
    if (parsed.data.runtime !== undefined && !runtimeState) {
      return NextResponse.json({ error: "Invalid runtime payload." }, { status: 400 });
    }

    await appendSessionEvent({
      sessionId: id,
      eventType: parsed.data.type,
      payload: parsed.data.payload,
      clientEventId: parsed.data.clientEventId ?? null,
    });

    if (runtimeState) {
      await upsertRuntimeState(id, runtimeState);
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record command.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
