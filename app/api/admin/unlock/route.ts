import { NextRequest, NextResponse } from "next/server";

import { clearAdminCookie, isAdminProtectionEnabled, setAdminCookie } from "@/lib/live/access";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null) as { secret?: unknown } | null;
  const secret = typeof body?.secret === "string" ? body.secret.trim() : "";
  const configured = process.env.APP_ADMIN_SECRET?.trim() ?? "";

  if (isAdminProtectionEnabled() && secret !== configured) {
    return NextResponse.json({ error: "Wrong admin secret." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  setAdminCookie(response);
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearAdminCookie(response);
  return response;
}
