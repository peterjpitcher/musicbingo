import type { Metadata } from "next";
import { SignInScreen } from "@anchor-nights/kit/auth/screens";

import { signIn } from "@/app/auth/actions";
import { turnstileSiteKey } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Sign in | Music Bingo" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/** Staff sign in (invite only). `next` is validated again on the server after sign-in. */
export default async function LoginPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  return (
    <SignInScreen
      action={signIn}
      turnstileSiteKey={turnstileSiteKey()}
      next={next}
    />
  );
}
