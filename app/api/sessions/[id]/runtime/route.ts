import { NextRequest, NextResponse } from "next/server";

import { getRuntimeState, upsertRuntimeState } from "@/lib/live/sessionRepo";
import { validateRuntimeState } from "@/lib/live/storage";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const state = await getRuntimeState(id);
    if (!state) {
      return NextResponse.json({ error: "Runtime state not found." }, { status: 404 });
    }
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to get runtime state." }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const runtime = validateRuntimeState(body);
    if (!runtime) {
      return NextResponse.json({ error: "Invalid runtime state payload." }, { status: 400 });
    }
    await upsertRuntimeState(id, runtime);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save runtime state." }, { status: 500 });
  }
}
