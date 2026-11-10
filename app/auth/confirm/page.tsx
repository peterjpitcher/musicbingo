import type { Metadata } from "next";
import { ConfirmRecoveryScreen } from "@anchor-nights/kit/auth/screens";

import { confirmRecovery } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Reset your password | Music Bingo" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ token_hash?: string | string[]; type?: string | string[] }> };

/**
 * Where the emailed reset link lands. Opening it does nothing (link scanners
 * cannot spend it); Continue POSTs, and only type=recovery is accepted.
 */
export default async function ConfirmPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const params = await searchParams;
  return (
    <ConfirmRecoveryScreen
      action={confirmRecovery}
      tokenHash={typeof params.token_hash === "string" ? params.token_hash : undefined}
      type={typeof params.type === "string" ? params.type : undefined}
    />
  );
}
