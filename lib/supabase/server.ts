import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicSupabaseEnv } from "@anchor-nights/kit/env";

/**
 * The server client (standard section 2): the public key and the signed-in
 * user's cookie session, so it respects RLS. Used for staff sign-in and the
 * role checks in pages, Server Actions and Route Handlers; never for game
 * data, which stays on the service role.
 */
export async function createClient(): Promise<SupabaseClient> {
  const { url, anonKey } = getPublicSupabaseEnv();
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // A Server Component cannot set cookies. proxy.ts refreshes the
          // session on every request, so nothing is lost here.
        }
      },
    },
  });
}
