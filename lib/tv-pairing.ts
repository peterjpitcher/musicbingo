import "server-only";

import { cookies, headers } from "next/headers";
import { createTvPairing, type TvPairing } from "@anchor-nights/kit/pairing";

import { authConfig } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/reportError";

/**
 * TV pairing from the kit (spec M-9, S3.1). A TV opens /tv and shows a
 * 6-digit code; a signed-in host or admin types it into the host console;
 * the TV then holds a device cookie and /tv finds tonight's game by itself.
 * Admins remove a TV on the staff page.
 *
 * Built on first use, like lib/auth/server.ts, so importing this module
 * never reads the environment. The kit's actions check the signed-in person
 * (current_staff_role) and its database functions check them again
 * (kit_staff_role_for); the device lookups use the service role.
 */
let pairing: TvPairing | null = null;

export function tvPairing(): TvPairing {
  pairing ??= createTvPairing({
    config: authConfig(),
    serverClient: createClient,
    adminClient: createAdminClient,
    cookies,
    headers,
    report: (scope, err) => void reportError({ scope }, err),
  });
  return pairing;
}
