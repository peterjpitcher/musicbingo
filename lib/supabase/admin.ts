import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseClient } from "@/lib/supabase/service";

/**
 * The admin (service-role) client for the kit's auth actions: invites,
 * bans, recovery grants, the audit and the limiter (standard section 2).
 * It is the same client the game routes use, so there is one service-role
 * client in the app, and `server-only` stops it reaching a browser bundle.
 */
export function createAdminClient(): SupabaseClient {
  return getSupabaseClient();
}
