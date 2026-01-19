import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

export async function GET(request: NextRequest) {
  const refresh = request.cookies.get(COOKIE_REFRESH)?.value ?? "";
  return NextResponse.json({ connected: Boolean(refresh) }, { headers: { "Cache-Control": "no-store" } });
}

