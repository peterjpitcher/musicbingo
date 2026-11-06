import type { Metadata } from "next";
import { AcceptInviteScreen } from "@anchor-nights/kit/auth/screens";

import { acceptInvite } from "@/app/auth/actions";
import { turnstileSiteKey } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Accept your invite | Music Bingo" };
export const dynamic = "force-dynamic";

/** The invite token is in the link's fragment (#t=...), so it never reaches a server log. */
export default function InvitePage(): React.JSX.Element {
  return <AcceptInviteScreen action={acceptInvite} turnstileSiteKey={turnstileSiteKey()} />;
}
