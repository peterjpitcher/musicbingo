import "server-only";

import type { NextRequest } from "next/server";
import { isSameOriginRequest, type AppRole } from "@anchor-nights/kit/auth";

import { authHelpers, STAFF_ROLES } from "@/lib/auth/server";
import { hasSessionTokenAccess } from "@/lib/live/access";

/**
 * The one gate in front of every browser-called API route (auth standard
 * sections 6 and 9; spec M-8). proxy.ts protects the pages; these routes
 * enforce for themselves and answer JSON:
 *
 *   401 unauthenticated   no signed-in user
 *   403 unauthorised      signed in, but pending, deactivated or banned
 *   403 cross_origin      a state-changing request from another site
 *   503 service_unavailable  Supabase Auth or the role lookup is down
 *                         (never mistaken for "signed out")
 *
 * The user and role are read again on every request through the kit
 * (getUser() plus current_staff_role()), so a deactivated host loses access
 * at once even with a still-valid token.
 */

export type RouteGate =
  | { ok: true; via: "staff"; userId: string; role: AppRole }
  | { ok: true; via: "display-token" }
  | { ok: false; response: Response };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * The origins a state-changing request may come from: this deployment's own
 * origin (both production hostnames and every preview serve the same app)
 * and NEXT_PUBLIC_APP_URL. A browser always sends Origin on a cross-site
 * POST, PUT or DELETE, so another site cannot pass.
 */
export function allowedOrigins(request: Request): string[] {
  const origins = new Set<string>([new URL(request.url).origin]);
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // A malformed value fails the build (lib/buildEnv.mjs); ignore it here.
    }
  }
  return [...origins];
}

/** A signed-in host or admin. State-changing methods must also be same-origin. */
export async function requireStaff(request: Request, roles: readonly AppRole[] = STAFF_ROLES): Promise<RouteGate> {
  if (!SAFE_METHODS.has(request.method.toUpperCase()) && !isSameOriginRequest(request.headers, allowedOrigins(request))) {
    return { ok: false, response: json(403, "cross_origin") };
  }
  let result: Awaited<ReturnType<ReturnType<typeof authHelpers>["authoriseRoute"]>>;
  try {
    result = await authHelpers().authoriseRoute(roles);
  } catch {
    // Missing auth settings or a client that could not be built: fail closed.
    return { ok: false, response: json(503, "service_unavailable") };
  }
  if (!result.ok) return { ok: false, response: result.response };
  return { ok: true, via: "staff", userId: result.user.id, role: result.role };
}

/**
 * The TV's own routes: a valid TV link token for this session (the cookie the
 * link set), or else a signed-in host or admin (the laptop's Open Display).
 */
export async function requireStaffOrDisplayToken(request: NextRequest, sessionId: string): Promise<RouteGate> {
  if (hasSessionTokenAccess(request, sessionId, "display")) return { ok: true, via: "display-token" };
  return requireStaff(request);
}
