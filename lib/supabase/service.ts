import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * The service-role client every game, venue and error route uses. It bypasses
 * RLS, so it only ever runs on the server, after the route's own gate
 * (lib/auth/routeGuard.ts). Staff sign-in uses the public key instead
 * (lib/supabase/server.ts); the kit's admin actions reach this one through
 * lib/supabase/admin.ts.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) throw new Error("Missing env var: SUPABASE_URL");
  if (!key) throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");

  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}
