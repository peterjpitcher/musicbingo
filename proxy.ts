import { createAuthProxy } from "@anchor-nights/kit/auth/proxy";
import { getPublicSupabaseEnv } from "@anchor-nights/kit/env";

/**
 * The session adapter (auth standard section 3; spec M-8). On every request
 * that carries a Supabase session cookie it refreshes the session with
 * getUser(); on the staff pages below it also checks the role from
 * current_staff_role(), sending a signed-out visitor to /login?next=... and an
 * account without access to /pending. If Supabase is down it answers 503
 * instead of a "signed out" loop.
 *
 * Deliberately not listed:
 *   /display/*   the TV, which is never signed in; its one API route checks
 *                the TV link token (or a signed-in host or admin).
 *   /api/*       every route enforces for itself and answers JSON 401, 403 or
 *                503 (lib/auth/routeGuard.ts); lib/auth/routeRegistry.ts lists
 *                each one's protection and a test fails on an unlisted route.
 *   /guest/*     a retired stub page with no data.
 *   the auth pages (/login, /pending, /forgot-password, /auth/*, /invite),
 *                which the kit handles itself.
 */
const { url, anonKey } = getPublicSupabaseEnv();

export const proxy = createAuthProxy({
  supabaseUrl: url,
  supabaseKey: anonKey,
  routes: [
    { prefix: "/admin", roles: ["admin"] },
    { prefix: "/account", roles: ["admin", "host"] },
    { prefix: "/host", roles: ["admin", "host"] },
    { prefix: "/prep", roles: ["admin", "host"] },
    { prefix: "/brands", roles: ["admin", "host"] },
  ],
  homeForRole: { admin: "/host", host: "/host" },
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
