import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createAdminActions,
  createAuthHelpers,
  defineAuthConfig,
  readAuthEnv,
  type AppRole,
  type AdminActions,
  type AuthAlert,
  type AuthConfig,
  type AuthDeps,
  type AuthHelpers,
} from "@anchor-nights/kit/auth";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/reportError";

/**
 * Music Bingo's staff sign-in, built on @anchor-nights/kit/auth (spec M-8,
 * auth standard v2.3). Roles come from public.profiles.role ('admin', 'host'
 * or 'pending'); the kit reads them through current_staff_role(), which also
 * applies the active-identity gate (deactivated, banned or deleted means no
 * role). Everything here is built lazily so importing it never reads the
 * environment: readAuthEnv() throws, naming each missing variable, the first
 * time a page, action or route actually needs it.
 */

export const AUTH_APP_NAME = "music-bingo";

/** Both roles run nights; only admins manage staff. */
export const STAFF_ROLES: readonly AppRole[] = Object.freeze(["admin", "host"]);
export const ADMIN_ROLES: readonly AppRole[] = Object.freeze(["admin"]);

/** Where each role lands after signing in: the games list. */
export const HOME_FOR_ROLE: Readonly<Record<AppRole, string>> = Object.freeze({ admin: "/host", host: "/host" });

/**
 * Every alert is reported to the error sink (app_errors). A 'high' one (a
 * sign-in with no CAPTCHA token, an orphaned invite user) is marked so in the
 * scope, so it stands out in the list.
 */
async function alert(a: AuthAlert): Promise<void> {
  await reportError({ scope: `auth:${a.severity === "high" ? "HIGH:" : ""}${a.kind}` }, new Error(a.message));
}

let config: AuthConfig | null = null;

export function authConfig(): AuthConfig {
  if (config) return config;
  const env = readAuthEnv();
  config = defineAuthConfig({
    app: AUTH_APP_NAME,
    environment: process.env.VERCEL_ENV ?? "development",
    appUrl: env.NEXT_PUBLIC_APP_URL,
    auditHmacKey: env.AUDIT_HMAC_KEY,
    homeForRole: HOME_FOR_ROLE,
    alert,
  });
  return config;
}

/** What the kit's actions need: the app's own clients and Next's request APIs. */
export function authDeps(): AuthDeps {
  return { config: authConfig(), serverClient: createClient, adminClient: createAdminClient, cookies, headers };
}

let helpers: AuthHelpers | null = null;

/** getCurrentUser, requireRole (pages) and authoriseRoute (Route Handlers). */
export function authHelpers(): AuthHelpers {
  helpers ??= createAuthHelpers({ config: authConfig(), serverClient: createClient, redirect });
  return helpers;
}

let admin: AdminActions | null = null;

/**
 * The kit's staff management. Every action, and the two lists the admin page
 * reads, re-checks on the server that the caller is an active admin.
 * Music Bingo's profiles table is keyed by `id` (it had none before M-8).
 */
export function adminActions(): AdminActions {
  admin ??= createAdminActions({ ...authDeps(), profileIdColumn: "id" });
  return admin;
}

/** The Turnstile site key for the sign-in, forgot-password, invite and change-password screens. */
export function turnstileSiteKey(): string {
  return readAuthEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}
