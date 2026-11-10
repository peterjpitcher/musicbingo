import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireStaff } from "@/lib/auth/routeGuard";
import { readHostDeviceHeader } from "@/lib/live/hostDevice";
import { liveWriteResponse, missingDeviceResponse } from "@/lib/live/liveWriteResponse";
import { getRuntimeWithVersion, saveLiveRuntime } from "@/lib/live/sessionRepo";
import { validateRuntimeState } from "@/lib/live/storage";
import { reportError } from "@/lib/reportError";

export const runtime = "nodejs";

/** The stored runtime and its version: { runtime (or null if never run), version }. 404 when the game does not exist. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const state = await getRuntimeWithVersion(id);
    if (!state) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await reportError({ scope: "api:session-runtime:get" }, err);
    return NextResponse.json({ error: "Failed to get runtime state." }, { status: 500 });
  }
}

const putSchema = z.object({
  runtime: z.unknown(),
  expectedVersion: z.number().int().min(0),
});

/**
 * Saves the runtime, held to the control lock and the version the console
 * last saw (spec M-9). Answers as lib/live/liveWriteResponse.ts says: only a
 * save that landed is 200.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const deviceId = readHostDeviceHeader(request.headers);
    if (!deviceId) return missingDeviceResponse();
    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    const runtimeState = parsed.success ? validateRuntimeState(parsed.data.runtime) : null;
    if (!parsed.success || !runtimeState || runtimeState.sessionId !== id) {
      return NextResponse.json({ error: "Invalid runtime state payload." }, { status: 400 });
    }
    const result = await saveLiveRuntime({
      sessionId: id,
      deviceId,
      userId: gate.userId,
      expectedVersion: parsed.data.expectedVersion,
      runtime: runtimeState,
    });
    return liveWriteResponse(result);
  } catch (err) {
    await reportError({ scope: "api:session-runtime:put" }, err);
    return NextResponse.json({ error: "Failed to save runtime state." }, { status: 500 });
  }
}
