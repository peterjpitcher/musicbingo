import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const COOKIE_REFRESH = "spotify_refresh_token";
const COOKIE_STATE = "spotify_oauth_state";

export async function POST(_request: NextRequest) {
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

