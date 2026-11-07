import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/routeGuard";
import { sessionCommandSchema } from "@/lib/live/commandSchema";
import { readHostDeviceHeader } from "@/lib/live/hostDevice";
import { liveWriteResponse, missingDeviceResponse } from "@/lib/live/liveWriteResponse";
import { saveLiveRuntime } from "@/lib/live/sessionRepo";
import { validateRuntimeState } from "@/lib/live/storage";
import { reportError } from "@/lib/reportError";

export const runtime = "nodejs";

/**
 * The console's save: the session event and the runtime in one transaction
 * (save_live_runtime), held to the control lock and the version the console
 * last saw (spec M-9). A game that does not exist is a 404, never ok.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const deviceId = readHostDeviceHeader(request.headers);
    if (!deviceId) return missingDeviceResponse();

    const parsed = sessionCommandSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid command payload." }, { status: 400 });
    }
    const runtimeState = validateRuntimeState(parsed.data.runtime);
    if (!runtimeState || runtimeState.sessionId !== id) {
      return NextResponse.json({ error: "Invalid runtime payload." }, { status: 400 });
    }

    const result = await saveLiveRuntime({
      sessionId: id,
      deviceId,
      userId: gate.userId,
      expectedVersion: parsed.data.expectedVersion,
      runtime: runtimeState,
      event: { type: parsed.data.type, clientEventId: parsed.data.clientEventId ?? null, payload: parsed.data.payload },
    });
    return liveWriteResponse(result);
  } catch (err) {
    await reportError({ scope: "api:session-commands:post" }, err);
    return NextResponse.json({ error: "Failed to record command." }, { status: 500 });
  }
}
