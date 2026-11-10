import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/routeGuard";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";

export async function GET(request: NextRequest) {
  // Signed-in host or admin only (M-8); the Spotify logic below is unchanged.
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const refresh = request.cookies.get(COOKIE_REFRESH)?.value ?? "";
  return NextResponse.json({ connected: Boolean(refresh) }, { headers: { "Cache-Control": "no-store" } });
}

