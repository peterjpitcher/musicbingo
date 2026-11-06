import type { Metadata } from "next";
import { PendingScreen } from "@anchor-nights/kit/auth/screens";

import { signOut } from "@/app/auth/actions";
import { authHelpers } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Waiting for access | Music Bingo" };
export const dynamic = "force-dynamic";

/** Where a signed-in account with no role lands: pending, deactivated or banned. */
export default async function PendingPage(): Promise<React.JSX.Element> {
  // proxy.ts sends signed-out visitors to /login and staff to /host, so this
  // only renders for an account without access. An outage shows no email.
  const user = await authHelpers().getCurrentUser().catch(() => null);
  return <PendingScreen signOutAction={signOut} email={user?.email ?? null} />;
}
