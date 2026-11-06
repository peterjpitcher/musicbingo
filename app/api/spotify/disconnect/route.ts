import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/routeGuard";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";
const COOKIE_STATE = "spotify_oauth_state";

export async function POST(request: NextRequest) {
  // Signed-in host or admin only (M-8); the Spotify logic below is unchanged.
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const secure = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  for (const name of [COOKIE_REFRESH, COOKIE_STATE]) {
    res.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}

