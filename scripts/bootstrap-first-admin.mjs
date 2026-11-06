#!/usr/bin/env node

/**
 * Prints a one-time invite link that makes the first Music Bingo admin
 * (spec M-8). Sign-up is invite-only and the Staff page needs an admin, so
 * the very first admin has to be invited from outside the app; after that,
 * admins invite everyone else from /admin and this script refuses to run.
 *
 *   node --env-file=.env.local scripts/bootstrap-first-admin.mjs --email someone@example.com
 *
 * What it does, with the service-role key (never a password):
 *   1. Refuses if any active admin already exists (exit 1: use /admin).
 *   2. Creates a 7-day admin invite through public.kit_issue_invite, exactly
 *      as the kit's Staff page does: a random 32-byte token, only its SHA-256
 *      hash stored, any older pending invite for that address cancelled.
 *   3. Records an `invite_sent` row in public.auth_audit.
 *   4. Prints the link, `${NEXT_PUBLIC_APP_URL}/invite#t=<token>`. The token is
 *      in the fragment, so it never reaches a server log. The person opens it,
 *      passes the CAPTCHA and sets their own password.
 *
 * Needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * and NEXT_PUBLIC_APP_URL. Nobody's address is built in: pass --email.
 *
 * Output is one JSON object on stdout. Exit codes: 0 link printed, 1 refused
 * (an admin exists, or the address already has an account), 2 broken (bad
 * arguments, missing settings, database error), 3 not used.
 */

import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const APP = "music-bingo";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv) {
  const args = { email: null, environment: "production" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email") args.email = argv[++i] ?? null;
    else if (arg.startsWith("--email=")) args.email = arg.slice("--email=".length);
    else if (arg === "--environment") args.environment = argv[++i] ?? "";
    else if (arg.startsWith("--environment=")) args.environment = arg.slice("--environment=".length);
    else return { error: `Unknown argument: ${arg}` };
  }
  return args;
}

/**
 * The whole run, with its outside world passed in so it can be tested.
 * Returns { code, result }; never throws.
 */
export async function run({ argv, env, createClient, token = randomBytes(32).toString("base64url") }) {
  const args = parseArgs(argv);
  if (args.error) return { code: 2, result: { ok: false, error: args.error } };
  const email = (args.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) {
    return { code: 2, result: { ok: false, error: "Pass the first admin's address with --email." } };
  }
  if (!/^[a-z]{1,30}$/.test(args.environment)) {
    return { code: 2, result: { ok: false, error: "--environment must be a short word such as production or preview." } };
  }

  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const appUrl = (env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  const missing = [
    !url && "SUPABASE_URL",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !appUrl && "NEXT_PUBLIC_APP_URL",
  ].filter(Boolean);
  if (missing.length) return { code: 2, result: { ok: false, error: `Missing settings: ${missing.join(", ")}.` } };
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) throw new Error("not https");
  } catch {
    return { code: 2, result: { ok: false, error: "NEXT_PUBLIC_APP_URL must be an https address." } };
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    // 1. Is there already an active admin? The role column alone is not
    // enough: a deactivated, banned or deleted admin does not count.
    const { data: admins, error: adminsError } = await db
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .is("deactivated_at", null);
    if (adminsError) throw new Error(`profiles read failed: ${adminsError.code ?? adminsError.message}`);
    for (const row of admins ?? []) {
      const { data: role, error } = await db.rpc("kit_staff_role_for", { p_user: row.id });
      if (error) throw new Error(`role check failed: ${error.code ?? error.message}`);
      if (role === "admin") {
        return {
          code: 1,
          result: { ok: false, refused: "admin_exists", message: "An active admin already exists. Invite people from the Staff page (/admin) instead." },
        };
      }
    }

    // 2. The invite, exactly as the kit's issueInvite makes it.
    const { data, error } = await db.rpc("kit_issue_invite", {
      p_email: email,
      p_role: "admin",
      p_token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
      p_invited_by: null,
      p_ttl_seconds: INVITE_TTL_SECONDS,
    });
    if (error) {
      const text = `${error.message ?? ""} ${error.details ?? ""}`;
      if (text.includes("kit_invite_account_exists")) {
        return { code: 1, result: { ok: false, refused: "account_exists", message: "That address already has an account. Make it an admin from the database instead, or use another address." } };
      }
      if (text.includes("kit_invite_in_progress")) {
        return { code: 1, result: { ok: false, refused: "invite_in_progress", message: "That address is accepting an invite right now. Try again in a few minutes." } };
      }
      throw new Error(`invite failed: ${error.code ?? error.message}`);
    }
    const invite = Array.isArray(data) ? data[0] : data;
    if (!invite?.id) throw new Error("invite failed: no row returned");

    // 3. The audit row. A failed write is reported but does not void the link.
    const { error: auditError } = await db.from("auth_audit").insert({
      app: APP,
      environment: args.environment,
      event: "invite_sent",
      outcome: "success",
      reason: "bootstrap_first_admin",
      target_email: email,
      details: { role: "admin", delivery: "bootstrap_script", replaced: invite.cancelled ?? 0 },
    });

    return {
      code: 0,
      result: {
        ok: true,
        email,
        role: "admin",
        expiresAt: invite.expires_at,
        inviteUrl: `${appUrl}/invite#t=${token}`,
        audited: !auditError,
        next: "Send the link privately. It works once, for 7 days; the person sets their own password.",
      },
    };
  } catch (err) {
    return { code: 2, result: { ok: false, error: err instanceof Error ? err.message : String(err) } };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { createClient } = await import("@supabase/supabase-js");
  const { code, result } = await run({ argv: process.argv.slice(2), env: process.env, createClient });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(code);
}
