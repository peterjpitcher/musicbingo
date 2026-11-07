import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/routeGuard";
import { readHostDeviceHeader } from "@/lib/live/hostDevice";
import { liveWriteResponse, missingDeviceResponse } from "@/lib/live/liveWriteResponse";
import { controlSession, type ControlAction } from "@/lib/live/sessionRepo";
import { reportError } from "@/lib/reportError";

/**
 * The host console's control lock (spec M-9, S4.3), held in the database:
 *   POST    take control, or keep it (refused while another console was heard from in the last 30 seconds)
 *   PUT     the holder's heartbeat, every 10 seconds
 *   DELETE  let go, so another console can take over at once
 * The console names itself with the x-host-device header (lib/live/hostDevice.ts).
 */
export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

async function handle(action: ControlAction, request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const deviceId = readHostDeviceHeader(request.headers);
    if (!deviceId) return missingDeviceResponse();
    return liveWriteResponse(await controlSession({ action, sessionId: id, deviceId, userId: gate.userId }));
  } catch (err) {
    await reportError({ scope: `api:session-control:${action}` }, err);
    return NextResponse.json({ ok: false, error: "Could not reach the game's control lock." }, { status: 500 });
  }
}

export function POST(request: NextRequest, ctx: RouteParams): Promise<Response> {
  return handle("take", request, ctx);
}

export function PUT(request: NextRequest, ctx: RouteParams): Promise<Response> {
  return handle("heartbeat", request, ctx);
}

export function DELETE(request: NextRequest, ctx: RouteParams): Promise<Response> {
  return handle("release", request, ctx);
}
