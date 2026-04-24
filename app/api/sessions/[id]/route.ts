import { NextRequest, NextResponse } from "next/server";

import { deleteSession, getSession } from "@/lib/live/sessionRepo";
import { resolveBrandConfig } from "@/lib/brands/brandRepo";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const brand = await resolveBrandConfig(session.brandId ?? null);
    return NextResponse.json({ ...session, brand }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to get session." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSession(id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to delete session." }, { status: 500 });
  }
}
